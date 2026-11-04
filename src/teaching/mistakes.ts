/**
 * Known mistakes on templates: named functions that work out the wrong answer a Learner gives when they make that
 * slip, from the same numbers as the question. The Session's real wrong answers are the reference: 6 for 60 (used
 * ×10), 12 for 1.2 (divided by 10), 0.12 for 1.2 (divided by 1,000) and 0.3 for 30 (stopped at points).
 */
import { shift, type Exact } from "./answers.ts";
import { moveBp, movePoints, percentChange, type AnswerFnId, type Values } from "./quantities.ts";

export const MISTAKE_FNS = [
  "stopped_at_points",
  "used_x10",
  "divided_by_10",
  "divided_by_1000",
  "forgot_to_convert",
  "mixed_percent_points",
] as const;
export type MistakeFnId = (typeof MISTAKE_FNS)[number];

/** A Known mistake on a template: which slip, and the one-line fix from the Topic file. */
export interface KnownMistakeSpec {
  tag: MistakeFnId;
  fix: string;
}

/**
 * The wrong answer each slip gives, for a question answered by `answer`:
 * - stopped_at_points: the move in points, where basis points were asked (0.3 for 30).
 * - used_x10: points × 10, where × 100 was needed (6 for 60).
 * - divided_by_10: basis points ÷ 10, where ÷ 100 was needed (12 for 1.2).
 * - divided_by_1000: basis points ÷ 1,000 (0.12 for 1.2).
 * - forgot_to_convert: the given number handed back, the basis points for a points ask and the points otherwise.
 * - mixed_percent_points: the move in points for a percent-change ask, and the percent change otherwise.
 */
export function mistakeValue(tag: MistakeFnId, answer: AnswerFnId, v: Values, decimals: number): Exact {
  switch (tag) {
    case "stopped_at_points":
      return movePoints(v);
    case "used_x10":
      return shift(movePoints(v), 1);
    case "divided_by_10":
      return shift(moveBp(v), -1);
    case "divided_by_1000":
      return shift(moveBp(v), -3);
    case "forgot_to_convert":
      return answer === "points_from_bp" || answer === "points_between" ? moveBp(v) : movePoints(v);
    case "mixed_percent_points":
      return answer === "pct_change" ? movePoints(v) : percentChange(v, decimals);
  }
}
