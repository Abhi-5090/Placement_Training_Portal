"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { matchesPhase, phaseLabel } from "@/lib/phase";

const PhaseContext = createContext(null);
const KEY = "torii.phase";

/**
 * Global training-phase selection (Phase 1 / Phase 2 / All), persisted so the
 * choice carries across every module. `matches(dateInput)` tells a module whether
 * a dated record belongs to the current phase.
 */
export function PhaseProvider({ children }) {
  const [phase, setPhaseState] = useState("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = window.localStorage.getItem(KEY);
    if (s === "phase1" || s === "phase2" || s === "all") setPhaseState(s);
  }, []);

  const setPhase = useCallback((p) => {
    setPhaseState(p);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, p);
  }, []);

  const matches = useCallback((input) => matchesPhase(phase, input), [phase]);

  const value = useMemo(
    () => ({ phase, setPhase, matches, label: phaseLabel(phase) }),
    [phase, setPhase, matches],
  );

  return <PhaseContext.Provider value={value}>{children}</PhaseContext.Provider>;
}

export function usePhase() {
  const ctx = useContext(PhaseContext);
  if (!ctx) throw new Error("usePhase must be used within a PhaseProvider");
  return ctx;
}
