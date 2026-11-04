/**
 * The quantities a rate question is about, worked out exactly from a draw's values: the move in points, the move in
 * basis points and the percent change of the old rate. Answer functions and mistake functions both read them.
 */
import { divide, multiply, shift, subtract, type Exact } from "./answers.ts";

/** Named answer functions a template may use. */
export const ANSWER_FNS = ["points_between", "bp_from_move", "points_from_bp", "bp_from_points", "pct_change"] as const;
export type AnswerFnId = (typeof ANSWER_FNS)[number];

export type Values = Record<string, Exact>;

/** Thrown when a draw's values cannot give a quantity (a percent change from 0%, or a missing parameter). */
export class CannotCompute extends Error {}

/** The move in percentage points: `points`, else b − a, else bp ÷ 100. */
export function movePoints(v: Values): Exact {
  if (v.points) return v.points;
  if (v.a && v.b) return subtract(v.b, v.a);
  if (v.bp) return shift(v.bp, -2);
  throw new CannotCompute("needs points, a and b, or bp");
}

/** The move in basis points: `bp`, else points × 100. */
export function moveBp(v: Values): Exact {
  return v.bp ?? shift(movePoints(v), 2);
}

/** The percent change of the old rate a, rounded to `decimals`: (b − a) × 100 ÷ a. */
export function percentChange(v: Values, decimals: number): Exact {
  if (!v.a) throw new CannotCompute("needs a");
  const change = divide(multiply(movePoints(v), { scaled: 100n, scale: 0 }), v.a, decimals);
  if (!change) throw new CannotCompute("a is 0%, which has no percent change");
  return change;
}

/** The answer a named function gives for a draw. Points and basis-point answers are exact; a percent change is rounded to `decimals`. */
export function answerValue(fn: AnswerFnId, v: Values, decimals: number): Exact {
  switch (fn) {
    case "points_between":
      return movePoints(v);
    case "bp_from_move":
      return moveBp(v);
    case "points_from_bp":
      if (!v.bp) throw new CannotCompute("needs bp");
      return shift(v.bp, -2);
    case "bp_from_points":
      return shift(movePoints(v), 2);
    case "pct_change":
      return percentChange(v, decimals);
  }
}
