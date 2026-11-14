"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Motion for the wave 1 parts. The global `prefers-reduced-motion` switch in globals.css already stops every CSS
// transition; these hooks also stop the changes that are driven from code (a flash on a new value, a delayed
// entrance), and say so in a data attribute the tests read.

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function reducedQuery(): MediaQueryList | undefined {
  try {
    return typeof window !== "undefined" ? window.matchMedia?.(REDUCED_QUERY) : undefined;
  } catch {
    return undefined;
  }
}

function subscribeReduced(onChange: () => void): () => void {
  const query = reducedQuery();
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

const readReduced = () => !!reducedQuery()?.matches;

/**
 * True when the Learner's system asks for reduced motion. The server cannot know, so it draws motion on, and a
 * hydrating page starts from that same answer before it reads the browser's (no hydration mismatch on
 * `data-motion` or a motion class). A page drawn only in the browser reads the browser's answer from its first frame.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, readReduced, () => false);
}

/**
 * True for one frame after `value` changes, so an element can start dim and fade up to full (a number crossfade, a
 * sentence sliding in). Never true under reduced motion, and not on the first draw.
 */
export function useChangeFlash(value: unknown, reduced: boolean): boolean {
  const [seen, setSeen] = useState(value);
  const [flash, setFlash] = useState(false);
  if (seen !== value) {
    setSeen(value);
    if (!reduced) setFlash(true);
  }
  useEffect(() => {
    if (!flash) return;
    const frame = requestAnimationFrame(() => setFlash(false));
    return () => cancelAnimationFrame(frame);
  }, [flash]);
  return flash && !reduced;
}

/** The value, once it has stayed the same for `ms` (the Verdict's live region, so dragging a slider does not spam a screen reader). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * A value held across renders: `wanted` replaces it only when `keep(held, wanted)` says no. This is how a scale stays
 * put while a slider moves (state set during render, not a ref read, so it is safe to render twice).
 */
export function useHeld<T>(wanted: T, keep: (held: T, wanted: T) => boolean): T {
  const [held, setHeld] = useState(wanted);
  const next = keep(held, wanted) ? held : wanted;
  if (next !== held) setHeld(next);
  return next;
}

/** The biggest number seen so far: a scale that only grows, so bars and notes do not shrink as a slider moves. */
export function useStickyMax(value: number): number {
  return useHeld(Number.isFinite(value) ? value : 0, (held, wanted) => held >= wanted);
}
