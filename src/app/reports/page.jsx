"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MetricTile, Gauge } from "@/components/dashboard/charts";
import { apiGet, apiPost } from "@/lib/apiClient";
import { directoryMap, enrichAttendance, scopeAttendance, applyPhase, parseDate, modeLabel } from "@/lib/attendanceData";
import { matchesPhase } from "@/lib/phase";
import { parseDateTime, scoreNum, correctNum, wrongNum, accuracy } from "@/lib/assessments";
import { seesAllStudents, roleLabel, sameDept } from "@/lib/roles";
import {
  downloadStudentReportPdf,
  downloadStudentReportExcel,
  downloadDepartmentExcel,
  downloadDepartmentPdf,
  downloadAllReportsZip,
} from "@/lib/reportExports";
import { cn } from "@/lib/utils";

const FIELD = "h-10 rounded-full border border-border bg-surface px-4 text-sm text-foreground focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30";
const ALLOWED = new Set(["PT_AI_READY_2027", "PT_IT_2027", "PT_NON_IT_2027"]);
const SCOPE_LABEL = "Phase 1 · 01 Jul 2026 – 17 Jul 2026";
const SQL_RE = /sql/i;
const upper = (s) => (s || "").trim().toUpperCase();
const inPhase1 = (d) => matchesPhase("phase1", d);
const isPre = (t) => /pre[\s-]*assessment/i.test(t || "");
const num = (v) => Math.round(Number(v) || 0);

