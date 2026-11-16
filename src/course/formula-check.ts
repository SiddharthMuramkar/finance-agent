import { rawFormulaHits } from "../finance/raw-formula.ts";
import type { Topic } from "./map.ts";
import { topicTexts } from "./topic-texts.ts";

// The course check for typed formulas (ADR 0003). No Topic may type a formula in any text a Learner or the Tutor reads:
// every text `topicTexts` gives, except Go deeper (spec #68), the one place a typed formula may sit. Anywhere else a
// formula is a Formula Card (a formula marker) or worded steps. There is no list of Topics let off.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

const hitsIn = (texts: { where: string; text: string }[]) => texts.flatMap(({ where, text }) => rawFormulaHits(text).map((hit) => `${where}: ${hit}`));

/** Where a Topic types a formula, as "where: sign". Go deeper may hold one (spec #68: formulas only behind Go deeper or as Formula Cards). */
export function typedFormulas(topic: Topic): string[] {
  return hitsIn(topicTexts(topic).filter((t) => t.group !== "deeper"));
}

export function formulaCheckErrors(topics: Topic[]): string[] {
  const errors: string[] = [];
  for (const topic of topics) {
    const hits = typedFormulas(topic);
    if (hits.length) {
      errors.push(`Topic ${topic.id} types a formula (move it into Go deeper, make it a Formula Card with a formula marker, or say it in worded steps; ADR 0003):`, ...hits.map((h) => `    ${h}`));
    }
  }
  return errors;
}
