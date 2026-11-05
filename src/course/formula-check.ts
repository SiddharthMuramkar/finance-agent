import { rawFormulaHits } from "../finance/raw-formula.ts";
import type { Topic } from "./map.ts";

// The course check for typed formulas (ADR 0002). A converted Topic must hold no typed formula in
// any text a Learner or the Tutor reads. Topics not yet converted are on a list that can only
// shrink: a Topic on it that is clean must come off, and a Topic off it that is dirty fails.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** Topics that still type formulas. Remove an ID when its Topic is converted; never add one. */
export const NOT_YET_CONVERTED: readonly string[] = [
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
  "fol-erp",
  "jud-assumptions",
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

type Labelled = { where: string; text: string };

/**
 * The teaching a converted Topic's file holds (spec #229): card lines and write-down lines, Skill rules and analogies,
 * Quick-try asks and fixes, template asks, fixes and half-done steps, wrong choices' fixes and the Running example.
 * These are new, so a typed sum in them fails even for a Topic on the not-yet-converted list.
 */
export function teachingTexts(topic: Topic): Labelled[] {
  const texts: Labelled[] = [];
  if (topic.runningExample) texts.push({ where: "running example", text: topic.runningExample.text });
  for (const x of topic.terms) texts.push({ where: `term ${x.term}`, text: `${x.term}: ${x.means}` });
  for (const s of topic.skills) {
    texts.push({ where: `skill ${s.id} rule`, text: s.rule });
    if (s.analogy) texts.push({ where: `skill ${s.id} analogy`, text: s.analogy });
  }
  for (const t of topic.templates) {
    texts.push({ where: `template ${t.id} ask`, text: t.ask });
    if (t.halfDone) texts.push({ where: `template ${t.id} half-done step`, text: t.halfDone.shows });
    for (const m of t.mistakes) texts.push({ where: `template ${t.id} fix ${m.tag}`, text: m.fix });
  }
  for (const q of topic.questions) {
    for (const c of q.choices) if (c.mistake) texts.push({ where: `question ${q.id} choice ${c.id} fix`, text: c.mistake.fix });
  }
  for (const c of topic.checks) {
    if (c.card) {
      c.card.lines.forEach((line, i) => texts.push({ where: `check ${c.id} card line ${i + 1}`, text: line }));
      texts.push({ where: `check ${c.id} card write-down`, text: c.card.writeDown });
    }
    for (const q of c.quickTries) {
      if (!("id" in q)) continue;
      texts.push({ where: `check ${c.id} quick try ${q.id} ask`, text: q.ask });
      if (q.halfDone) texts.push({ where: `check ${c.id} quick try ${q.id} half-done step`, text: q.halfDone });
      (q.mistakes ?? []).forEach((m, i) => texts.push({ where: `check ${c.id} quick try ${q.id} fix ${i + 1}`, text: m.fix }));
    }
  }
  return texts;
}

/** Every piece of Topic text a Learner or the Tutor reads, with a label saying where it is. */
export function topicTexts(topic: Topic): Labelled[] {
  return [...earlierTexts(topic), ...teachingTexts(topic)];
}

/** The texts every Topic had before the teaching fields. */
function earlierTexts(topic: Topic): Labelled[] {
  return [
    ...topic.cases.flatMap((c) => [
      { where: `case ${c.id} story`, text: c.story },
      { where: `case ${c.id} reveal`, text: c.reveal },
    ]),
    { where: "concept", text: topic.concept },
    { where: "principle", text: topic.principle },
    ...(topic.insight
      ? [
          { where: "insight question", text: topic.insight.question },
          { where: "insight written", text: topic.insight.written },
          { where: "insight foundWhen", text: topic.insight.foundWhen },
          ...topic.insight.hints.map((h, i) => ({ where: `insight hint ${i + 1}`, text: h })),
        ]
      : []),
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

const hitsIn = (texts: Labelled[]) => texts.flatMap(({ where, text }) => rawFormulaHits(text).map((hit) => `${where}: ${hit}`));

/** Where a Topic types a formula, as "where: sign". */
export function typedFormulas(topic: Topic): string[] {
  return hitsIn(topicTexts(topic));
}

export function formulaCheckErrors(topics: Topic[], notYet: readonly string[] = NOT_YET_CONVERTED): string[] {
  const errors: string[] = [];
  const ids = new Set(topics.map((t) => t.id));
  for (const id of notYet) if (!ids.has(id)) errors.push(`"${id}" is on the not-yet-converted list but is not a Topic: remove it from src/course/formula-check.ts`);
  for (const topic of topics) {
    const hits = typedFormulas(topic);
    const listed = notYet.includes(topic.id);
    const teaching = hitsIn(teachingTexts(topic));
    if (teaching.length && listed) {
      errors.push(`Topic ${topic.id} types a formula in its teaching (cards, Skills, Quick tries and templates say sums in words; ADR 0002):`, ...teaching.map((h) => `    ${h}`));
    }
    if (hits.length && !listed) {
      errors.push(`Topic ${topic.id} types a formula (use a formula marker or worded steps instead; ADR 0002):`, ...hits.map((h) => `    ${h}`));
    }
    if (!hits.length && listed) errors.push(`Topic ${topic.id} is converted: remove it from the not-yet-converted list in src/course/formula-check.ts`);
  }
  return errors;
}