function tone(p) {
  if (p >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (p >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-500";
}

/** Per-mode + by-day breakdown from a (phase-filtered) attendance row. */
function attDetail(row) {
  const modes = {};
  const byDate = new Map();
  for (const s of row?.attendance || []) {
    const m = (modes[s.mode] = modes[s.mode] || { present: 0, total: 0 });
    m.total += 1;
    if (s.status === "present") m.present += 1;
    const d = byDate.get(s.date) || { date: s.date };
    d[s.mode] = s.status;
    byDate.set(s.date, d);
  }
  const pack = (m) => ({ present: m?.present || 0, total: m?.total || 0, percent: m?.total ? Math.round((m.present / m.total) * 100) : 0 });
  const days = [...byDate.values()]
    .sort((a, b) => parseDate(a.date) - parseDate(b.date))
    .map((d) => ({ date: d.date, light: d.lightmode || "", bright: d.brightmode || "" }));
  return {
    present: row?.present || 0,
    absent: row?.absent || 0,
    total: row?.total || 0,
    percent: row?.percent || 0,
    workingDays: days.length,
    light: pack(modes.lightmode),
    bright: pack(modes.brightmode),
    days,
  };
}

// `tests` is the FULL catalog per student (each row has an `attempted` flag);
// summaries count/average only the attempted ones.
function aptSummary(tests) {
  const done = tests.filter((t) => t.attempted);
  const taken = done.length;
  const avgScore = taken ? done.reduce((s, t) => s + t.score, 0) / taken : 0;
  const avgAccuracy = taken ? Math.round(done.reduce((s, t) => s + t.accuracy, 0) / taken) : 0;
  const pre = done.find((t) => t.kind === "Pre");
  const grands = done.filter((t) => t.kind === "Grand");
  return {
    tests,
    taken,
    avgScore: Math.round(avgScore * 10) / 10,
    avgAccuracy,
    preScore: pre ? pre.score : null,
    grandAvg: grands.length ? Math.round((grands.reduce((s, t) => s + t.score, 0) / grands.length) * 10) / 10 : null,
  };
}

/** Coding / SQL summary; `tests` is the full catalog, attempted-only averaged. */
function codeSummary(tests) {
  const done = tests.filter((t) => t.attempted);
  const taken = done.length;
  const avgOverall = taken ? Math.round(done.reduce((s, t) => s + t.overall, 0) / taken) : 0;
  return { tests, taken, avgOverall };
}

export default function ReportsPage() {
  const { user } = useAuth();

  const [directory, setDirectory] = useState([]);
  const [roster, setRoster] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [attRows, setAttRows] = useState(null);
  const [apt, setApt] = useState({ catalog: [], scores: new Map() }); // catalog + torii→(id→score)
  const [code, setCode] = useState({ catalog: [], scores: new Map() });
  const [loading, setLoading] = useState(true);

  const [deptF, setDeptF] = useState("all");
  const [batchF, setBatchF] = useState("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null); // report shown in modal
  const [zip, setZip] = useState(null); // { done, total } while building the reports zip

  const seesAll = user ? seesAllStudents(user) : false;

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [dir, ros, cbs, batchList, daily, grand] = await Promise.all([
          apiGet("/students").then((r) => r.students || []).catch(() => []),
          apiGet("/roster").then((r) => r.roster || []).catch(() => []),
          apiGet("/custom-batches").then((r) => r.batches || []).catch(() => []),
          apiGet("/attendance/batches").then((r) => r.batches || []).catch(() => []),
          apiGet("/assessments?type=daily").then((r) => r.assessments || []).catch(() => []),
          apiGet("/assessments?type=grand").then((r) => r.assessments || []).catch(() => []),
        ]);
        if (cancel) return;
        setDirectory(dir);
        setRoster(ros);
        setCohorts(cbs);

        // Attendance across all batches, Phase-1 only.
        const dm = directoryMap(dir);
        for (const r of ros) if (r.torii) dm.set(upper(r.torii), r);
        const all = [];
        await Promise.all(
          batchList.map(async (b) => {
            try {
              const res = await apiPost("/attendance", { batch_id: b.id });
              for (const row of enrichAttendance(res.result || [], dm)) all.push({ ...row, batchName: b.name });
            } catch { /* skip */ }
          }),
        );
        const phased = applyPhase(all, inPhase1).filter((r) => r.total > 0);
        if (!cancel) setAttRows(phased);

        // Aptitude catalog (all Phase-1 daily+grand tests) + per-student scores.
        const aptCatalog = [...daily, ...grand]
          .filter((a) => a.batchList?.some((x) => ALLOWED.has(x)) && inPhase1(a.start))
          .map((a) => {
            const meta = parseDateTime(a.start);
            return { id: a.id, title: a.title, isGrand: a.isGrand, kind: a.isGrand ? (isPre(a.title) ? "Pre" : "Grand") : "Daily", questions: a.questions || 0, date: meta.dateLabel, ts: meta.ts };
          })
          .sort((x, y) => (x.ts || 0) - (y.ts || 0));
        const aptScores = new Map();
        await Promise.all(
          aptCatalog.map(async (a) => {
            try {
              const d = await apiPost("/assessments/details", { assessment: a.id, type: a.isGrand ? "grand" : "daily" });
              for (const r of d.result || []) {
                const t = upper(r.roll_no);
                if (!t) continue;
                const m = aptScores.get(t) || new Map();
                m.set(a.id, { score: scoreNum(r), correct: correctNum(r), wrong: wrongNum(r), accuracy: accuracy(r) });
                aptScores.set(t, m);
              }
            } catch { /* skip */ }
          }),
        );
        if (!cancel) setApt({ catalog: aptCatalog, scores: aptScores });

        // Coding + SQL catalog (all Phase-1 tests) + per-student scores.
        const codeCatalog = (await apiGet("/coding/tests").then((r) => r.tests || []).catch(() => []))
          .filter((t) => inPhase1(t.start))
          .map((t) => {
            const meta = parseDateTime(t.start);
            return { id: t.id, title: t.name, technology: t.technology, isSql: SQL_RE.test(t.technology), date: meta.dateLabel, ts: meta.ts };
          })
          .sort((x, y) => (x.ts || 0) - (y.ts || 0));
        const codeScores = new Map();
        await Promise.all(
          codeCatalog.map(async (t) => {
            try {
              const rep = await apiPost("/coding/report", { test_id: t.id });
              for (const s of rep.students || []) {
                if (!s.attempted) continue;
                const key = upper(s.roll_no);
                if (!key) continue;
                const m = codeScores.get(key) || new Map();
                m.set(t.id, { mcq: num(s.mcq_percentage), coding: num(s.coding_percentage), overall: num(s.overall_percentage), result: s.overall_result || "—" });
                codeScores.set(key, m);
              }
            } catch { /* skip */ }
          }),
        );
        if (!cancel) setCode({ catalog: codeCatalog, scores: codeScores });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Phone (from the AIRE cohort roster, keyed by Torii) — only source with phones.
  const phoneByTorii = useMemo(() => {
    const m = new Map();
    for (const c of cohorts) for (const s of c.students || []) if (s.torii && s.phone) m.set(upper(s.torii), s.phone);
    return m;
  }, [cohorts]);

  const dirByTorii = useMemo(() => {
    const m = new Map();
    for (const s of directory) if (s.torii) m.set(upper(s.torii), s);
    for (const r of roster) if (r.torii) m.set(upper(r.torii), { ...(m.get(upper(r.torii)) || {}), ...r });
    return m;
  }, [directory, roster]);

  // One report object per student (spine = students with Phase-1 attendance).
  const reports = useMemo(() => {
    if (!attRows) return [];
    const attByTorii = new Map();
    for (const r of attRows) attByTorii.set(upper(r.torii), r);
    const toriis = new Set([...attByTorii.keys(), ...apt.scores.keys(), ...code.scores.keys()]);
    const out = [];
    for (const t of toriis) {
      const attRow = attByTorii.get(t);
      const info = dirByTorii.get(t) || {};
      const att = attDetail(attRow || { attendance: [], present: 0, absent: 0, total: 0, percent: 0 });

      // Every conducted test appears once; the same daily test is duplicated per
      // batch in the source, so collapse by kind+title and keep the attempted copy.
      const aScore = apt.scores.get(t);
      const aptByTitle = new Map();
      for (const c of apt.catalog) {
        const key = `${c.kind}||${c.title}`;
        const sc = aScore?.get(c.id);
        const row = aptByTitle.get(key);
        if (!row) {
          aptByTitle.set(key, { title: c.title, kind: c.kind, questions: c.questions, date: c.date, ts: c.ts, attempted: !!sc, score: sc?.score ?? 0, correct: sc?.correct ?? 0, wrong: sc?.wrong ?? 0, accuracy: sc?.accuracy ?? 0 });
        } else if (sc && (!row.attempted || sc.score > row.score)) {
          // fill in (or upgrade to) the attempted instance
          Object.assign(row, { attempted: true, score: sc.score, correct: sc.correct, wrong: sc.wrong, accuracy: sc.accuracy, date: c.date, ts: c.ts });
        }
      }
      const aptTests = [...aptByTitle.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const cScore = code.scores.get(t);
      const codeAll = code.catalog.map((c) => {
        const sc = cScore?.get(c.id);
        return { title: c.title, technology: c.technology, isSql: c.isSql, date: c.date, ts: c.ts, attempted: !!sc, mcq: sc?.mcq ?? 0, coding: sc?.coding ?? 0, overall: sc?.overall ?? 0, result: sc?.result ?? "Not Attempted" };
      });

      out.push({
        torii: attRow?.torii || t,
        usn: info.usn || "",
        name: attRow?.name || info.name || "",
        branch: attRow?.department || info.department || "",
        batch: attRow?.batchName || info.batch || "",
        phone: phoneByTorii.get(t) || "",
        scopeLabel: SCOPE_LABEL,
        att,
        apt: aptSummary(aptTests),
        coding: codeSummary(codeAll.filter((c) => !c.isSql)),
        sql: codeSummary(codeAll.filter((c) => c.isSql)),
      });
    }
    return out.sort((a, b) => (a.name || a.usn || a.torii).localeCompare(b.name || b.usn || b.torii));
  }, [attRows, apt, code, dirByTorii, phoneByTorii]);

  const deptOptions = useMemo(() => [...new Set(reports.map((r) => r.branch).filter(Boolean))].sort(), [reports]);
  const batchOptions = useMemo(() => [...new Set(reports.map((r) => r.batch).filter(Boolean))].sort(), [reports]);
  const effDept = seesAll ? deptF : user?.department || "all";

  const scoped = useMemo(() => {
    let list = reports;
    if (!seesAll) list = list.filter((r) => sameDept(r.branch, user?.department));
    else if (deptF !== "all") list = list.filter((r) => r.branch === deptF);
    if (batchF !== "all") list = list.filter((r) => r.batch === batchF);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.usn || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q) || (r.torii || "").toLowerCase().includes(q));
    return list;
  }, [reports, seesAll, deptF, batchF, user, query]);

  const summary = useMemo(() => {
    const n = scoped.length;
    const withTests = scoped.filter((r) => r.apt.taken > 0);
    let present = 0, total = 0;
    for (const r of scoped) { present += r.att.present; total += r.att.total; }
    return {
      scopeLabel: SCOPE_LABEL,
      students: n,
      avgAttendance: n ? Math.round(scoped.reduce((s, r) => s + r.att.percent, 0) / n) : 0,
      overallAttendance: total ? Math.round((present / total) * 100) : 0,
      atRisk: scoped.filter((r) => r.att.total > 0 && r.att.percent < 50).length,
      avgScore: withTests.length ? withTests.reduce((s, r) => s + r.apt.avgScore, 0) / withTests.length : 0,
    };
  }, [scoped]);

  const deptTitle = effDept === "all" ? "All departments" : effDept;

  const onDownloadAllReports = async () => {
    if (!scoped.length || zip) return;
    setZip({ done: 0, total: scoped.length });
    try {
      await downloadAllReportsZip(scoped, {
        onProgress: (done, total) => setZip({ done, total }),
        filename: `reports-${(effDept === "all" ? "all" : effDept).replace(/\s+/g, "_")}${batchF !== "all" ? "-" + batchF : ""}.zip`,
      });
    } finally {
      setZip(null);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand/12 via-surface to-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Reports</h2>
            <p className="mt-1.5 max-w-2xl text-sm text-muted">
              A consolidated report card per student — personal details, attendance and assessment scores. Click a student to view or download their report. All figures are for <span className="font-medium text-foreground">Phase 1 (01 Jul – 17 Jul 2026)</span>.
            </p>
          </div>
          <Badge tone="brand">{seesAll ? roleLabel(user.role) : user.department}</Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <select className={FIELD} value={batchF} onChange={(e) => setBatchF(e.target.value)} aria-label="Batch">
          <option value="all">All batches</option>
          {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {seesAll ? (
          <select className={FIELD} value={deptF} onChange={(e) => setDeptF(e.target.value)} aria-label="Department">
            <option value="all">All departments</option>
            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : (
          <Badge tone="neutral">Department · {user.department}</Badge>
        )}
        <div className="relative max-w-xs flex-1">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search USN, name or Torii…" className="h-10 w-full rounded-full border border-border bg-surface px-4 text-sm text-foreground placeholder:text-muted focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted">{scoped.length} students</span>
          {scoped.length > 0 && (
            <>
              <Button size="sm" variant="secondary" onClick={() => downloadDepartmentExcel(deptTitle, scoped)}>⬇ Download Excel</Button>
              <Button size="sm" onClick={() => downloadDepartmentPdf(deptTitle, summary, scoped)}>⬇ Download PDF</Button>
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <Card className="grid place-items-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" /></Card>
      ) : scoped.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">No students to report</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Nothing matches this department/search.</p>
        </Card>
      ) : (
        <>
          {/* Department summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Gauge value={summary.overallAttendance} label="Overall attendance" hint={deptTitle} />
            <MetricTile label="Students" value={summary.students} hint={effDept === "all" ? "All departments" : effDept} accent="sky" />
            <MetricTile label="Avg attendance" value={`${summary.avgAttendance}%`} hint="Mean per student" accent="violet" />
            <MetricTile label="At risk (< 50%)" value={summary.atRisk} hint="Attendance" accent="rose" />
          </div>

          {/* Student table */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Students — {deptTitle}</h3>
                <p className="text-xs text-muted">Click “Show report” for a full report card (view · PDF · Excel).</p>
              </div>
              <Button size="sm" onClick={onDownloadAllReports} disabled={!!zip || scoped.length === 0}>
                {zip ? `Preparing ${zip.done}/${zip.total}…` : "⬇ Download reports"}
              </Button>
            </div>
            <div className="max-h-[65vh] overflow-auto scrollbar-thin">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="sticky top-0 z-10 w-12 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">#</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">USN</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Name</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Branch</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">Attendance</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">Tests</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">Avg Acc.</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scoped.map((r, i) => (
                    <tr key={r.torii || i} onClick={() => setPicked(r)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                      <td className="px-4 py-3 text-muted">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{r.usn || <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-foreground">{r.name || <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">{r.branch ? <Badge tone="neutral">{r.branch}</Badge> : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-center">{r.att.total ? <span className={cn("font-semibold", tone(r.att.percent))}>{r.att.percent}%</span> : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-center text-muted">{r.apt.taken}</td>
                      <td className="px-4 py-3 text-center text-muted">{r.apt.taken ? `${r.apt.avgAccuracy}%` : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setPicked(r); }} className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-brand transition-colors hover:bg-surface-2">
                          Show report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {picked && <StudentReportModal report={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function StudentReportModal({ report, onClose }) {
  const a = report.att;
  const ap = report.apt;
  const stat = (st) =>
    st ? (
      <span className={cn("inline-flex min-w-[4rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", st === "present" ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400" : "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400")}>{st === "present" ? "Present" : "Absent"}</span>
    ) : <span className="text-muted">—</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-card-hover sm:rounded-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-brand to-brand-700 px-6 py-5 text-white">
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-white/80 hover:bg-white/15">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">Student Report · {report.scopeLabel}</p>
          <div className="mt-1 flex items-center gap-3">
            <h3 className="text-xl font-bold">{report.name || report.usn || "Student"}</h3>
          </div>
          <p className="mt-0.5 text-sm text-white/85">
            {[report.usn, report.branch, report.batch].filter(Boolean).join("  ·  ")}
            {report.phone ? `  ·  ${report.phone}` : ""}
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-6 scrollbar-thin">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile label="Attendance" value={`${a.percent}%`} hint={`${a.present}/${a.total} sessions`} accent="brand" />
            <MetricTile label="Working days" value={a.workingDays} hint="In phase" accent="violet" />
            <MetricTile label="Assessments" value={ap.taken} hint="Attempted" accent="emerald" />
            <MetricTile label="Avg accuracy" value={`${ap.avgAccuracy}%`} hint={`avg score ${ap.avgScore}`} accent="sky" />
          </div>

          {/* Attendance */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Attendance</h4>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Session mode</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">Present</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">Total</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[["Light Mode", a.light], ["Bright Mode", a.bright], ["Overall", a]].map(([label, m]) => (
                    <tr key={label}>
                      <td className="px-4 py-2.5 font-medium text-foreground">{label}</td>
                      <td className="px-4 py-2.5 text-center text-muted">{m.present}</td>
                      <td className="px-4 py-2.5 text-center text-muted">{m.total}</td>
                      <td className={cn("px-4 py-2.5 text-right font-semibold", tone(m.percent))}>{m.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {a.days.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-border scrollbar-thin">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Date</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">{modeLabel("lightmode")}</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">{modeLabel("brightmode")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {a.days.map((d) => (
                      <tr key={d.date}>
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-foreground">{d.date}</td>
                        <td className="px-4 py-2 text-center">{stat(d.light)}</td>
                        <td className="px-4 py-2 text-center">{stat(d.bright)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Aptitude — segregated into Pre-Assessment / Daily / Grand */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Aptitude</h4>
            {ap.tests.length === 0 ? (
              <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">No aptitude tests conducted in this phase.</p>
            ) : (
              <div className="space-y-3">
                <AptGroup label="Pre-Assessment" rows={ap.tests.filter((t) => t.kind === "Pre")} />
                <AptGroup label="Daily Tests" rows={ap.tests.filter((t) => t.kind === "Daily")} />
                <AptGroup label="Grand Tests" rows={ap.tests.filter((t) => t.kind === "Grand")} />
              </div>
            )}
          </section>

          {/* Coding */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Coding <span className="text-xs font-normal text-muted">· {report.coding.taken} attempted{report.coding.taken ? ` · avg ${report.coding.avgOverall}%` : ""}</span></h4>
            <CodeGroup rows={report.coding.tests} empty="No coding tests conducted in this phase." />
          </section>

          {/* SQL */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-foreground">SQL <span className="text-xs font-normal text-muted">· {report.sql.taken} attempted{report.sql.taken ? ` · avg ${report.sql.avgOverall}%` : ""}</span></h4>
            <CodeGroup rows={report.sql.tests} empty="No SQL tests conducted in this phase." />
          </section>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="secondary" size="sm" onClick={() => downloadStudentReportExcel(report)}>⬇ Excel</Button>
          <Button size="sm" onClick={() => downloadStudentReportPdf(report)}>⬇ Download PDF</Button>
        </div>
      </div>
    </div>
  );
}

const TH = "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted";

/** A labelled aptitude sub-table (Pre / Daily / Grand). */
function AptGroup({ label, rows }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand">{label}</p>
      <div className="overflow-x-auto rounded-xl border border-border scrollbar-thin">
        <table className="w-full min-w-[460px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th className={TH}>Assessment</th>
              <th className={cn(TH, "text-center")}>Score</th>
              <th className={cn(TH, "text-center")}>Correct</th>
              <th className={cn(TH, "text-center")}>Wrong</th>
              <th className={cn(TH, "text-right")}>Accuracy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((t, i) => (
              <tr key={i} className={cn(!t.attempted && "opacity-60")}>
                <td className="px-4 py-2.5 text-foreground">{t.title}</td>
                <td className="px-4 py-2.5 text-center font-semibold text-foreground">{t.attempted ? t.score : "—"}</td>
                <td className="px-4 py-2.5 text-center text-muted">{t.attempted ? t.correct : "—"}</td>
                <td className="px-4 py-2.5 text-center text-muted">{t.attempted ? t.wrong : "—"}</td>
                <td className={cn("px-4 py-2.5 text-right font-semibold", t.attempted ? tone(t.accuracy) : "text-muted")}>{t.attempted ? `${t.accuracy}%` : "Not Attempted"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Coding / SQL results table (MCQ % · Coding % · Overall % · Result). */
function CodeGroup({ rows, empty }) {
  if (!rows.length) return <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border scrollbar-thin">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2 text-left">
            <th className={TH}>Test</th>
            <th className={cn(TH, "text-center")}>MCQ %</th>
            <th className={cn(TH, "text-center")}>Coding %</th>
            <th className={cn(TH, "text-right")}>Accuracy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t, i) => (
            <tr key={i} className={cn(!t.attempted && "opacity-60")}>
              <td className="px-4 py-2.5 text-foreground">{t.title}</td>
              <td className="px-4 py-2.5 text-center text-muted">{t.attempted ? `${t.mcq}%` : "—"}</td>
              <td className="px-4 py-2.5 text-center text-muted">{t.attempted ? `${t.coding}%` : "—"}</td>
              <td className={cn("px-4 py-2.5 text-right font-semibold", t.attempted ? tone(t.overall) : "text-muted")}>{t.attempted ? `${t.overall}%` : "Not Attempted"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
