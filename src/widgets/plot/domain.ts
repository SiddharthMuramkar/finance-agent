import { createContext, useState } from "react";
import { logTicks, niceTicks } from "./scales";

/**
 * What a Widget's Reset changes: wrap a Widget in a provider whose value changes on Reset, and every plot inside
 * starts its value axis over. Without a provider the axis only grows.
 */
export const PlotResetContext = createContext<unknown>(undefined);

/** What a plot's value axis shows: its bounds, and the round-number ticks between them. */
export type PlotDomain = { min: number; max: number; ticks: number[] };

export type Seen = { key: unknown; lo: number; hi: number };

/** The lowest and highest of the finite `values`, joined with what was seen before under the same key; `zero` keeps 0 inside. */
export function growSeen(seen: Seen | null, key: unknown, values: number[], zero: boolean): Seen {
  const base = seen && Object.is(seen.key, key) ? seen : { key, lo: zero ? 0 : Infinity, hi: zero ? 0 : -Infinity };
  let { lo, hi } = base;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { key, lo, hi };
}

/** The domain for what has been seen, widened to `yMin` / `yMax` where the author gave them, in round numbers. */
export function domainOf(seen: Seen, opts: { yMin?: number; yMax?: number; ticks?: number; log?: boolean } = {}): PlotDomain {
  let { lo, hi } = seen;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (typeof opts.yMin === "number" && Number.isFinite(opts.yMin)) lo = Math.min(lo, opts.yMin);
  if (typeof opts.yMax === "number" && Number.isFinite(opts.yMax)) hi = Math.max(hi, opts.yMax);
  const ticks = opts.log && lo > 0 ? logTicks(lo, hi) : niceTicks(lo, hi, opts.ticks ?? 5);
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

/**
 * A value axis that only grows. The domain is the union of every value seen so far, in round numbers, so dragging
 * a slider never rescales the axis under the Learner's hand; it starts over when `resetKey` changes (Reset).
 * `yMin` and `yMax` let an author who knows the range fix it up front. Bars and areas keep 0 inside the domain;
 * a line may pass `zero: false`.
 */
export function useStickyDomain(values: number[], opts: { resetKey?: unknown; yMin?: number; yMax?: number; zero?: boolean; ticks?: number } = {}): PlotDomain {
  const [seen, setSeen] = useState<Seen | null>(null);
  const next = growSeen(seen, opts.resetKey, values, opts.zero ?? true);
  // Remember what grew (React re-renders at once, with the same answer); this render already uses the grown domain.
  if (!seen || next.lo !== seen.lo || next.hi !== seen.hi || !Object.is(next.key, seen.key)) setSeen(next);
  return domainOf(next, opts);
}
