"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePhase } from "@/components/layout/PhaseProvider";
import { PhaseSelect } from "@/components/layout/PhaseSelect";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiGet, apiPost } from "@/lib/apiClient";
import { roleLabel, seesAllStudents, sameDept } from "@/lib/roles";
import { parseDateTime, levelLabel, typeLabel } from "@/lib/assessments";
import { cn } from "@/lib/utils";

const ALLOWED_BATCHES = ["PT_AI_READY_2027", "PT_IT_2027", "PT_NON_IT_2027"];
const ALLOWED = new Set(ALLOWED_BATCHES);
const SQL_RE = /sql/i;

const FIELD = "h-10 rounded-full border border-border bg-surface px-4 text-sm text-foreground focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30";
const TYPE_TONE = { ai: "bg-violet-500/10 text-violet-600 dark:text-violet-400", general: "bg-sky-500/10 text-sky-600 dark:text-sky-400", certification: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
const LEVEL_TONE = { easy: "text-emerald-600 dark:text-emerald-400", medium: "text-amber-600 dark:text-amber-400", hard: "text-red-500", any: "text-muted" };

const CATEGORIES = [["aptitude", "Aptitude"], ["coding", "Coding"], ["sql", "SQL"], ["communication", "Communication"]];
const catLabel = (c) => (CATEGORIES.find((x) => x[0] === c) || [, ""])[1];

export default function AssessmentsPage() {
  const { user } = useAuth();
  const { phase, matches } = usePhase();

  const [category, setCategory] = useState("aptitude");
  const [aptitude, setAptitude] = useState(null);   // merged daily + grand
  const [coding, setCoding] = useState(null);        // all owl coder module tests (coding + sql)
  const [comm, setComm] = useState(null);            // myna
  const [directory, setDirectory] = useState([]);
  const [attend, setAttend] = useState({});          // cardId -> branches[] for attempt scoping

  const [batchF, setBatchF] = useState("all");
  const [deptF, setDeptF] = useState("all");

  useEffect(() => {
    apiGet("/students").then((d) => setDirectory(d.students || [])).catch(() => setDirectory([]));
  }, []);

  // Load the active category's catalog once (only re-runs on category change).
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (category === "aptitude" && aptitude === null) {
        const [daily, grand] = await Promise.all([
          apiGet("/assessments?type=daily").then((r) => r.assessments || []).catch(() => []),
          apiGet("/assessments?type=grand").then((r) => r.assessments || []).catch(() => []),
        ]);
        if (!cancel) setAptitude([...grand, ...daily].filter((a) => a.batchList?.some((b) => ALLOWED.has(b))));
      } else if ((category === "coding" || category === "sql") && coding === null) {
        const tests = await apiGet("/coding/tests").then((r) => r.tests || []).catch(() => []);
        if (!cancel) setCoding(tests);
      } else if (category === "communication" && comm === null) {
        const d = await apiGet("/communication").catch(() => ({ ok: false, attempts: [], modules: [] }));
        if (!cancel) setComm(d);
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Aptitude attendee counts — fetched per-card once the catalog is loaded. Kept
  // in its own effect so setting the catalog doesn't cancel the count fetches.
  useEffect(() => {
    if (!aptitude || aptitude.length === 0) return;
    let cancel = false;
    aptitude.forEach(async (a) => {
      try {
        const d = await apiPost("/assessments/details", { assessment: a.id, type: a.isGrand ? "grand" : "daily" });
        if (!cancel) setAttend((m) => ({ ...m, [a.id]: (d.result || []).map((r) => (Array.isArray(r.branch) ? r.branch[0] : r.branch) || "") }));
      } catch { if (!cancel) setAttend((m) => ({ ...m, [a.id]: [] })); }
    });
    return () => { cancel = true; };
  }, [aptitude]);

  const loaded =
    category === "aptitude" ? aptitude !== null :
    category === "communication" ? comm !== null :
    coding !== null;

  const seesAll = user ? seesAllStudents(user) : false;

  const batchDepts = useMemo(() => {
    const m = new Map();
    for (const s of directory) {
      if (!ALLOWED.has(s.batch)) continue;
      if (!m.has(s.batch)) m.set(s.batch, new Set());
      if (s.department) m.get(s.batch).add(s.department);
    }
    return m;
  }, [directory]);

  const deptOptions = useMemo(() => {
    if (!seesAll) return user?.department ? [user.department] : [];
    const set = new Set();
    for (const depts of batchDepts.values()) for (const d of depts) set.add(d);
    return [...set].sort();
  }, [batchDepts, seesAll, user]);
  const effDept = seesAll ? deptF : user?.department || "all";

  // Cards for the selected category, in a common shape.
  const cards = useMemo(() => {
    if (category === "aptitude") {
      return (aptitude || []).map((a) => ({
        id: a.id, kind: "aptitude", title: a.title, technology: a.technology,
        line: `${a.isGrand ? `${a.topicCount} topics` : a.module} · ${a.questions} questions${a.isGrand && a.duration ? ` · ${a.duration} min` : ""}`,
        batchList: a.batchList, level: a.level, testType: a.testType, isGrand: a.isGrand,
        start: a.start, href: `/assessments/${a.id}?type=${a.isGrand ? "grand" : "daily"}`,
      }));
    }
    if (category === "coding" || category === "sql") {
      const wantSql = category === "sql";
      return (coding || [])
        .filter((t) => SQL_RE.test(t.technology) === wantSql)
        .map((t) => ({
          id: t.id, kind: "coding", title: t.name, technology: t.technology,
          line: `${t.module} · ${[t.hasMcq && "MCQ", t.hasCoding && "Coding"].filter(Boolean).join(" + ") || "—"}`,
          batchList: (t.batches || []).map((b) => b.name), assigned: t.assigned, attempted: t.attempted,
          start: t.start, href: `/assessments/coding/${t.id}`,
        }));
    }
    return [];
  }, [category, aptitude, coding]);

  const batchOptions = useMemo(() => {
    if (category === "communication") {
      const set = new Set((comm?.attempts || []).map((a) => a.batch));
      return ALLOWED_BATCHES.filter((b) => set.has(b));
    }
    return ALLOWED_BATCHES.filter((b) => cards.some((c) => c.batchList?.includes(b)));
  }, [category, cards, comm]);

  const filtered = useMemo(() => {
    return cards
      .filter((c) => (phase === "all" || !c.start ? true : matches(c.start)))
      .filter((c) => (batchF === "all" ? true : c.batchList?.includes(batchF)))
      .filter((c) => (effDept === "all" ? true : (c.batchList || []).some((b) => { const set = batchDepts.get(b); return set && [...set].some((d) => sameDept(d, effDept)); })))
      .sort((a, b) => parseDateTime(b.start).ts - parseDateTime(a.start).ts);
  }, [cards, batchF, effDept, batchDepts, phase, matches]);

  const countFor = (c) => {
    if (c.kind === "coding") return c.attempted ?? 0; // pre-computed, instant
    const branches = attend[c.id];
    if (branches === undefined || branches === null) return null;
    return effDept === "all" ? branches.length : branches.filter((b) => sameDept(b, effDept)).length;
  };

  const anyFilter = batchF !== "all" || (seesAll && deptF !== "all");
  const onCategory = (c) => { if (c === category) return; setCategory(c); setBatchF("all"); };

  if (!user) return null;

  const isComm = category === "communication";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Assessments</h2>
          <p className="mt-1 text-sm text-muted">
            {isComm ? "Communication (Myna) results." : loaded ? `${filtered.length} ${catLabel(category).toLowerCase()} test${filtered.length === 1 ? "" : "s"} · open a card for full results.` : "Loading…"}
          </p>
        </div>
        <Badge tone="brand">{seesAll ? roleLabel(user.role) : user.department}</Badge>
      </div>

      {/* Phase / Category / Department / Batch select bars */}
      <div className="flex flex-wrap items-center gap-3">
        <PhaseSelect />
        <select className={FIELD} value={category} onChange={(e) => onCategory(e.target.value)} aria-label="Assessment type">
          {CATEGORIES.map(([c, label]) => <option key={c} value={c}>{label}</option>)}
        </select>
        {seesAll ? (
          <select className={FIELD} value={deptF} onChange={(e) => setDeptF(e.target.value)} aria-label="Department">
            <option value="all">All departments</option>
            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : (
          <Badge tone="neutral">Department · {user.department}</Badge>
        )}
        <select className={FIELD} value={batchF} onChange={(e) => setBatchF(e.target.value)} aria-label="Batch">
          <option value="all">All batches</option>
          {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {anyFilter && <button type="button" onClick={() => { setBatchF("all"); setDeptF("all"); }} className="text-sm font-medium text-brand hover:underline">Reset</button>}
      </div>

      {/* Content */}
      {isComm ? (
        <CommunicationPanel comm={comm} effDept={effDept} batchF={batchF} phase={phase} matches={matches} />
      ) : !loaded ? (
        <Card className="grid place-items-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" /></Card>
      ) : filtered.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">No {catLabel(category).toLowerCase()} tests</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{cards.length === 0 ? "None published for the placement batches yet." : "None match the current Department / Batch selection."}</p>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const count = countFor(c);
            return (
              <Link key={c.id} href={c.href}>
                <Card interactive className="flex h-full flex-col overflow-hidden">
                  <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-brand/10 to-transparent px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.kind === "aptitude" ? (
                          <>
                            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TYPE_TONE[c.testType] || "bg-surface-2 text-muted")}>{typeLabel(c.testType)}</span>
                            <span className={cn("text-xs font-medium capitalize", LEVEL_TONE[c.level] || "text-muted")}>{levelLabel(c.level)}</span>
                            {c.isGrand && <Badge tone="brand">Grand</Badge>}
                          </>
                        ) : (
                          <Badge tone="brand">{c.technology}</Badge>
                        )}
                      </div>
                      <h3 className="mt-1.5 truncate font-semibold text-foreground">{c.title}</h3>
                      <p className="truncate text-xs text-muted">{c.kind === "aptitude" ? c.technology : c.line}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-bold leading-none text-foreground">{count == null ? "…" : count}</p>
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">{c.kind === "coding" ? "attempted" : "attended"}</p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-3">
                    <div className="flex flex-wrap gap-1.5">{(c.batchList || []).map((b) => <Badge key={b} tone="neutral">{b}</Badge>)}</div>
                    <p className="text-xs text-muted">{c.kind === "aptitude" ? c.line : `${c.assigned || 0} assigned`}</p>
                    <p className="text-xs text-muted">{parseDateTime(c.start).dateLabel || "—"}</p>
                    <p className="mt-auto pt-2 text-sm font-medium text-brand">View results →</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommunicationPanel({ comm, effDept, batchF, phase = "all", matches }) {
  const modules = useMemo(() => {
    const attempts = comm?.attempts || [];
    const m = new Map();
    for (const a of attempts) {
      if (batchF !== "all" && a.batch !== batchF) continue;
      if (effDept !== "all" && !sameDept(a.branch, effDept)) continue;
      if (phase !== "all" && a.attempted_date && matches && !matches(a.attempted_date)) continue;
      const name = a.collectionName || "—";
      const e = m.get(name) || { name, attempts: 0, students: new Set() };
      e.attempts += 1;
      e.students.add(a._id);
      m.set(name, e);
    }
    return [...m.values()].map((x) => ({ name: x.name, attempts: x.attempts, students: x.students.size })).sort((a, b) => b.students - a.students);
  }, [comm, effDept, batchF, phase, matches]);

  if (comm === null) return <Card className="grid place-items-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" /></Card>;

  if (modules.length > 0) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <Link key={mod.name} href={`/assessments/communication/${encodeURIComponent(mod.name)}`}>
            <Card interactive className="flex h-full flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-brand/10 to-transparent px-5 py-4">
                <div className="min-w-0">
                  <Badge tone="brand">Myna</Badge>
                  <h3 className="mt-1.5 truncate font-semibold text-foreground">{mod.name}</h3>
                  <p className="truncate text-xs text-muted">{mod.attempts} attempt{mod.attempts === 1 ? "" : "s"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold leading-none text-foreground">{mod.students}</p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">attended</p>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-3">
                <p className="text-xs text-muted">{mod.attempts} attempts · {mod.students} students</p>
                <p className="mt-auto pt-2 text-sm font-medium text-brand">View results →</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <Card className="px-6 py-16 text-center">
      <h3 className="text-base font-semibold text-foreground">Communication (Myna) results</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
        {comm?.error || "No communication attempts found for the current selection."}
      </p>
      {comm?.ok === false && (
        <p className="mx-auto mt-2 max-w-lg text-xs text-muted">
          Myna runs on an IP-whitelisted server (port 3001). Set <span className="font-mono">MYNA_ADMIN_ID</span> in the server env and whitelist the server’s IP, and results will appear here as cards.
        </p>
      )}
    </Card>
  );
}
