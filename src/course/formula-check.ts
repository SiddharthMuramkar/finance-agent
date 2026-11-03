import { rawFormulaHits } from "../finance/raw-formula.ts";
import type { Topic } from "./map.ts";

// The course check for typed formulas (ADR 0002). A converted Topic must hold no typed formula in
// any text a Learner or the Tutor reads. Topics not yet converted are on a list that can only
// shrink: a Topic on it that is clean must come off, and a Topic off it that is dirty fails.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** Topics that still type formulas. Remove an ID when its Topic is converted; never add one. */
export const NOT_YET_CONVERTED: readonly string[] = [
  "num-percent-bps",
  "num-compounding",
  "num-probability",
  "fs-income",
  "fs-balance",
  "fs-cashflow",
  "fs-links",
  "fs-ratios",
  "fs-revenue-runrate",
  "fs-capex-dep",
  "fs-leases-debt",
  "fs-filings",
  "fs-earnings-quality",
  "fs-tax",
  "num-statistics",
  "eco-supply-demand",
  "eco-money-banking",
  "eco-central-banks",
  "eco-inflation-real",
  "eco-gdp-cycles",
  "eco-fiscal-debt",
  "bond-yield",
  "bond-yield-curve",
  "bond-duration",
  "bond-credit-spreads",
  "fx-basics",
  "eco-trade",
  "fx-bop",
  "in-economy",
  "sov-default-country-risk",
  "eq-history",
  "risk-portfolio",
  "risk-capm",
  "mkt-efficiency",
  "mkt-behavioural",
  "cf-capital-budgeting",
  "cf-wacc",
  "cf-capital-structure",
  "cf-payout",
  "credit-analysis",
  "val-dcf",
  "val-multiples",
  "val-young",
  "val-banks",
  "val-distress",
  "val-implied-erp",
  "val-india",
  "cf-venture",
  "mkt-ipo-float",
  "der-forwards",
  "der-options",
  "der-option-pricing",
  "der-rates-fx",
  "der-hedging",
  "bank-regulation",
  "crisis-bank-runs",
  "struct-securitisation",
  "private-credit",
  "funds-passive",
  "ins-risk-transfer",
  "real-assets",
  "hist-macro-regimes",
  "crisis-leverage",
  "fol-uber-2014",
  "fol-twitter-ipo",
  "fol-tesla-2020",
  "fol-roe",
  "fol-sov-ratings",
  "fol-subprime-ai",
  "fol-systemic-risk",
  "fol-money-trap",
  "fol-erp",
  "jud-rating-boundary",
  "jud-assumptions",
  "jud-narrative-numbers",
  "jud-ipo-forecast",
  "jud-predicted-outcomes",
  "jud-units-periods",
  "jud-filing-vs-claim",
  "jud-rating-conflict",
  "ana-build-valuation",
  "ana-who-pays-whom",
  "ana-commitments-debt",
  "ana-india-transfer",
  "ana-decide-between",
  "ana-anthropic-s1",
];

/** Every piece of Topic text a Learner or the Tutor reads, with a label saying where it is. */
export function topicTexts(topic: Topic): { where: string; text: string }[] {
  return [
    ...topic.cases.flatMap((c) => [
      { where: `case ${c.id} story`, text: c.story },
      { where: `case ${c.id} reveal`, text: c.reveal },
    ]),
    { where: "concept", text: topic.concept },
    { where: "principle", text: topic.principle },
    ...topic.connections.map((c, i) => ({ where: `connection ${i + 1}`, text: c.text })),
    ...topic.questions.flatMap((q) => [
      { where: `question ${q.id} prompt`, text: q.prompt },
      ...q.choices.map((c) => ({ where: `question ${q.id} choice ${c.id}`, text: c.text })),
      { where: `question ${q.id} explanation`, text: q.explanation },
    ]),
    ...topic.checks.flatMap((c) =>
      c.kind === "conversation"
        ? [
            { where: `check ${c.id} prompt`, text: c.prompt },
            { where: `check ${c.id} pass criteria`, text: c.passCriteria },
          ]
        : [],
    ),
  ];
}

/** Where a Topic types a formula, as "where: sign". */
export function typedFormulas(topic: Topic): string[] {
  return topicTexts(topic).flatMap(({ where, text }) => rawFormulaHits(text).map((hit) => `${where}: ${hit}`));
}

export function formulaCheckErrors(topics: Topic[], notYet: readonly string[] = NOT_YET_CONVERTED): string[] {
  const errors: string[] = [];
  const ids = new Set(topics.map((t) => t.id));
  for (const id of notYet) if (!ids.has(id)) errors.push(`"${id}" is on the not-yet-converted list but is not a Topic: remove it from src/course/formula-check.ts`);
  for (const topic of topics) {
    const hits = typedFormulas(topic);
    const listed = notYet.includes(topic.id);
    if (hits.length && !listed) {
      errors.push(`Topic ${topic.id} types a formula (use a formula marker or worded steps instead; ADR 0002):`, ...hits.map((h) => `    ${h}`));
    }
    if (!hits.length && listed) errors.push(`Topic ${topic.id} is converted: remove it from the not-yet-converted list in src/course/formula-check.ts`);
  }
  return errors;
}
