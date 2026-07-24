"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useStudentStatus } from "@/components/students/StudentStatusProvider";
import { usePhase } from "@/components/layout/PhaseProvider";
import { PhaseSelect } from "@/components/layout/PhaseSelect";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MetricTile, Gauge } from "@/components/dashboard/charts";
import { apiGet, apiPost } from "@/lib/apiClient";
import {
  directoryMap,
  enrichAttendance,
  scopeAttendance,
  applyPhase,
  studentDayWise,
  parseDate,
  modeLabel,
} from "@/lib/attendanceData";
import { seesAllStudents, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const FIELD =
  "h-10 rounded-full border border-border bg-surface px-4 text-sm text-foreground focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30";

// Twelve attendance bands, best → worst. Colour is a quality ramp (green → red)
// and is always paired with the range label + count, so it's never the sole cue.
const BUCKETS = [
  { key: "b100", label: "100%", lo: 100, hi: 100, color: "#166534" },
  { key: "b90", label: "90–99%", lo: 90, hi: 99, color: "#15803d" },
  { key: "b80", label: "80–89%", lo: 80, hi: 89, color: "#16a34a" },
  { key: "b70", label: "70–79%", lo: 70, hi: 79, color: "#22c55e" },
  { key: "b60", label: "60–69%", lo: 60, hi: 69, color: "#84cc16" },
  { key: "b50", label: "50–59%", lo: 50, hi: 59, color: "#eab308" },
  { key: "b40", label: "40–49%", lo: 40, hi: 49, color: "#f59e0b" },
  { key: "b30", label: "30–39%", lo: 30, hi: 39, color: "#f97316" },
  { key: "b20", label: "20–29%", lo: 20, hi: 29, color: "#ef4444" },
  { key: "b10", label: "10–19%", lo: 10, hi: 19, color: "#dc2626" },
  { key: "b1", label: "1–9%", lo: 1, hi: 9, color: "#b91c1c" },
  { key: "b0", label: "0%", lo: 0, hi: 0, color: "#7f1d1d" },
];

export default function PremiumAnalyticsPage() {
  const { user } = useAuth();
  const { isActive, activeOnly, setActiveOnly } = useStudentStatus();
  const { phase, matches } = usePhase();

  const [rows, setRows] = useState(null); // enriched attendance across all batches
  const [cohorts, setCohorts] = useState([]); // custom cohorts (e.g. AIRE Batch - III Year)
  const [loading, setLoading] = useState(true);

  const [batchF, setBatchF] = useState("all");
  const [deptF, setDeptF] = useState("all");
  const [selected, setSelected] = useState(null); // bucket key
  const [picked, setPicked] = useState(null); // student for detail modal

  // Load directory + roster + attendance for every batch once.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [dir, ros, batches, cbs] = await Promise.all([
          apiGet("/students").then((r) => r.students || []).catch(() => []),
          apiGet("/roster").then((r) => r.roster || []).catch(() => []),
          apiGet("/batches").then((r) => r.batches || []).catch(() => []),
          apiGet("/custom-batches").then((r) => r.batches || []).catch(() => []),
        ]);
        if (cancel) return;
        setCohorts(cbs);
        const dm = directoryMap(dir);
        for (const r of ros) if (r.torii) dm.set((r.torii || "").trim().toUpperCase(), r);
        const all = [];
        await Promise.all(
          batches.map(async (b) => {
            try {
              const res = await apiPost("/attendance", { batch_id: b.id });
              for (const row of enrichAttendance(res.result || [], dm)) all.push({ ...row, batchName: b.name });
            } catch { /* skip a batch that errors */ }
          }),
        );
        if (!cancel) setRows(all);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const scoped = useMemo(() => {
    if (!rows || !user) return [];
    let s = scopeAttendance(user, rows);
    if (activeOnly) s = s.filter((r) => isActive(r.torii));
    if (phase !== "all") s = applyPhase(s, matches);
    return s;
  }, [rows, user, activeOnly, isActive, phase, matches]);

  // Reset the open band when the phase changes (its members change).
  useEffect(() => { setSelected(null); }, [phase]);

  const all = user ? seesAllStudents(user) : false;
  const batchOptions = useMemo(() => [...new Set(scoped.map((r) => r.batchName).filter(Boolean))].sort(), [scoped]);
  const deptOptions = useMemo(() => [...new Set(scoped.map((r) => r.department).filter(Boolean))].sort(), [scoped]);

  // A cohort filters by its Torii set (its members span the real batches).
  const cohortRolls = useMemo(() => {
    if (!batchF.startsWith("cohort:")) return null;
    const c = cohorts.find((x) => `cohort:${x.slug}` === batchF);
    return c ? new Set((c.rolls || []).map((t) => (t || "").toUpperCase())) : new Set();
  }, [batchF, cohorts]);

  const filtered = useMemo(
    () =>
      scoped
        .filter((r) => (batchF === "all" ? true : cohortRolls ? cohortRolls.has((r.torii || "").toUpperCase()) : r.batchName === batchF))
        .filter((r) => (deptF === "all" ? true : r.department === deptF)),
    [scoped, batchF, deptF, cohortRolls],
  );

  // Only students with recorded sessions are placed in a band.
  const tracked = useMemo(() => filtered.filter((r) => r.total > 0), [filtered]);
  const untracked = filtered.length - tracked.length;

  const grouped = useMemo(
    () => BUCKETS.map((b) => ({ ...b, students: tracked.filter((r) => r.percent >= b.lo && r.percent <= b.hi) })),
    [tracked],
  );
  const maxCount = useMemo(() => Math.max(1, ...grouped.map((g) => g.students.length)), [grouped]);

  const stats = useMemo(() => {
    let present = 0;
    let total = 0;
    for (const r of tracked) { present += r.present; total += r.total; }
    const avg = tracked.length ? Math.round(tracked.reduce((s, r) => s + r.percent, 0) / tracked.length) : 0;
    const perfect = tracked.filter((r) => r.percent === 100).length;
    const atRisk = tracked.filter((r) => r.percent < 50).length;
    return {
      students: tracked.length,
      overall: total ? Math.round((present / total) * 100) : 0,
      avg,
      perfect,
      atRisk,
    };
  }, [tracked]);

  const selectedBucket = useMemo(() => grouped.find((g) => g.key === selected) || null, [grouped, selected]);
  const batchFLabel = batchF === "all"
    ? "All batches"
    : batchF.startsWith("cohort:")
      ? cohorts.find((c) => `cohort:${c.slug}` === batchF)?.name || "Cohort"
      : batchF;
  const scopeLabel = `${batchFLabel} · ${deptF === "all" ? "All departments" : deptF}`;

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand/12 via-surface to-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2 9.2 8.6 2 9.3l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7 5.5-4.7-7.2-.7L12 2Z" /></svg>
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Premium Analytics</h2>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-muted">
              Every student sorted into twelve attendance bands. Filter by batch and department, click any band to see who&apos;s in it, then open a student for their full day-by-day record.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-border p-0.5 text-xs">
              <button type="button" onClick={() => setActiveOnly(true)} className={cn("rounded-full px-3 py-1.5 font-medium transition-colors", activeOnly ? "bg-brand/10 text-brand" : "text-muted hover:text-foreground")}>Active only</button>
              <button type="button" onClick={() => setActiveOnly(false)} className={cn("rounded-full px-3 py-1.5 font-medium transition-colors", !activeOnly ? "bg-brand/10 text-brand" : "text-muted hover:text-foreground")}>All</button>
            </div>
            <Badge tone="brand">{roleLabel(user.role)}</Badge>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <PhaseSelect onChange={() => setSelected(null)} />
        <select className={FIELD} value={batchF} onChange={(e) => { setBatchF(e.target.value); setSelected(null); }}>
          <option value="all">All batches</option>
          {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          {cohorts.length > 0 && (
            <optgroup label="Custom cohorts">
              {cohorts.map((c) => <option key={c.slug} value={`cohort:${c.slug}`}>{c.name}</option>)}
            </optgroup>
          )}
        </select>
        {all && (
          <select className={FIELD} value={deptF} onChange={(e) => { setDeptF(e.target.value); setSelected(null); }}>
            <option value="all">All departments</option>
            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {(batchF !== "all" || deptF !== "all") && (
          <button type="button" onClick={() => { setBatchF("all"); setDeptF("all"); setSelected(null); }} className="text-sm font-medium text-brand hover:underline">Reset</button>
        )}
        <span className="ml-auto text-sm text-muted">{tracked.length} students{untracked > 0 ? ` · ${untracked} untracked` : ""}</span>
      </Card>

      {loading ? (
        <Card className="grid place-items-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" /></Card>
      ) : tracked.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">No attendance to analyse</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Nothing matches this batch/department selection yet.</p>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Gauge value={stats.overall} label="Overall attendance" hint={scopeLabel} />
            <MetricTile label="Students tracked" value={stats.students} hint="With recorded sessions" accent="sky" />
            <MetricTile label="Perfect (100%)" value={stats.perfect} hint="Never missed a session" accent="emerald" />
            <MetricTile label="At risk (< 50%)" value={stats.atRisk} hint="Need intervention" accent="rose" />
          </div>

          {/* Bucket grid */}
          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Attendance bands</h3>
                <p className="text-sm text-muted">Click a band to list its students. Bar length shows the band&apos;s share of the group.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {grouped.map((g) => {
                const isSel = selected === g.key;
                const share = tracked.length ? Math.round((g.students.length / tracked.length) * 100) : 0;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setSelected(isSel ? null : g.key)}
                    disabled={g.students.length === 0}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all",
                      isSel ? "border-brand ring-2 ring-brand/30" : "border-border hover:border-brand/40 hover:shadow-card-hover",
                      g.students.length === 0 && "opacity-50",
                    )}
                  >
                    <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: g.color }} />
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold tabular-nums text-foreground">{g.students.length}</span>
                      <span className="text-xs font-medium text-muted">{share}%</span>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{g.label}</p>
                    <p className="text-[11px] text-muted">student{g.students.length === 1 ? "" : "s"}</p>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${(g.students.length / maxCount) * 100}%`, backgroundColor: g.color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected band → student list */}
          {selectedBucket && (
            <BucketPanel
              bucket={selectedBucket}
              scopeLabel={scopeLabel}
              onClose={() => setSelected(null)}
              onPick={(s) => setPicked(s)}
            />
          )}
        </>
      )}

      {picked && <StudentAttendanceModal student={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

/** Students inside one band: searchable table + Excel/PDF, click a row for detail. */
function BucketPanel({ bucket, scopeLabel, onClose, onPick }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t
      ? bucket.students.filter((s) => (s.torii || "").toLowerCase().includes(t) || (s.name || "").toLowerCase().includes(t) || (s.usn || "").toLowerCase().includes(t))
      : bucket.students;
    return [...base].sort((a, b) => b.percent - a.percent || (a.name || "").localeCompare(b.name || ""));
  }, [bucket.students, q]);

  const fileBase = `attendance-${bucket.label.replace(/[^0-9]/g, "") || "0"}pct`;
  const head = ["Torii Number", "USN", "Name", "Department", "Batch", "Present", "Total", "Attendance %"];
  const body = () => list.map((s) => [s.torii, s.usn || "", s.name || "", s.department || "", s.batchName || "", s.present, s.total, s.percent]);

  const onExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...body()]), "Students");
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  };
  const onPdf = async () => {
    const { downloadTablePdf } = await import("@/lib/pdf");
    await downloadTablePdf({
      title: `Attendance ${bucket.label}`,
      subtitle: `${scopeLabel} · ${list.length} students`,
      sections: [{ head, body: body().map((r) => r.map(String)), columnStyles: { 2: { halign: "left" } } }],
      orientation: "l",
      filename: `${fileBase}.pdf`,
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: bucket.color }} />
          <div>
            <h3 className="text-sm font-semibold text-foreground">{bucket.label} attendance · {bucket.students.length} student{bucket.students.length === 1 ? "" : "s"}</h3>
            <p className="text-xs text-muted">{scopeLabel} · click a student for their full record</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-44 rounded-full border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <Button size="sm" variant="secondary" onClick={onExcel}>⬇ Excel</Button>
          <Button size="sm" onClick={onPdf}>⬇ PDF</Button>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto scrollbar-thin">
        {list.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No students match your search.</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left">
                <th className="sticky top-0 z-10 w-12 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">#</th>
                <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Torii Number</th>
                <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Name</th>
                <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Department</th>
                <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Batch</th>
                <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">Sessions</th>
                <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((s, i) => (
                <tr key={s.torii || i} onClick={() => onPick(s)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{s.torii}</td>
                  <td className="px-4 py-3 text-foreground">{s.name || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3">{s.department ? <Badge tone="neutral">{s.department}</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-muted">{s.batchName || "—"}</td>
                  <td className="px-4 py-3 text-center text-muted">{s.present}/{s.total}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold tabular-nums" style={{ color: bucket.color }}>{s.percent}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

/** One student's full record: a date is a column with Light/Bright sub-columns. */
function StudentAttendanceModal({ student, onClose }) {
  const { modes, days } = useMemo(() => studentDayWise(student), [student]);
  const ordered = useMemo(() => [...days].sort((a, b) => parseDate(a.date) - parseDate(b.date)), [days]);

  const cell = (st) =>
    st ? (
      <span className={cn(
        "inline-flex min-w-[4.25rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        st === "present"
          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
          : "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
      )}>{st === "present" ? "Present" : "Absent"}</span>
    ) : <span className="text-muted">—</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-card-hover sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{student.name || student.torii}</h3>
            <p className="text-xs text-muted">
              <span className="font-mono">{student.torii}</span>
              {student.usn ? ` · ${student.usn}` : ""}
              {student.department ? ` · ${student.department}` : ""}
              {student.batchName ? ` · ${student.batchName}` : ""}
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground/80">
              {ordered.length} day{ordered.length === 1 ? "" : "s"} · {student.present}/{student.total} sessions present ({student.percent}%)
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin">
          {ordered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No attendance records.</p>
          ) : (
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky left-0 top-0 z-20 border-b border-r border-border bg-surface-2 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Student</th>
                  {ordered.map((d) => (
                    <th key={d.date} colSpan={modes.length} className="whitespace-nowrap border-b border-l border-border bg-surface-2 px-3 py-2 text-center text-xs font-semibold text-foreground">{d.date}</th>
                  ))}
                </tr>
                <tr>
                  {ordered.map((d) =>
                    modes.map((m) => (
                      <th key={`${d.date}-${m}`} className="whitespace-nowrap border-b border-l border-border bg-surface-2 px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted">{modeLabel(m)}</th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-surface px-4 py-3 text-left font-medium text-foreground">{student.name || student.torii}</th>
                  {ordered.map((d) =>
                    modes.map((m) => (
                      <td key={`${d.date}-${m}`} className="border-l border-border px-3 py-3 text-center">{cell(d.cells[m])}</td>
                    )),
                  )}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
