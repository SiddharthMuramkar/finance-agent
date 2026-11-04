/**
 * The teaching engine: exact answers, question templates and Known mistakes. A pure module with no database, no
 * model and no env; Quick tries, typed Check questions and the course check call it.
 */
export { exactEquals, exactFrom, formatExact, parseAnswer, plainExact } from "./answers";
export type { Exact, SignRule, Unit } from "./answers";
