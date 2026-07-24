"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { useStudentStatus } from "@/components/students/StudentStatusProvider";
import { usePhase } from "@/components/layout/PhaseProvider";
import { PhaseSelect } from "@/components/layout/PhaseSelect";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Stars } from "@/components/ui/Stars";
import { DonutChart, BarList, SectionTitle, Gauge, MetricTile, RankBars, TrendArea } from "@/components/dashboard/charts";
import { apiGet, apiPost } from "@/lib/apiClient";
import {
  directoryMap,
  enrichAttendance,
  scopeAttendance,
  applyPhase,
  attendanceOverview,
  attendanceByDepartment,
  byDate,
} from "@/lib/attendanceData";
import { feedbackOverview, scopeFeedback } from "@/lib/feedback";
import { seesAllStudents, roleLabel, canManageUsers, sameDept } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ALLOWED = new Set(["PT_AI_READY_2027", "PT_IT_2027", "PT_NON_IT_2027"]);

const icon = {
  users: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v3h16v-3c0-3.3-4.7-5-8-5Z" />,
  building: <path d="M3 21V5l8-3 8 3v16h-5v-5h-6v5H3Zm6-9h2v-2H9v2Zm4 0h2v-2h-2v2ZM9 8h2V6H9v2Zm4 0h2V6h-2v2Z" />,
  batches: <path d="M4 5h16v4H4V5Zm0 6h16v4H4v-4Zm0 6h10v2H4v-2Z" />,
  check: <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />,
  chat: <path d="M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1Z" />,
};

function Icon({ d }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>{d}</svg>;
}

