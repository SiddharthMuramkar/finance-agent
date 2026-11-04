import { rateChange } from "@/finance/rate-change";
import { exactFrom, parseAnswer } from "@/teaching/answers";
import { expectedText, matchesAnswer } from "@/teaching/mark";

// What the RateMove part says and marks, kept out of the "use client" part so the rate_move recipe (run on the
// server) can read the same labels. Marking is T02's exact arithmetic: no floating point decides a mark.

/** The labels of the three worked lines, in order. */
export const RATE_MOVE_LABELS = ["Points: new minus old", "Basis points: points times 100", "Percent of the old rate"] as const;

/** The highest rate the part draws and its play sliders reach, in percent. */
export const RATE_MOVE_MAX = 20;

export type MoveMark = {
  /** right or wrong once read; unread when the typed text is not one number, which is never marked. */
  status: "right" | "wrong" | "unread";
  /** The move as the answer is written back: "20 bp", or "30 bp (a fall)". */
  expected: string;
  /** True when a wrong answer is the move in points (0.2 for 20 bp): the Learner stopped before times 100. */
  inPoints: boolean;
};

/**
 * Marks a typed answer to "by how many basis points did the rate move from oldRate to newRate?", exactly in whole
 * basis points for a move of any size. "20", "20bp" and "20 bp" are all read; a fall may be typed as its size, with
 * a minus sign, or in words ("a fall of 30"), but a fall (-20) is never right for a rise.
 */
export function markMove(typed: string, oldRate: number, newRate: number): MoveMark {
  const { basisPoints, points } = rateChange(oldRate, newRate);
  const answer = exactFrom(basisPoints);
  const expected = expectedText(answer, "bp", "either");
  const input = parseAnswer(typed, "bp");
  if (!input) return { status: "unread", expected, inPoints: false };
  if (matchesAnswer(input, answer, 0, "either")) return { status: "right", expected, inPoints: false };
  return { status: "wrong", expected, inPoints: basisPoints !== 0 && matchesAnswer(input, exactFrom(points), 2, "either") };
}
