// Builds the valuation engine's yearly paths from single lever values (spec 2026-11-12, B1 and Appendix B.2), so a
// Workbench Widget can offer one slider for what is really ten numbers. Rates are fractions, as in dcf-engine.ts.
//
// This module imports nothing (no "@/" paths), so `scripts/check-course.mjs` can run it with Node's type stripping.

import { FORECAST_YEARS } from "./dcf-engine.ts";

/**
 * A margin that closes half the gap to its target each year, starting from the base year's margin:
 * each year's margin is the target plus half of last year's distance from it. Amazon's -36.71% heading for 10%
 * is -13.36% in year 1 and 9.95% in year 10.
 */
export function marginPath(start: number, target: number, years: number = FORECAST_YEARS): number[] {
  const path: number[] = [];
  let margin = start;
  for (let i = 0; i < years; i++) {
    margin = target + (margin - target) / 2;
    path.push(margin);
  }
  return path;
}

/** Halvings the search makes: far past the last digit a double holds, even for a range 2^60 wide. */
const HALVINGS = 120;

/**
 * Scales every year's growth rate by one factor so that revenue in year 10 equals `targetYear10Revenue`, keeping
 * the path's shape (fast early, slow late). The factor is found by halving a range. Null when no single factor
 * reaches the target: the target is not above zero, the path has no growth to scale, or the target is beyond the
 * most a path of that shape can reach.
 *
 * Revenue in year 10 as the factor k changes is base × Π(1 + k·g). Its log is concave in k, so it rises to one
 * peak and then falls (it only rises when no year's growth is negative). The search stays on the side of the peak
 * where the Case's own path (k = 1) sits, so a small move of the lever is a small change to the path.
 */
export function growthScaledTo(baseRevenue: number, growth: readonly number[], targetYear10Revenue: number): number[] | null {
  if (!(baseRevenue > 0) || !(targetYear10Revenue > 0) || !growth.every((g) => Number.isFinite(g) && g > -1)) return null;
  const scaled = (k: number) => growth.map((g) => k * g);
  if (growth.every((g) => g === 0)) return Math.abs(targetYear10Revenue - baseRevenue) <= 1e-9 * baseRevenue ? scaled(1) : null;

  const year10 = (k: number) => growth.reduce((revenue, g) => revenue * Math.max(0, 1 + k * g), baseRevenue);
  // How fast log(year-10 revenue) rises with k; it falls as k rises.
  const slope = (k: number) => growth.reduce((sum, g) => sum + g / (1 + k * g), 0);
  // Revenue stays above zero every year only between these factors.
  const rising = growth.filter((g) => g > 0);
  const falling = growth.filter((g) => g < 0);
  const lowest = rising.length ? Math.max(...rising.map((g) => -1 / g)) : -Infinity;
  const highest = falling.length ? Math.min(...falling.map((g) => -1 / g)) : Infinity;

  /** Halves [a, b] until it closes on where `isLeft` turns false. */
  const halve = (a: number, b: number, isLeft: (k: number) => boolean) => {
    for (let i = 0; i < HALVINGS; i++) {
      const middle = (a + b) / 2;
      if (isLeft(middle)) a = middle;
      else b = middle;
    }
    return (a + b) / 2;
  };
  /** Doubles the reach from `from` in direction `step` until `done`, or gives up. */
  const reach = (from: number, step: 1 | -1, done: (k: number) => boolean) => {
    for (let distance = 1; distance < 2 ** 60; distance *= 2) if (done(from + step * distance)) return from + step * distance;
    return null;
  };

  if (slope(1) >= 0) {
    // The Case's path is on the rising side: search from the factor where revenue reaches zero up to the peak.
    const peak = Number.isFinite(highest) ? halve(1, highest, (k) => slope(k) > 0) : Infinity;
    if (Number.isFinite(peak) && targetYear10Revenue > year10(peak)) return null;
    const top = Number.isFinite(peak) ? peak : reach(1, 1, (k) => year10(k) >= targetYear10Revenue);
    if (top === null) return null;
    return scaled(halve(lowest, top, (k) => year10(k) < targetYear10Revenue));
  }
  // The Case's path is on the falling side (its growth is mostly negative): search from the peak to where revenue reaches zero.
  const peak = Number.isFinite(lowest) ? halve(lowest, 1, (k) => slope(k) > 0) : -Infinity;
  if (Number.isFinite(peak) && targetYear10Revenue > year10(peak)) return null;
  const bottom = Number.isFinite(peak) ? peak : reach(1, -1, (k) => year10(k) >= targetYear10Revenue);
  if (bottom === null) return null;
  return scaled(halve(bottom, highest, (k) => year10(k) >= targetYear10Revenue));
}

/**
 * The risk lever (Appendix B.2): moves year 1's cost of capital to `lever` and scales every year's gap to year 10's
 * rate by the same proportion, (lever - year 10) / (year 1 - year 10), so the years between keep their shape and
 * year 10, which the terminal value uses, stays where it was. A flat path has no gap to scale, so years 1 to 9 all
 * move to the lever.
 */
export function riskScaled(costOfCapital: readonly number[], lever: number): number[] {
  const last = costOfCapital[costOfCapital.length - 1];
  const first = costOfCapital[0];
  if (first === last) return costOfCapital.map((c, i) => (i === costOfCapital.length - 1 ? c : lever));
  const scale = (lever - last) / (first - last);
  return costOfCapital.map((c, i) => (i === costOfCapital.length - 1 ? c : last + (c - last) * scale));
}

/**
 * The Terminal seesaw's second lever (spec B4): moves year 10's cost of capital, the rate the terminal value is discounted
 * and capitalised at, to `lever`, and scales every year's gap to year 1's rate by the same proportion,
 * (lever - year 1) / (year 10 - year 1), so year 1 stays where it was and the years between keep their shape: the mirror of
 * riskScaled. A flat path has no gap to scale, so only year 10 moves.
 */
export function matureRateScaled(costOfCapital: readonly number[], lever: number): number[] {
  const lastIndex = costOfCapital.length - 1;
  const first = costOfCapital[0];
  const last = costOfCapital[lastIndex];
  if (first === last) return costOfCapital.map((c, i) => (i === lastIndex ? lever : c));
  const scale = (lever - first) / (last - first);
  return costOfCapital.map((c, i) => (i === 0 ? c : first + (c - first) * scale));
}
