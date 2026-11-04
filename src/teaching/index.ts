/**
 * The teaching engine: exact answers, question templates and Known mistakes. A pure module with no database, no
 * model and no env; Quick tries, typed Check questions and the course check call it.
 */
export { exactEquals, exactFrom, formatExact, parseAnswer, plainExact } from "./answers.ts";
export type { Exact, SignRule, Unit } from "./answers.ts";
export { ANSWER_FNS } from "./quantities.ts";
export type { AnswerFnId } from "./quantities.ts";
export { MISTAKE_FNS } from "./mistakes.ts";
export type { KnownMistakeSpec, MistakeFnId } from "./mistakes.ts";
export { drawTemplate, templateProblems } from "./templates.ts";
export type { DrawnItem, ParamRange, QuestionTemplate } from "./templates.ts";
export { markAnswer } from "./mark.ts";
export type { FixedItem, Verdict } from "./mark.ts";
