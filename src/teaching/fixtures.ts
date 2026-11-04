/**
 * Example question templates for the Percent Topic's Skills, used by the engine's tests and as a pattern for Topic
 * files. The running example (4% to 5%: 1 point, 100 bp, 25%) is kept out of every draw.
 */
import type { QuestionTemplate } from "./templates.ts";

/** The running example's numbers, which no drawn question may use. */
export const RUNNING_EXAMPLE = [4, 5, 1, 100, 25];

export const BP_FROM_MOVE: QuestionTemplate = {
  id: "bp_from_move",
  skill: "pts_to_bp",
  ask: "A rate moves from {a}% to {b}%. How many basis points?",
  params: { a: { min: 1, max: 9, step: 0.25 }, d: { min: -1.2, max: 1.2, step: 0.05 } },
  derived: { b: "plus(a, d)" },
  answer: "bp_from_move",
  unit: "bp",
  decimals: 0,
  sign: "magnitude",
  mistakes: [
    { tag: "stopped_at_points", fix: "That is the move in points. Times 100 gives basis points." },
    { tag: "used_x10", fix: "One point is 100 basis points, so multiply by 100, not 10." },
  ],
  halfDone: { shows: "First step, done for you: the move is {points} points.", asks: "bp_from_points" },
  avoid: RUNNING_EXAMPLE,
};

export const POINTS_FROM_BP: QuestionTemplate = {
  id: "points_from_bp",
  skill: "bp_to_pts",
  ask: "A bond yield rises by {bp} basis points. How many percentage points is that?",
  params: { bp: { min: 10, max: 300, step: 5 } },
  answer: "points_from_bp",
  unit: "points",
  decimals: 2,
  sign: "magnitude",
  mistakes: [
    { tag: "divided_by_10", fix: "Divide by 100, not 10: 100 basis points make 1 point." },
    { tag: "divided_by_1000", fix: "Divide by 100, not 1,000: 100 basis points make 1 point." },
    { tag: "forgot_to_convert", fix: "That is still basis points. Divide by 100 for points." },
  ],
  avoid: RUNNING_EXAMPLE,
};

export const PCT_CHANGE: QuestionTemplate = {
  id: "pct_change",
  skill: "pct_change",
  ask: "A rate goes from {a}% to {b}%. By what percent of the old rate did it change, to one decimal place?",
  params: { a: { min: 1, max: 9, step: 0.5 }, d: { min: 0.25, max: 2, step: 0.25 } },
  derived: { b: "plus(a, d)" },
  answer: "pct_change",
  unit: "percent",
  decimals: 1,
  sign: "either",
  mistakes: [{ tag: "mixed_percent_points", fix: "That is the move in points. Divide it by the old rate, then times 100." }],
  avoid: RUNNING_EXAMPLE,
};

export const BP_FALL: QuestionTemplate = {
  id: "bp_fall",
  skill: "pts_to_bp",
  ask: "A rate falls from {a}% to {b}%. How many basis points did it fall?",
  params: { a: { min: 2, max: 9, step: 0.25 }, d: { min: -1.5, max: -0.05, step: 0.05 } },
  derived: { b: "plus(a, d)" },
  answer: "bp_from_move",
  unit: "bp",
  decimals: 0,
  sign: "either",
  mistakes: [
    { tag: "stopped_at_points", fix: "That is the fall in points. Times 100 gives basis points." },
    { tag: "used_x10", fix: "One point is 100 basis points, so multiply by 100, not 10." },
  ],
  halfDone: { shows: "First step, done for you: {a} minus {b} is {points} points.", asks: "bp_from_points" },
  avoid: RUNNING_EXAMPLE,
};

export const FIXTURE_TEMPLATES: QuestionTemplate[] = [BP_FROM_MOVE, POINTS_FROM_BP, PCT_CHANGE, BP_FALL];
