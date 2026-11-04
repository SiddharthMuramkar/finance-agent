/**
 * Question templates: a Check question or Quick try whose numbers and answer code makes. Ranges, named answer
 * functions and named mistake functions, never eval strings; a seed makes each draw repeatable.
 */
import type { Exact, SignRule, Unit } from "./answers";
import type { KnownMistakeSpec, MistakeFnId } from "./mistakes";
import type { AnswerFnId } from "./quantities";

/** A drawn parameter runs from min to max in steps of step, all inclusive and exact (0.05 steps are exact). */
export interface ParamRange {
  min: number;
  max: number;
  step: number;
}

export interface QuestionTemplate {
  id: string;
  skill: string;
  /** The question, with {name} slots for its parameters, e.g. "A rate moves from {a}% to {b}%. How many basis points?" */
  ask: string;
  params: Record<string, ParamRange>;
  /** Values worked out from the parameters by a named function: { b: "plus(a, d)" }. */
  derived?: Record<string, string>;
  answer: AnswerFnId;
  unit: Unit;
  decimals: number;
  sign: SignRule;
  mistakes: KnownMistakeSpec[];
  /** The half-done variant (R5): `shows` is the first step done for the Learner, and the Learner gives `asks`. */
  halfDone?: { shows: string; asks: AnswerFnId };
  /** Numbers a draw must not use, such as the running example's and the Concept card's. */
  avoid?: number[];
}

/** One draw of a template: the question as the Learner reads it, and everything needed to mark it. */
export interface DrawnItem {
  id: string;
  templateId: string;
  skill: string;
  prompt: string;
  kind: "number";
  answer: Exact;
  unit: Unit;
  decimals: number;
  sign: SignRule;
  /** True when the answer is rounded to `decimals` (a percent change), so a longer typed answer that rounds to it is right. */
  rounded?: boolean;
  /** Every parameter and derived value, as plain decimals, so the draw can be stored and shown again. */
  params: Record<string, string>;
  mistakes: { value: Exact; tag: MistakeFnId; fix: string }[];
}
