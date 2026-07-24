"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useStudentStatus } from "@/components/students/StudentStatusProvider";
import { usePhase } from "@/components/layout/PhaseProvider";
import { PhaseSelect } from "@/components/layout/PhaseSelect";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/dashboard/charts";
import { apiGet, apiPost } from "@/lib/apiClient";
import { directoryMap, enrichAttendance, scopeAttendance, applyPhase, attendanceOverview } from "@/lib/attendanceData";
import { seesAllStudents, roleLabel, sameDept } from "@/lib/roles";
import { cn } from "@/lib/utils";

function MiniStat({ label, value, tone }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className={cn("text-lg font-bold", tone || "text-foreground")}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function attTone(p) {
  if (p >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (p >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-500";
}

export default function BatchesPage() {
  const { user } = useAuth();
  const { isActive, activeOnly, setActiveOnly } = useStudentStatus();
  const { phase, matches } = usePhase();

  const [batches, setBatches] = useState([]); // authoritative list from get-batches
  const [cohorts, setCohorts] = useState([]); // custom cohorts (e.g. AIRE Batch - III Year)
  const [directory, setDirectory] = useState([]);
  const [daily, setDaily] = useState([]);
  const [grand, setGrand] = useState([]);
  const [attByBatch, setAttByBatch] = useState({}); // batchName -> raw attendance result
  const [cohortAtt, setCohortAtt] = useState({}); // cohort slug -> raw attendance result
  const [loaded, setLoaded] = useState(false);
  const [attLoaded, setAttLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [b, dir, d, g, cbs] = await Promise.all([
        apiGet("/batches").then((r) => r.batches || []).catch(() => []),
        apiGet("/students").then((r) => r.students || []).catch(() => []),
        apiGet("/assessments?type=daily").then((r) => r.assessments || []).catch(() => []),
        apiGet("/assessments?type=grand").then((r) => r.assessments || []).catch(() => []),
        apiGet("/custom-batches").then((r) => r.batches || []).catch(() => []),
      ]);
      if (cancel) return;
      setBatches(b); setDirectory(dir); setDaily(d); setGrand(g); setCohorts(cbs); setLoaded(true);
      // per-batch + per-cohort attendance (parallel)
      const map = {};
      const cmap = {};
      await Promise.all([
        ...b.map(async (x) => {
          try { const r = await apiPost("/attendance", { batch_id: x.id }); map[x.name] = r.result || []; }
          catch { map[x.name] = []; }
        }),
        ...cbs.map(async (c) => {
          try { const r = await apiPost("/attendance", { rolls: c.rolls || [] }); cmap[c.slug] = r.result || []; }
          catch { cmap[c.slug] = []; }
        }),
      ]);
      if (!cancel) { setAttByBatch(map); setCohortAtt(cmap); setAttLoaded(true); }
    })();
    return () => { cancel = true; };
  }, []);

  const all = user ? seesAllStudents(user) : false;
  const dirMap = useMemo(() => directoryMap(directory), [directory]);

  const cards = useMemo(() => {
    if (!user) return [];
    return batches
      .map((b) => {
        const dirStudents = directory.filter(
          (s) => s.batch === b.name && (all || sameDept(s.department, user.department)) && (!activeOnly || isActive(s.torii)),
        );
        const dm = new Map();
        for (const s of dirStudents) dm.set(s.department || "—", (dm.get(s.department || "—") || 0) + 1);
        const depts = [...dm.entries()].sort((a, c) => c[1] - a[1]);
        // All-access counts come from the live/persisted API roster (active rolls
        // when the active-only filter is on); an HOD sees their department's count.
        const count = all
          ? activeOnly
            ? (b.rolls || []).reduce((n, t) => n + (isActive(t) ? 1 : 0), 0)
            : b.studentCount || 0
          : dirStudents.length;
        let attRows = scopeAttendance(user, enrichAttendance(attByBatch[b.name] || [], dirMap));
        if (activeOnly) attRows = attRows.filter((r) => isActive(r.torii));
        if (phase !== "all") attRows = applyPhase(attRows, matches).filter((r) => r.total > 0);
        const ov = attendanceOverview(attRows);
        const dailyCount = daily.filter((a) => a.batchList?.includes(b.name)).length;
        const grandCount = grand.filter((a) => a.batchList?.includes(b.name)).length;
        return {
          id: b.id, name: b.name, course: b.course, trainer: b.trainer,
          count, depts, ov, hasAtt: (attByBatch[b.name] || []).length > 0, dailyCount, grandCount,
        };
      })
      .filter((c) => all || c.count > 0 || c.depts.length > 0) // HOD: only batches with their students
      .sort((a, c) => c.count - a.count);
  }, [batches, directory, all, user, attByBatch, dirMap, daily, grand, activeOnly, isActive, phase, matches]);

  // Custom cohorts (members span the real batches) — shown as their own cards.
  const cohortCards = useMemo(() => {
    if (!user) return [];
    return cohorts.map((c) => {
      const members = (c.students || [])
        .filter((s) => all || sameDept(s.branch, user.department))
        .filter((s) => !activeOnly || isActive(s.torii));
      const dm = new Map();
      for (const s of members) dm.set(s.branch || "—", (dm.get(s.branch || "—") || 0) + 1);
      const depts = [...dm.entries()].sort((a, b) => b[1] - a[1]);
      let attRows = scopeAttendance(user, enrichAttendance(cohortAtt[c.slug] || [], dirMap));
      if (activeOnly) attRows = attRows.filter((r) => isActive(r.torii));
      if (phase !== "all") attRows = applyPhase(attRows, matches).filter((r) => r.total > 0);
      const ov = attendanceOverview(attRows);
      return { id: c.slug, name: c.name, count: members.length, depts, ov, hasAtt: (cohortAtt[c.slug] || []).length > 0 };
    }).filter((c) => all || c.count > 0);
  }, [cohorts, cohortAtt, dirMap, all, user, activeOnly, isActive, phase, matches]);

  const summary = useMemo(() => {
    let present = 0, total = 0;
    for (const c of cards) { present += c.ov.present; total += c.ov.total; }
    const students = cards.reduce((s, c) => s + c.count, 0);
    const tests = cards.reduce((s, c) => s + c.dailyCount + c.grandCount, 0);
    return { batches: cards.length, students, tests, attendance: total ? Math.round((present / total) * 100) : 0 };
  }, [cards]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Batches</h2>
          <p className="mt-1 text-sm text-muted">
            {all ? "Live placement batches — students, attendance and assessments." : `Your department's students by batch (${user.department}).`}
            {activeOnly ? " Showing continuing students only." : ""}
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
          <Badge tone="brand">{all ? roleLabel(user.role) : user.department}</Badge>
        </div>
      </div>

      {!loaded ? (
        <Card className="grid place-items-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" /></Card>
      ) : cards.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">No batches to show</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {directory.length === 0 ? "Import the student directory to see batch composition." : "No batches match your access."}
          </p>
        </Card>
      ) : (
        <>
          {/* Live summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Batches" value={summary.batches} hint="Placement cohorts" />
            <StatCard label="Students" value={summary.students} hint={all ? "All departments" : user.department} />
            <StatCard label="Attendance" value={attLoaded ? `${summary.attendance}%` : "…"} hint="Overall" />
            <StatCard label="Assessments" value={summary.tests} hint="Daily + grand" />
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <Link key={c.id} href={`/students?batch=${encodeURIComponent(c.name)}`}>
                <Card interactive className="flex h-full flex-col overflow-hidden">
                  <div className="flex items-center justify-between bg-gradient-to-r from-brand/10 to-transparent px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-foreground">{c.name}</h3>
                      <p className="truncate text-xs text-muted">{c.course || "Placement Training"}</p>
                    </div>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4 5h16v4H4V5Zm0 6h16v4H4v-4Zm0 6h10v2H4v-2Z" /></svg>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-border border-y border-border">
                    <MiniStat label="Students" value={c.count} />
                    <MiniStat label="Attendance" value={attLoaded ? (c.hasAtt ? `${c.ov.overallPercent}%` : "—") : "…"} tone={attLoaded && c.hasAtt ? attTone(c.ov.overallPercent) : undefined} />
                    <MiniStat label="Tests" value={c.dailyCount + c.grandCount} />
                  </div>

                  <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                    <p className="text-xs text-muted">{c.depts.length} department{c.depts.length === 1 ? "" : "s"} · {c.dailyCount} daily · {c.grandCount} grand</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.depts.slice(0, 4).map(([d, n]) => <Badge key={d} tone="neutral">{d} · {n}</Badge>)}
                      {c.depts.length > 4 && <Badge tone="outline">+{c.depts.length - 4}</Badge>}
                      {c.depts.length === 0 && <span className="text-xs text-muted">Import directory for department breakdown</span>}
                    </div>
                    <p className="mt-auto pt-4 text-sm font-medium text-brand">View students →</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {cohortCards.length > 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Custom cohorts</h3>
                <p className="text-sm text-muted">Named student groups spanning the placement batches.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {cohortCards.map((c) => (
                  <Link key={c.id} href="/attendance">
                    <Card interactive className="flex h-full flex-col overflow-hidden">
                      <div className="flex items-center justify-between bg-gradient-to-r from-brand/10 to-transparent px-5 py-4">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-foreground">{c.name}</h3>
                          <p className="truncate text-xs text-muted">Custom cohort</p>
                        </div>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2 9.2 8.6 2 9.3l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7 5.5-4.7-7.2-.7L12 2Z" /></svg>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-border border-y border-border">
                        <MiniStat label="Students" value={c.count} />
                        <MiniStat label="Attendance" value={attLoaded ? (c.hasAtt ? `${c.ov.overallPercent}%` : "—") : "…"} tone={attLoaded && c.hasAtt ? attTone(c.ov.overallPercent) : undefined} />
                      </div>
                      <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
                        <p className="text-xs text-muted">{c.depts.length} department{c.depts.length === 1 ? "" : "s"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.depts.slice(0, 4).map(([d, n]) => <Badge key={d} tone="neutral">{d} · {n}</Badge>)}
                          {c.depts.length > 4 && <Badge tone="outline">+{c.depts.length - 4}</Badge>}
                        </div>
                        <p className="mt-auto pt-4 text-sm font-medium text-brand">Open attendance →</p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
