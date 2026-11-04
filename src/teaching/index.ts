/**
 * The teaching engine: exact answers, question templates and Known mistakes. A pure module with no database, no
 * model and no env; Quick tries, typed Check questions and the course check call it.
 */
export { exactEquals, exactFrom, formatExact, parseAnswer, plainExact } from "./answers";
export type { Exact, SignRule, Unit } from "./answers";
export { ANSWER_FNS } from "./quantities";
export type { AnswerFnId } from "./quantities";
export { MISTAKE_FNS } from "./mistakes";
export type { KnownMistakeSpec, MistakeFnId } from "./mistakes";
export { drawTemplate, templateProblems } from "./templates";
export type { DrawnItem, ParamRange, QuestionTemplate } from "./templates";
export { markAnswer } from "./mark";
export type { FixedItem, Verdict } from "./mark";
