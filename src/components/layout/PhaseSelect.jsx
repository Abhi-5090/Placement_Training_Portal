"use client";

import { usePhase } from "@/components/layout/PhaseProvider";
import { PHASES } from "@/lib/phase";
import { cn } from "@/lib/utils";

const FIELD =
  "h-10 rounded-full border border-border bg-surface px-4 text-sm text-foreground focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30";

/** Global phase as a dropdown (All phases / Phase 1 / Phase 2). */
export function PhaseSelect({ className, onChange }) {
  const { phase, setPhase } = usePhase();
  return (
    <select
      aria-label="Training phase"
      className={cn(FIELD, className)}
      value={phase}
      onChange={(e) => { setPhase(e.target.value); onChange?.(e.target.value); }}
    >
      {PHASES.map((p) => (
        <option key={p.key} value={p.key}>{p.label}</option>
      ))}
    </select>
  );
}
