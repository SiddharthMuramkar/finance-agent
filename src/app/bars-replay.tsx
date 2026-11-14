"use client";

// Pointing at or tabbing to Home's main button plays the rising bars again, one by one. The Web Animations API restarts
// the rise without touching the CSS animation, so moving away does not play it a second time (swapping animation-name
// on :hover would). Skipped when the Learner asks for reduced motion.

import type { ReactNode } from "react";

const RISE: Keyframe[] = [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }];

function replay(from: Element) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = from.closest(".home") ?? document;
  root.querySelectorAll(".bars").forEach((bars) =>
    bars.querySelectorAll(".bar").forEach((bar, i) =>
      bar.animate(RISE, { duration: 520, delay: i * 140, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" }),
    ),
  );
}

/** Wraps a button; adds no box of its own (display: contents). */
export function BarsReplay({ children }: { children: ReactNode }) {
  return (
    <span className="contents" onPointerEnter={(e) => replay(e.currentTarget)} onFocus={(e) => replay(e.currentTarget)}>
      {children}
    </span>
  );
}
