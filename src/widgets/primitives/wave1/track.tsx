"use client";

import type { CSSProperties, ReactNode } from "react";

// A horizontal track on which values sit as markers (Predict, Breakeven). It only draws; the parts decide what a marker means.

/** Where a value sits along a track, 0 to 100 percent, kept inside the track. */
export function along(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max === min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export function Track({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-3 h-10 ${className}`}>
      <div aria-hidden className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-sm bg-[var(--data)]" />
      {children}
    </div>
  );
}

export function Marker({
  at,
  kind,
  label,
  style,
  testId,
}: {
  at: number;
  kind: "guess" | "actual" | "found" | "sourced" | "now";
  label?: string;
  style?: CSSProperties;
  testId?: string;
}) {
  const look: Record<typeof kind, CSSProperties> = {
    // Hollow and dashed: the Learner's guess.
    guess: { width: 18, height: 18, borderRadius: 9, border: "2px dashed var(--you)", background: "var(--field)", top: "50%" },
    actual: { width: 18, height: 18, borderRadius: 9, border: "2px solid var(--src)", background: "var(--src-tag)", top: "50%" },
    found: { width: 4, height: 24, borderRadius: 2, background: "var(--ink)", top: "50%" },
    sourced: { width: 3, height: 20, borderRadius: 2, background: "var(--src-line)", top: "50%" },
    now: { width: 14, height: 14, borderRadius: 7, background: "var(--you)", top: "50%" },
  };
  return (
    <span
      data-testid={testId}
      data-marker={kind}
      title={label}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${at}%`, ...look[kind], ...style }}
    />
  );
}
