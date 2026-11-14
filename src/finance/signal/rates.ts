import { rateChange } from "../rate-change";

/**
 * The Signal rates Widget's model (spec §6.5, "One move, three sizes"). One move from an old rate to a new rate has
 * three sizes: points, basis points and a percent of the old rate. Rates are percentages (4.5 means 4.5%).
 */
export type RateMove = {
  /** New minus old, in percentage points, to two decimals. Negative for a fall. */
  points: number;
  /** The same move in basis points (hundredths of a point), whole. Negative for a fall. */
  basisPoints: number;
  /** The move as a percent of the old rate, to two decimals; null when the old rate is 0%. Negative for a fall. */
  percentOfOld: number | null;
  /**
   * The trap: "up {points}%" read as a percent of the old rate. `points` is that literal move (always positive) and
   * `target` is the rate it would give. Null when there is no move.
   */
  literal: { points: number; target: number } | null;
};

/** Strips float noise: 3 × 0.1 / 100 (0.0030000000000000005) is 0.003. Slider rates need at most 6 decimals here. */
const clean = (value: number) => Number(value.toFixed(10));

/**
 * Spec §6.5.1: pts = round(n − o, 2), bp = round(pts × 100), rel = pts / o × 100, literal = o × |pts| / 100,
 * target = o ± literal. Points, basis points and the percent come from rateChange, so this Widget, Percent's Widget
 * and the Tutor say the same sizes.
 */
export function rateMove(oldRate: number, newRate: number): RateMove {
  const change = rateChange(oldRate, newRate);
  const literalPoints = clean((oldRate * Math.abs(change.points)) / 100);
  return {
    points: change.points,
    basisPoints: change.basisPoints,
    percentOfOld: change.percentChange,
    literal: change.points === 0 ? null : { points: literalPoints, target: clean(oldRate + Math.sign(change.points) * literalPoints) },
  };
}

/** The facts grid's three cells (spec §6.5.2 "Readouts"), in ink only: direction is never coloured. */
export type RateMoveReadouts = {
  /** "How far it moved": "up 1 point". */
  howFar: string;
  /** "How traders say it": "+100 bp". */
  traders: string;
  /** "Next to the old rate": "up 25%". */
  nextToOld: string;
};

export function rateMoveReadouts(oldRate: number, newRate: number): RateMoveReadouts {
  const move = rateMove(oldRate, newRate);
  if (move.points === 0) return { howFar: "No move", traders: "0 bp", nextToOld: "0%" };
  const up = move.points > 0;
  const points = Math.abs(move.points);
  // The old-rate slider starts at 1% (spec §6.5.1), so the percent of the old rate is never null here.
  return {
    howFar: `${up ? "up" : "down"} ${points} ${points === 1 ? "point" : "points"}`,
    traders: `${up ? "+" : "−"}${Math.abs(move.basisPoints)} bp`,
    nextToOld: `${up ? "up" : "down"} ${Math.abs(move.percentOfOld ?? 0)}%`,
  };
}
