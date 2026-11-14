import { rawFormulaHits } from "../finance/raw-formula.ts";
import type { Topic } from "./map.ts";

// The course check for You'll learn (spec #119). Every written Topic gives two or three short
// bullets in words: no digits, currency or percent signs, no typed formula (ADR 0002), and none that
// repeats the written Insight, since the bullets are shown before the Learner has found it.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

export const FIGURE = /[0-9%$€£₹¥]/;

const COMMON = new Set(["than", "that", "this", "with", "from", "when", "what", "which", "into", "more", "less", "they", "them", "their", "your", "have", "been", "even", "only", "much", "very", "same"]);

/** Words that carry meaning: four letters or more, lower case, not the commonest ones. */
const words = (text: string) => (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !COMMON.has(w));

/**
 * A bullet repeats the Insight when it holds it whole, holds a run of it, or says it in a new order:
 * three in five of the two texts' meaningful words, taken together, are shared.
 */
export function repeatsInsight(bullet: string, insight: string): boolean {
  const flat = (t: string) => words(t).join(" ");
  const [b, i] = [flat(bullet), flat(insight)];
  if (b.split(" ").length >= 3 && (i.includes(b) || b.includes(i))) return true;
  const own = new Set(words(bullet));
  const theirs = new Set(words(insight));
  const shared = [...own].filter((w) => theirs.has(w)).length;
  return shared >= 3 && shared / new Set([...own, ...theirs]).size >= 0.6;
}

export function youllLearnCheckErrors(topics: Pick<Topic, "id" | "youllLearn" | "insight">[]): string[] {
  const errors: string[] = [];
  for (const topic of topics) {
    if (!topic.youllLearn?.length) {
      errors.push(`Topic ${topic.id} has no You'll learn: give it two or three short bullets drafted from its concept and principle`);
      continue;
    }
    topic.youllLearn.forEach((bullet, i) => {
      const where = `You'll learn bullet ${i + 1}`;
      if (FIGURE.test(bullet)) errors.push(`Topic ${topic.id} has a figure in ${where}; write it in words: "${bullet}"`);
      const hits = rawFormulaHits(bullet);
      if (hits.length) errors.push(`Topic ${topic.id} types a formula in ${where} (ADR 0002): ${hits.join("; ")}`);
      if (topic.insight && repeatsInsight(bullet, topic.insight.written)) {
        errors.push(`Topic ${topic.id}'s ${where} repeats its Insight: draft it from the concept and principle only`);
      }
    });
  }
  return errors;
}
