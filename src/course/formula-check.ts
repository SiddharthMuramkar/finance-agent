import { rawFormulaHits } from "../finance/raw-formula.ts";
import type { Topic } from "./map.ts";
import { textsIn, topicTexts, type TextGroup } from "./topic-texts.ts";

// The course check for typed formulas (ADR 0002). A converted Topic must hold no typed formula in
// any text a Learner or the Tutor reads: every text `topicTexts` gives. Topics not yet converted are on a list that can
// only shrink: a Topic on it that is clean must come off, and a Topic off it that is dirty fails.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** Topics that still type formulas. Remove an ID when its Topic is converted; never add one. */
export const NOT_YET_CONVERTED: readonly string[] = [
  "num-probability",
  "fs-balance",
  "fs-ratios",
  "fs-tax",
  "num-statistics",
  "eco-inflation-real",
  "eco-gdp-cycles",
  "fx-basics",
  "sov-default-country-risk",
  "eq-history",
  "risk-portfolio",
  "risk-capm",
  "mkt-efficiency",
  "mkt-behavioural",
  "cf-wacc",
  "cf-capital-structure",
  "val-dcf",
  "val-multiples",
  "val-young",
  "val-implied-erp",
  "val-india",
  "cf-venture",
  "mkt-ipo-float",
  "der-forwards",
  "der-option-pricing",
  "der-rates-fx",
  "der-hedging",
  "struct-securitisation",
  "real-assets",
  "hist-macro-regimes",
  "fol-sov-ratings",
  "fol-erp",
  "jud-assumptions",
  "jud-units-periods",
  "jud-filing-vs-claim",
  "ana-build-valuation",
  "ana-india-transfer",
  "ana-decide-between",
  "ana-anthropic-s1",
];

type Labelled = { where: string; text: string };

/**
 * The groups of Topic text a typed sum fails in even for a Topic on the not-yet-converted list: the teaching (spec #229:
 * cards, Skills, Quick tries with their choices, templates, terms, mix-up fixes, the Running example) and the scenes (E3)
 * are new, so they were written in words from the start. The other groups (Cases, questions, concept, principle,
 * Insight, Connections, conversation Checks) are what the list lets a Topic still type.
 */
const NEW_GROUPS: readonly TextGroup[] = ["teaching", "example", "scene"];

/** The texts a typed sum fails in even for a Topic on the not-yet-converted list. */
export function teachingTexts(topic: Topic): Labelled[] {
  return textsIn(topic, NEW_GROUPS);
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
      errors.push(`Topic ${topic.id} types a formula in its teaching (cards, Skills, Quick tries, templates and scenes say sums in words; ADR 0002):`, ...teaching.map((h) => `    ${h}`));
    }
    if (hits.length && !listed) {
      errors.push(`Topic ${topic.id} types a formula (use a formula marker or worded steps instead; ADR 0002):`, ...hits.map((h) => `    ${h}`));
    }
    if (!hits.length && listed) errors.push(`Topic ${topic.id} is converted: remove it from the not-yet-converted list in src/course/formula-check.ts`);
  }
  return errors;
}