function groupCount(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x) || "—";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function tone(p) {
  if (p >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (p >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-500";
}
function cellTone(v, kind) {
  if (kind === "pct") {
    if (v == null) return "bg-surface-2 text-muted";
    if (v >= 75) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    if (v >= 50) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    return "bg-red-500/10 text-red-600 dark:text-red-400";
  }
  return v ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { records } = useFeedback();
  const { isActive, activeOnly, setActiveOnly } = useStudentStatus();
  const { phase, matches } = usePhase();

  const [directory, setDirectory] = useState([]);
  const [attRows, setAttRows] = useState(null);
  const [attLoading, setAttLoading] = useState(true);
  const [daily, setDaily] = useState([]);
  const [grand, setGrand] = useState([]);
  const [apiBatches, setApiBatches] = useState([]);

  // Load directory + attendance (all allowed batches) once.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const dir = (await apiGet("/students")).students || [];
        if (cancel) return;
        setDirectory(dir);
        // Assessments (daily + grand) — independent of attendance.
        apiGet("/assessments?type=daily").then((r) => { if (!cancel) setDaily(r.assessments || []); }).catch(() => {});
        apiGet("/assessments?type=grand").then((r) => { if (!cancel) setGrand(r.assessments || []); }).catch(() => {});
        const dm = directoryMap(dir);
        const batches = (await apiGet("/batches")).batches || [];
        if (!cancel) setApiBatches(batches);
        const all = [];
        for (const b of batches) {
          try {
            const r = await apiPost("/attendance", { batch_id: b.id });
            for (const row of enrichAttendance(r.result || [], dm)) all.push({ ...row, batchName: b.name });
          } catch {
            /* skip a batch that errors */
          }
        }
        if (!cancel) setAttRows(all);
      } catch {
        if (!cancel) {
          setDirectory([]);
          setAttRows([]);
        }
      } finally {
        if (!cancel) setAttLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const all = user ? seesAllStudents(user) : false;

  const scopedStudents = useMemo(() => {
    if (!user) return [];
    return all ? directory : directory.filter((s) => sameDept(s.department, user.department));
  }, [directory, user, all]);
  const students = useMemo(
    () => (activeOnly ? scopedStudents.filter((s) => isActive(s.torii)) : scopedStudents),
    [scopedStudents, activeOnly, isActive],
  );
  // Active headcount within a batch's roster (uses the live rolls list).
  const batchCount = useMemo(
    () => (b) => (activeOnly ? (b.rolls || []).reduce((n, t) => n + (isActive(t) ? 1 : 0), 0) : (b.studentCount || 0)),
    [activeOnly, isActive],
  );

  const deptGroups = useMemo(() => groupCount(students, (s) => s.department), [students]);
  // All-access batch counts come from the live/persisted API roster; HOD from the directory.
  const byBatch = useMemo(() => {
    if (all && apiBatches.length) return apiBatches.map((b) => [b.name, batchCount(b)]).sort((a, c) => c[1] - a[1]);
    return groupCount(students, (s) => s.batch);
  }, [all, apiBatches, students, batchCount]);
  const totalStudents = useMemo(
    () => (all && apiBatches.length ? apiBatches.reduce((s, b) => s + batchCount(b), 0) : students.length),
    [all, apiBatches, students, batchCount],
  );
  // Students-by-department totals the live roster: roster students not yet in the
  // directory (no department) fall into "Unknown" so the chart sums to the headcount.
  const byDept = useMemo(() => {
    const unknown = all ? Math.max(0, totalStudents - students.length) : 0;
    return unknown > 0 ? [...deptGroups, ["Unknown", unknown]] : deptGroups;
  }, [deptGroups, all, totalStudents, students]);

  const matrix = useMemo(() => {
    const depts = [];
    const batches = [];
    const cells = new Map();
    for (const s of students) {
      const d = s.department || "—";
      const b = s.batch || "—";
      if (!depts.includes(d)) depts.push(d);
      if (!batches.includes(b)) batches.push(b);
      const k = `${d}||${b}`;
      cells.set(k, (cells.get(k) || 0) + 1);
    }
    return { depts: depts.sort(), batches: batches.sort(), get: (d, b) => cells.get(`${d}||${b}`) || 0 };
  }, [students]);

  const att = useMemo(() => {
    if (!attRows) return [];
    let scoped = scopeAttendance(user, attRows);
    if (activeOnly) scoped = scoped.filter((r) => isActive(r.torii));
    if (phase !== "all") scoped = applyPhase(scoped, matches).filter((r) => r.total > 0);
    return scoped;
  }, [attRows, user, activeOnly, isActive, phase, matches]);
  const attOv = useMemo(() => attendanceOverview(att), [att]);
  const attByDept = useMemo(() => attendanceByDepartment(att), [att]);
  const attByBatch = useMemo(() => {
    const m = new Map();
    for (const r of att) {
      const b = r.batchName || "—";
      const e = m.get(b) || { present: 0, total: 0 };
      e.present += r.present;
      e.total += r.total;
      m.set(b, e);
    }
    return [...m.entries()].map(([k, v]) => [k, v.total ? Math.round((v.present / v.total) * 100) : 0]);
  }, [att]);

  const fb = useMemo(
    () => scopeFeedback(user, records).filter((s) => matches(s.createdAt)),
    [user, records, matches],
  );
  const fbOv = useMemo(() => feedbackOverview(fb), [fb]);

  // Assessments (in-scope to the 3 placement batches, filtered to the phase by start date).
  const dailyIn = useMemo(() => daily.filter((a) => a.batchList?.some((b) => ALLOWED.has(b)) && matches(a.start)), [daily, matches]);
  const grandIn = useMemo(() => grand.filter((a) => a.batchList?.some((b) => ALLOWED.has(b)) && matches(a.start)), [grand, matches]);
  const asmtAll = useMemo(() => [...dailyIn, ...grandIn], [dailyIn, grandIn]);
  const asmtByBatch = useMemo(() => {
    const m = new Map();
    for (const a of asmtAll) for (const b of a.batchList || []) if (ALLOWED.has(b)) m.set(b, (m.get(b) || 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [asmtAll]);
  const asmtByTech = useMemo(() => groupCount(asmtAll, (a) => a.technology), [asmtAll]);
  const asmtTechCount = useMemo(() => new Set(asmtAll.map((a) => a.technology)).size, [asmtAll]);
  const asmtQuestions = useMemo(() => asmtAll.reduce((s, a) => s + (a.questions || 0), 0), [asmtAll]);

  // Attendance trend + risk (across all scoped/active rows).
  const attTrend = useMemo(() => byDate(att).map((d) => [d.date, d.percent]), [att]);
  const trackedWithData = useMemo(() => att.filter((r) => r.total > 0).length, [att]);
  const atRisk = useMemo(() => att.filter((r) => r.total > 0 && r.percent < 50).length, [att]);
  const onTrackPct = trackedWithData ? Math.round(((trackedWithData - atRisk) / trackedWithData) * 100) : 0;
  const attDist = useMemo(() => attBuckets(att), [att]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      {/* Welcome */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back, {user.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {roleLabel(user.role)}
            {user.department ? ` · ${user.department}` : " · all departments"} — here&apos;s your overview.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PhaseSelect />
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
          <Badge tone="brand">{all ? "All departments" : user.department}</Badge>
        </div>
      </div>

      {students.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">No student data yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {canManageUsers(user)
              ? "Import the student directory to populate the dashboard."
              : "The student directory hasn't been imported yet."}
          </p>
          {canManageUsers(user) && (
            <div className="mt-5 flex justify-center">
              <Button href="/students" size="md">Go to Students</Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          {/* Overview */}
          <section className="space-y-4">
            <SectionTitle
              title="Portal overview"
              description={`A live snapshot of the placement-training programme${activeOnly ? " — continuing students only" : ""}. Use the toggle above to include everyone.`}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile label="Students" value={totalStudents} hint={activeOnly ? "Continuing" : all ? "On roster" : `In ${user.department}`} accent="brand" icon={<Icon d={icon.users} />} />
              <MetricTile label="Departments" value={deptGroups.length} hint="Represented" accent="sky" icon={<Icon d={icon.building} />} />
              <MetricTile label="Batches" value={byBatch.length} hint="Placement cohorts" accent="violet" icon={<Icon d={icon.batches} />} />
              <MetricTile label="Assessments" value={asmtAll.length} hint={`${dailyIn.length} daily · ${grandIn.length} grand`} accent="emerald" icon={<Icon d={icon.check} />} />
            </div>
          </section>

          {/* Performance snapshot */}
          {(att.length > 0 || fb.length > 0) && (
            <section className="space-y-4">
              <SectionTitle title="Performance snapshot" description="The headline health metrics at a glance — attendance turnout and trainer feedback." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {att.length > 0 && <Gauge value={attOv.overallPercent} label="Overall attendance" hint="All sessions" />}
                {att.length > 0 && <Gauge value={attOv.avgPercent} label="Avg per student" hint="Mean attendance" />}
                {att.length > 0 && <Gauge value={onTrackPct} tone="emerald" label="On track" hint="At or above 50%" />}
                {fb.length > 0 && <Gauge value={Number(fbOv.avgRating.toFixed(1))} max={5} suffix="/5" tone="brand" label="Trainer rating" hint={`${fbOv.responses} responses`} />}
              </div>
            </section>
          )}

          {/* Students */}
          <section className="space-y-4">
            <SectionTitle title="Students" description="How the cohort is distributed across departments and batches." />
            <div className="grid gap-4 lg:grid-cols-2">
              <DonutChart title="Students by department" description="Share of the cohort in each department." data={byDept} />
              <RankBars title="Students by batch" description="Headcount in each placement batch." data={byBatch} />
            </div>

            {matrix.batches.length > 0 && (
              <Card className="overflow-hidden">
                <div className="border-b border-border px-5 py-3.5">
                  <h4 className="text-sm font-semibold text-foreground">Department × Batch</h4>
                  <p className="text-xs text-muted">Student counts per batch in each department.</p>
                </div>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-surface-2 text-left">
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Department</th>
                        {matrix.batches.map((b) => (
                          <th key={b} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">{b}</th>
                        ))}
                        <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {matrix.depts.map((d) => {
                        const total = matrix.batches.reduce((s, b) => s + matrix.get(d, b), 0);
                        return (
                          <tr key={d}>
                            <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-medium text-foreground">{d}</th>
                            {matrix.batches.map((b) => {
                              const v = matrix.get(d, b);
                              return (
                                <td key={b} className="px-3 py-2 text-center">
                                  <span className={cn("inline-block min-w-[2.25rem] rounded-md px-2 py-1 text-xs font-semibold", cellTone(v, "count"))}>{v || "—"}</span>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-center font-semibold text-foreground">{total}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          {/* Attendance */}
          <section className="space-y-4">
            <SectionTitle
              title="Attendance"
              description="Day-by-day turnout across sessions. Anyone below 50% overall is flagged as at-risk."
              action={<Button href="/attendance" variant="secondary" size="sm">Open attendance →</Button>}
            />
            {attLoading ? (
              <Card className="grid place-items-center py-12">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand" />
              </Card>
            ) : att.length === 0 ? (
              <Card className="px-6 py-10 text-center text-sm text-muted">
                No attendance available yet (import the directory so students can be matched).
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <MetricTile label="Tracked" value={attOv.students} hint="Students with records" accent="sky" />
                  <MetricTile label="At risk" value={atRisk} hint="Below 50% attendance" accent="rose" />
                  <MetricTile label="Working days" value={attTrend.length} hint="Distinct session dates" accent="violet" />
                </div>
                <TrendArea title="Attendance % by day" description="Average attendance for every working day so far." data={attTrend} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <DonutChart title="Attendance distribution" description="Students grouped by their overall attendance %." data={attDist} />
                  <RankBars title="Attendance % by batch" description="Average attendance in each batch." data={attByBatch} unit="%" />
                </div>
                {all && attByDept.length > 1 && (
                  <RankBars title="Attendance % by department" description="Turnout ranked by department." data={attByDept.map((d) => [d.department, d.percent])} unit="%" />
                )}
              </>
            )}
          </section>

          {/* Assessments */}
          <section className="space-y-4">
            <SectionTitle
              title="Assessments"
              description="Aptitude, coding and communication tests published to the placement batches."
              action={<Button href="/assessments" variant="secondary" size="sm">Open assessments →</Button>}
            />
            {asmtAll.length === 0 ? (
              <Card className="px-6 py-10 text-center text-sm text-muted">No assessments published for these batches yet.</Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricTile label="Daily tests" value={dailyIn.length} hint="Regular practice" accent="emerald" icon={<Icon d={icon.check} />} />
                  <MetricTile label="Grand tests" value={grandIn.length} hint="Comprehensive" accent="brand" />
                  <MetricTile label="Technologies" value={asmtTechCount} hint="Skill areas covered" accent="indigo" />
                  <MetricTile label="Questions" value={asmtQuestions} hint="Total set" accent="amber" />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <RankBars title="Assessments by batch" description="How many tests each batch has been set." data={asmtByBatch} />
                  <DonutChart title="Assessments by technology" description="Spread of tests across skill areas." data={asmtByTech} />
                </div>
              </>
            )}
          </section>

          {/* Feedback */}
          <section className="space-y-4">
            <SectionTitle
              title="Feedback"
              description="Anonymous student feedback on trainers and classes, rated out of 5."
              action={<Button href="/feedback" variant="secondary" size="sm">Open feedback →</Button>}
            />
            {fb.length === 0 ? (
              <Card className="px-6 py-10 text-center text-sm text-muted">No feedback submitted yet.</Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricTile label="Responses" value={fbOv.responses} hint="Student submissions" accent="sky" icon={<Icon d={icon.chat} />} />
                  <MetricTile label="Avg rating" value={`${fbOv.avgRating.toFixed(1)}/5`} hint="All parameters" accent="brand" />
                  <MetricTile label="Batches" value={fbOv.batches} hint="Rated" accent="violet" />
                  <MetricTile label="Classes" value={fbOv.classes} hint="Rated" accent="emerald" />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <BarList title="Average by parameter" description="Mean score for each feedback parameter (out of 5)." data={fbOv.criteria.map((c) => [c.label, Math.round(c.avg * 10) / 10])} />
                  <Card className="flex flex-col justify-center p-5">
                    <p className="text-sm font-medium text-muted">Overall rating</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className={cn("text-4xl font-bold", tone(fbOv.avgRating * 20))}>{fbOv.avgRating.toFixed(1)}</span>
                      <Stars value={fbOv.avgRating} size={20} />
                    </div>
                    <p className="mt-1 text-xs text-muted">across {fbOv.responses} responses</p>
                  </Card>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function attBuckets(rows) {
  const b = { "≥ 90%": 0, "75–89%": 0, "50–74%": 0, "< 50%": 0 };
  for (const r of rows) {
    if (!r.total) continue;
    if (r.percent >= 90) b["≥ 90%"] += 1;
    else if (r.percent >= 75) b["75–89%"] += 1;
    else if (r.percent >= 50) b["50–74%"] += 1;
    else b["< 50%"] += 1;
  }
  return Object.entries(b).filter(([, n]) => n > 0);
}
