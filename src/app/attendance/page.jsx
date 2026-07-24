"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useStudentStatus } from "@/components/students/StudentStatusProvider";
import { usePhase } from "@/components/layout/PhaseProvider";
import { PhaseSelect } from "@/components/layout/PhaseSelect";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard, DonutChart, BarList } from "@/components/dashboard/charts";
import { apiGet, apiPost } from "@/lib/apiClient";
import {
  directoryMap,
  enrichAttendance,
  scopeAttendance,
  applyPhase,
  attendanceOverview,
  byDate,
  byMode,
  distribution,
  attendanceByDepartment,
  studentDayWise,
  parseDate,
  distinctModes,
  modeTallies,
  rowModeStatus,
  rowModePresent,
  modeLabel,
} from "@/lib/attendanceData";
import { seesAllStudents, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const FIELD =
  "h-10 rounded-full border border-border bg-surface px-4 text-sm text-foreground focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30";

function pctTone(p) {
  if (p >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (p >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-500";
}

export default function AttendancePage() {
  const { user } = useAuth();
  const { isActive, activeOnly, setActiveOnly } = useStudentStatus();
  const { phase, matches } = usePhase();

  const [batches, setBatches] = useState([]);
  const [cohorts, setCohorts] = useState([]); // custom cohorts (e.g. AIRE Batch - III Year)
  const [directory, setDirectory] = useState([]);
  const [roster, setRoster] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [raw, setRaw] = useState(null); // upstream result for the selected batch
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [deptF, setDeptF] = useState("all");
  const [dateF, setDateF] = useState("all");
  const [picked, setPicked] = useState(null); // student for the detail modal
  const [showLow, setShowLow] = useState(false); // low-attendance list modal
  const [downloading, setDownloading] = useState(false);

  // Load batch list + student directory once.
  useEffect(() => {
    apiGet("/attendance/batches").then((d) => setBatches(d.batches || [])).catch(() => setBatches([]));
    apiGet("/custom-batches").then((d) => setCohorts(d.batches || [])).catch(() => setCohorts([]));
    apiGet("/students").then((d) => setDirectory(d.students || [])).catch(() => setDirectory([]));
    apiGet("/roster").then((d) => setRoster(d.roster || [])).catch(() => setRoster([]));
  }, []);

  const loadAttendance = useCallback(async (id, rolls) => {
    if (!id) return;
    setLoading(true);
    setError("");
    setRaw(null);
    try {
      const d = await apiPost("/attendance", rolls ? { rolls } : { batch_id: id });
      const res = d.result || [];
      setRaw(res);
      // Default to the latest day that actually has attendance marked (a present
      // record). Newer sessions are often created but not yet taken (all-absent),
      // so defaulting to the newest day would look empty. Falls back to the newest
      // day, then "all". The user can switch to any day or "all".
      const allDates = new Set();
      const markedDates = new Set();
      for (const r of res)
        for (const a of r.attendance || []) {
          allDates.add(a.date);
          if (a.status === "present") markedDates.add(a.date);
        }
      const sortByDate = (arr) => [...arr].sort((x, y) => parseDate(x) - parseDate(y));
      const marked = sortByDate(markedDates);
      const all = sortByDate(allDates);
      setDateF(marked.length ? marked[marked.length - 1] : all.length ? all[all.length - 1] : "all");
      if (res.length === 0 && d.note) setError(d.note);
    } catch (e) {
      setError(e.message || "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onBatch = (id) => {
    setBatchId(id);
    setDeptF("all");
    setDateF("all");
    setQuery("");
    if (id.startsWith("cohort:")) {
      const c = cohorts.find((x) => `cohort:${x.slug}` === id);
      loadAttendance(id, c?.rolls || []);
    } else {
      loadAttendance(id);
    }
  };

  // Torii → { usn, name, department }. Departments come from the roster
  // (directory-by-Torii + assessment API) — this is what enables HOD scoping,
  // since the attendance API itself carries no department.
  const dirMap = useMemo(() => {
    const m = directoryMap(directory);
    for (const r of roster) if (r.torii) m.set((r.torii || "").trim().toUpperCase(), r);
    return m;
  }, [directory, roster]);
  const scoped = useMemo(() => {
    if (!raw) return [];
    let rows = scopeAttendance(user, enrichAttendance(raw, dirMap));
    if (activeOnly) rows = rows.filter((r) => isActive(r.torii));
    if (phase !== "all") rows = applyPhase(rows, matches).filter((r) => r.total > 0);
    return rows;
  }, [raw, dirMap, user, activeOnly, isActive, phase, matches]);

  // A selected date can fall outside the chosen phase — reset it when phase changes.
  useEffect(() => { setDateF("all"); }, [phase]);
  // Inactive students hidden by the active-only filter (for the notice).
  const hiddenInactive = useMemo(() => {
    if (!raw || !activeOnly) return 0;
    return scopeAttendance(user, enrichAttendance(raw, dirMap)).filter((r) => !isActive(r.torii)).length;
  }, [raw, dirMap, user, activeOnly, isActive]);

  const all = user ? seesAllStudents(user) : false;
  const deptOptions = useMemo(
    () => [...new Set(scoped.map((r) => r.department).filter(Boolean))].sort(),
    [scoped],
  );

  // Full (all-dates) record per student — the detail modal & low-attendance card
  // use this so they're never limited to the selected date.
  const scopedByTorii = useMemo(() => {
    const m = new Map();
    for (const r of scoped) m.set(r.torii, r);
    return m;
  }, [scoped]);

  // Overall attendance across ALL dates (independent of the date filter).
  const lowAttendance = useMemo(
    () => scoped.filter((r) => r.total > 0 && r.percent < 50).sort((a, b) => a.percent - b.percent),
    [scoped],
  );
  const neverPresent = useMemo(() => scoped.filter((r) => r.total > 0 && r.present === 0).length, [scoped]);
  const openStudent = (r) => setPicked(scopedByTorii.get(r.torii) || r);

  // Every distinct date present in the loaded data (newest last).
  const dateOptions = useMemo(() => {
    const set = new Set();
    for (const r of scoped) for (const a of r.attendance) set.add(a.date);
    return [...set].sort((x, y) => parseDate(x) - parseDate(y));
  }, [scoped]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = scoped
      .filter((r) => (deptF === "all" ? true : r.department === deptF))
      .filter((r) =>
        q === ""
          ? true
          : r.torii.toLowerCase().includes(q) ||
            (r.usn || "").toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q),
      );

    // When a date is selected, recompute each student's counts for that day only.
    if (dateF !== "all") {
      base = base.map((r) => {
        const attendance = r.attendance.filter((a) => a.date === dateF);
        const present = attendance.filter((a) => a.status === "present").length;
        const absent = attendance.filter((a) => a.status === "absent").length;
        const total = attendance.length;
        return { ...r, attendance, present, absent, total, percent: total ? Math.round((present / total) * 100) : 0 };
      });
    }

    return base.sort((a, b) => b.percent - a.percent);
  }, [scoped, query, deptF, dateF]);

  const overview = useMemo(() => attendanceOverview(rows), [rows]);
  const dates = useMemo(() => byDate(rows), [rows]);
  const modes = useMemo(() => byMode(rows), [rows]);
  const dist = useMemo(() => distribution(rows), [rows]);
  const byDept = useMemo(() => attendanceByDepartment(rows), [rows]);

  // Session modes (lightmode / brightmode) + per-mode present tallies for the current view.
  const sessionModes = useMemo(() => distinctModes(rows), [rows]);
  const modeStat = useMemo(() => modeTallies(rows, sessionModes), [rows, sessionModes]);

  if (!user) return null;

  const batchName = batchId.startsWith("cohort:")
    ? cohorts.find((c) => `cohort:${c.slug}` === batchId)?.name || ""
    : batches.find((b) => b.id === batchId)?.name || "";

  const onDownload = async () => {
    setDownloading(true);
    try {
      const { downloadAttendanceExcel } = await import("@/lib/attendanceExport");
      await downloadAttendanceExcel({
        rows,
        modes: sessionModes,
        dateSelected: dateF !== "all",
        date: dateF,
        filename: `attendance-${batchName || "batch"}${dateF !== "all" ? `-${dateF}` : ""}.xlsx`,
      });
    } finally {
      setDownloading(false);
    }
  };

  const onDownloadPdf = async () => {
    setDownloading(true);
    try {
      const { downloadTablePdf } = await import("@/lib/pdf");
      const head = ["Torii Number", "USN", "Name", "Department", ...sessionModes.map(modeLabel)];
      const body = rows.map((r) => [
        r.torii,
        r.usn || "",
        r.name || "",
        r.department || "",
        ...sessionModes.map((m) => {
          if (dateF !== "all") {
            const st = rowModeStatus(r, m);
            return st === "present" ? "Present" : st === "absent" ? "Absent" : "—";
          }
          return String(rowModePresent(r, m));
        }),
      ]);
      await downloadTablePdf({
        title: `Attendance — ${batchName || "Batch"}`,
        subtitle: `${dateF !== "all" ? dateF : "All dates"} · ${rows.length} students`,
        sections: [{ head, body, columnStyles: { 2: { halign: "left" } } }],
        orientation: sessionModes.length > 2 ? "l" : "p",
        filename: `attendance-${batchName || "batch"}${dateF !== "all" ? `-${dateF}` : ""}.pdf`,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Attendance</h2>
          <p className="mt-1 text-sm text-muted">
            {all ? "Day-wise attendance across all departments." : `Attendance for your department (${user.department}).`}
            {activeOnly && hiddenInactive > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {hiddenInactive} inactive hidden</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveOnly(true)}
              className={cn("rounded-full px-3 py-1.5 font-medium transition-colors", activeOnly ? "bg-brand/10 text-brand" : "text-muted hover:text-foreground")}
            >
              Active only
            </button>
            <button
              type="button"
              onClick={() => setActiveOnly(false)}
              className={cn("rounded-full px-3 py-1.5 font-medium transition-colors", !activeOnly ? "bg-brand/10 text-brand" : "text-muted hover:text-foreground")}
            >
              All
            </button>
          </div>
          <Badge tone="brand">{roleLabel(user.role)}</Badge>
        </div>
      </div>

      {/* Controls */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <PhaseSelect />
        <select className={FIELD} value={batchId} onChange={(e) => onBatch(e.target.value)}>
          <option value="">Select a batch…</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({b.studentCount})</option>
          ))}
          {cohorts.length > 0 && (
            <optgroup label="Custom cohorts">
              {cohorts.map((c) => (
                <option key={c.slug} value={`cohort:${c.slug}`}>{c.name} ({c.studentCount})</option>
              ))}
            </optgroup>
          )}
        </select>
        {raw && (
          <>
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Torii no, USN or name…"
                className="h-10 w-56 rounded-full border border-border bg-surface px-4 text-sm text-foreground placeholder:text-muted focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            {all && deptOptions.length > 0 && (
              <select className={FIELD} value={deptF} onChange={(e) => setDeptF(e.target.value)}>
                <option value="all">All departments</option>
                {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {dateOptions.length > 0 && (
              <select className={FIELD} value={dateF} onChange={(e) => setDateF(e.target.value)}>
                <option value="all">All dates</option>
                {dateOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-muted">{rows.length} students</span>
              {rows.length > 0 && (
                <>
                  <Button variant="secondary" size="sm" onClick={onDownload} disabled={downloading}>⬇ Excel</Button>
                  <Button size="sm" onClick={onDownloadPdf} disabled={downloading}>
                    {downloading ? "Preparing…" : "⬇ PDF"}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </Card>

      {loading && (
        <Card className="grid place-items-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
        </Card>
      )}

      {!loading && !raw && (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">Select a batch</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Choose a batch above to view its day-wise attendance.
          </p>
        </Card>
      )}

      {!loading && raw && rows.length === 0 && (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">No attendance to show</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {error
              ? error
              : !all && directory.length === 0
                ? "Import the student directory (Students page) so your department's students can be matched."
                : "No records for this selection."}
          </p>
        </Card>
      )}

      {!loading && raw && rows.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Students" value={overview.students} hint={batchName} />
            <StatCard label="Overall %" value={`${overview.overallPercent}%`} hint="All sessions" />
            <StatCard label="Avg Student %" value={`${overview.avgPercent}%`} hint="Mean per student" />
            <StatCard label="Sessions" value={overview.total} hint={`${overview.present} present · ${overview.absent} absent`} />
          </div>

          {/* Per-mode present counts (for the selected date) */}
          {sessionModes.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {sessionModes.map((m) => (
                <Card key={m} className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      {modeLabel(m)}{dateF !== "all" ? ` · ${dateF}` : " · all dates"}
                    </p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                      {modeStat[m]?.present || 0} <span className="text-base font-medium text-muted">present</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">{modeStat[m]?.absent || 0} absent · {modeStat[m]?.total || 0} marked</p>
                  </div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" /></svg>
                  </span>
                </Card>
              ))}
            </div>
          )}

          {/* Low attendance alert — overall across ALL dates (not the selected date) */}
          <button
            type="button"
            onClick={() => setShowLow(true)}
            className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-left transition-colors hover:bg-amber-500/10"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Low attendance — below 50%</p>
                <p className="text-xs text-muted">Overall across all dates{neverPresent ? ` · ${neverPresent} never marked present` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-red-500">{lowAttendance.length}</span>
              <span className="hidden text-sm font-medium text-brand sm:inline">View roll numbers →</span>
            </div>
          </button>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <DonutChart title="Attendance distribution" data={Object.entries(dist).filter(([, n]) => n > 0)} />
            <BarList title="Attendance % by mode" data={modes.map((m) => [m.mode, m.percent])} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarList title="Attendance % by day" data={dates.map((d) => [d.date, d.percent])} />
            {all && byDept.length > 1 ? (
              <BarList title="Attendance % by department" data={byDept.map((d) => [d.department, d.percent])} />
            ) : (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-foreground">Working days</h3>
                <p className="mt-2 text-3xl font-bold text-foreground">{dates.length}</p>
                <p className="mt-1 text-xs text-muted">Distinct attendance dates.</p>
              </Card>
            )}
          </div>

          {/* Student table */}
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">Students</h3>
              <p className="text-xs text-muted">Search above to find a student · click a row or “View all” to see every date they attended.</p>
            </div>
            <div className="max-h-[65vh] overflow-auto scrollbar-thin">
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="sticky top-0 z-10 w-12 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">#</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Torii Number</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">USN</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Name</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Department</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">Overall %</th>
                    {sessionModes.map((m) => (
                      <th key={m} className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">{modeLabel(m)}</th>
                    ))}
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted">All dates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={r.torii} onClick={() => openStudent(r)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                      <td className="px-4 py-3 text-muted">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{r.torii}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{r.usn || <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-foreground">{r.name || <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">{r.department ? <Badge tone="neutral">{r.department}</Badge> : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-center">
                        {(scopedByTorii.get(r.torii) || r).total
                          ? <span className={cn("font-semibold", pctTone((scopedByTorii.get(r.torii) || r).percent))}>{(scopedByTorii.get(r.torii) || r).percent}%</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      {sessionModes.map((m) => {
                        if (dateF === "all") {
                          return <td key={m} className="px-4 py-3 text-center font-medium text-emerald-600 dark:text-emerald-400">{rowModePresent(r, m)}</td>;
                        }
                        const st = rowModeStatus(r, m);
                        return (
                          <td key={m} className="px-4 py-3 text-center">
                            {st ? (
                              <span className={cn(
                                "inline-flex min-w-[4.75rem] items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                                st === "present"
                                  ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
                              )}>{st === "present" ? "Present" : "Absent"}</span>
                            ) : <span className="text-muted">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openStudent(r); }}
                          className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-brand transition-colors hover:bg-surface-2"
                        >
                          View all
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

      {picked && <StudentDetail student={picked} onClose={() => setPicked(null)} />}
      {showLow && (
        <LowAttendanceModal
          students={lowAttendance}
          batchName={batchName}
          onClose={() => setShowLow(false)}
          onPick={(r) => { setShowLow(false); openStudent(r); }}
        />
      )}
    </div>
  );
}

function LowAttendanceModal({ students, batchName, onClose, onPick }) {
  const [q, setQ] = useState("");
  const list = students.filter((s) => {
    const t = q.trim().toLowerCase();
    return t === "" ? true : (s.torii || "").toLowerCase().includes(t) || (s.name || "").toLowerCase().includes(t) || (s.usn || "").toLowerCase().includes(t);
  });
  const download = async () => {
    const XLSX = await import("xlsx");
    const aoa = [
      ["Torii Number", "USN", "Name", "Department", "Present", "Total", "Attendance %"],
      ...students.map((s) => [s.torii, s.usn || "", s.name || "", s.department || "", s.present, s.total, s.percent]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Low Attendance");
    XLSX.writeFile(wb, `low-attendance-${batchName || "batch"}.xlsx`);
  };

  const downloadPdf = async () => {
    const { downloadTablePdf } = await import("@/lib/pdf");
    await downloadTablePdf({
      title: "Low Attendance",
      subtitle: `Below 50% · ${batchName || "batch"} · ${students.length} students`,
      sections: [{
        head: ["Torii Number", "USN", "Name", "Department", "Present", "Total", "Attendance %"],
        body: students.map((s) => [s.torii, s.usn || "", s.name || "", s.department || "", String(s.present), String(s.total), `${s.percent}%`]),
        columnStyles: { 2: { halign: "left" } },
      }],
      filename: `low-attendance-${batchName || "batch"}.pdf`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-card-hover sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Low attendance — below 50%</h3>
            <p className="text-xs text-muted">{students.length} student{students.length === 1 ? "" : "s"} · overall across all dates</p>
          </div>
          <div className="flex items-center gap-2">
            {students.length > 0 && <Button size="sm" variant="secondary" onClick={download}>⬇ Excel</Button>}
            {students.length > 0 && <Button size="sm" onClick={downloadPdf}>⬇ PDF</Button>}
            <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        <div className="border-b border-border px-5 py-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roll no, USN or name…" className="h-10 w-full rounded-full border border-border bg-surface px-4 text-sm text-foreground placeholder:text-muted focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin">
          {list.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">{students.length === 0 ? "No students below 50% — great attendance!" : "No students match your search."}</p>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface-2 text-left">
                  <th className="sticky top-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">#</th>
                  <th className="sticky top-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Torii No</th>
                  <th className="sticky top-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">USN</th>
                  <th className="sticky top-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Name</th>
                  <th className="sticky top-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Dept</th>
                  <th className="sticky top-0 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">Present</th>
                  <th className="sticky top-0 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((s, i) => (
                  <tr key={s.torii} onClick={() => onPick(s)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                    <td className="px-4 py-2.5 text-muted">{i + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{s.torii}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{s.usn || "—"}</td>
                    <td className="px-4 py-2.5 text-foreground">{s.name || "—"}</td>
                    <td className="px-4 py-2.5">{s.department ? <Badge tone="neutral">{s.department}</Badge> : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-2.5 text-center text-muted">{s.present}/{s.total}</td>
                    <td className={cn("px-4 py-2.5 text-right font-bold", s.present === 0 ? "text-red-500" : "text-amber-600 dark:text-amber-400")}>{s.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StudentDetail({ student, onClose }) {
  const { modes, days } = studentDayWise(student);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-card-hover sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{student.name || student.torii}</h3>
            <p className="text-xs text-muted">
              <span className="font-mono">{student.torii}</span>
              {student.usn ? ` · ${student.usn}` : ""}
              {student.department ? ` · ${student.department}` : ""}
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground/80">
              All dates · {student.present}/{student.total} present ({student.percent}%)
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin">
          {days.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No attendance records.</p>
          ) : (
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface-2 text-left">
                  <th className="sticky top-0 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Date</th>
                  {modes.map((m) => (
                    <th key={m} className="sticky top-0 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map((d) => (
                  <tr key={d.date} className="transition-colors hover:bg-surface-2/60">
                    <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-medium text-foreground">{d.date}</th>
                    {modes.map((m) => {
                      const st = d.cells[m];
                      return (
                        <td key={m} className="px-3 py-2 text-center">
                          {st ? (
                            <span className={cn(
                              "inline-flex min-w-[4rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              st === "present"
                                ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                                : "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
                            )}>
                              {st === "present" ? "Present" : "Absent"}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
