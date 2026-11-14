import { BEHAVIOUR_QUESTIONS } from "@/behaviour/questions";
import type { ComparisonQuestion } from "./compare";

/**
 * The fixed tutoring questions every model answers. Only the Learner's wording and a short
 * reference live here (no source material). Our own teaching questions come first (with a
 * reference for correctness), then a spread of rule-testing questions reused from the behaviour
 * set. FinanceBench open-sample items are added at run time from the downloaded file.
 */
const own: ComparisonQuestion[] = [
  { id: "pv-compute", source: "own", at: "your_turn", turns: ["What is $1,000 received in 5 years worth today if the right discount rate is 6% a year?"], reference: "1000 / 1.06^5 = about $747.26." },
  { id: "pv-rate-direction", source: "own", at: "your_turn", turns: ["If the discount rate goes up, does the present value of a fixed future payment go up or down, and why?"], reference: "Down: a higher rate means the same payment is discounted more, so it is worth less today." },
  { id: "pv-why-annuity-bigger", source: "own", at: "story", turns: ["Why can an annuity that pays out more in total still be worth less than a smaller cash option today?"], reference: "Time value of money: later payments are discounted, so the total of the nominal payments overstates what they are worth today." },
  { id: "pv-check-confirm", source: "own", at: "check", turns: ["I worked it out as $747. Is that right? Check my method too."], reference: "$1000/1.06^5 = $747.26, so $747 is right to the dollar if the method was discounting 5 years at 6%." },
  { id: "pv-compounding-vs-discounting", source: "own", at: "your_turn", turns: ["Is discounting just compounding run backwards? Explain how they connect."], reference: "Yes: future value = PV x (1+r)^n, so PV = FV / (1+r)^n; discounting divides by the same growth factor compounding multiplies by." },
];

const REUSED = [
  "buy-sell-direct-lottery",
  "stock-call-direct-pick",
  "forecast-direct-rates",
  "figures-direct-sp500",
  "hindsight-direct-choice",
  "hindsight-indirect-twostep",
  "roleplay-direct-dan",
  "today-fed",
];

const reused: ComparisonQuestion[] = REUSED.map((id) => {
  const q = BEHAVIOUR_QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`behaviour question ${id} not found`);
  return { id: `rule-${id}`, source: "own" as const, at: q.at, turns: q.turns, guardsReveal: q.rule === "hindsight" };
});

export const OWN_COMPARISON_QUESTIONS: ComparisonQuestion[] = [...own, ...reused];

/** FinanceBench open-sample items that fit a tutoring chat: each carries its own extract. Short extracts, judgement or ratio questions. */
export const FINANCEBENCH_IDS = ["financebench_id_00438", "financebench_id_00591", "financebench_id_00540", "financebench_id_00799", "financebench_id_01858", "financebench_id_00499"];
