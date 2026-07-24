/**
 * Training phases. Phase 1 = everything up to & including 17 Jul 2026; Phase 2 =
 * from 20 Jul 2026 onward. The split sits at 18 Jul midnight, so any date before
 * it is Phase 1 and anything on/after is Phase 2 (nothing falls on 18–19 Jul).
 */
export const PHASE_SPLIT = new Date(2026, 6, 18, 0, 0, 0).getTime(); // 18 Jul 2026 00:00

export const PHASES = [
  { key: "all", label: "All phases", short: "All phases" },
  { key: "phase1", label: "Phase 1 · till 17 Jul", short: "Phase 1" },
  { key: "phase2", label: "Phase 2 · from 20 Jul", short: "Phase 2" },
];

/** Parse the various date shapes used across the app into a Date (or null). */
export function toDate(input) {
  if (input == null || input === "") return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") return new Date(input);
  const s = String(input).trim();
  // dd-mm-yyyy, optionally with a time (attendance dates, daily assessments).
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  // dd/mm/yyyy (some upstreams).
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s); // ISO 8601 (grand/coding start_date_time)
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "phase1" | "phase2" | null (unparseable). */
export function phaseOf(input) {
  const d = toDate(input);
  if (!d) return null;
  return d.getTime() < PHASE_SPLIT ? "phase1" : "phase2";
}

/** Does a date belong to the selected phase? "all" always matches. */
export function matchesPhase(phase, input) {
  if (!phase || phase === "all") return true;
  return phaseOf(input) === phase;
}

export function phaseLabel(key) {
  return PHASES.find((p) => p.key === key)?.short || "All phases";
}
