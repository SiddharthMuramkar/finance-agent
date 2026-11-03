import { rawFormulaHits } from "../finance/raw-formula.ts";
import type { Topic } from "./map.ts";

// The course check for You'll learn (spec #119). Every written Topic gives two or three short
// bullets in words: no digits, currency or percent signs, no typed formula (ADR 0002), and none that
// repeats the written Insight, since the bullets are shown before the Learner has found it.
// Topics not yet filled are on a list that can only shrink: a Topic on it that has bullets must come
// off. No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** Topics with no You'll learn yet, in default-path order. Remove an ID when its Topic is filled; never add one. */
export const NOT_YET_FILLED: readonly string[] = [
  "struct-securitisation",
  "private-credit",
  "funds-passive",
  "ins-risk-transfer",
  "real-assets",
  "hist-macro-regimes",
  "gov-ethics",
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

const FIGURE = /[0-9%$€£₹¥]/;

const COMMON = new Set(["than", "that", "this", "with", "from", "when", "what", "which", "into", "more", "less", "they", "them", "their", "your", "have", "been", "even", "only", "much", "very", "same"]);

/** Words that carry meaning: four letters or more, lower case, not the commonest ones. */
const words = (text: string) => (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !COMMON.has(w));

/**
 * A bullet repeats the Insight when it holds it whole, holds a run of it, or says it in a new order:
 * three in five of the two texts' meaningful words, taken together, are shared.
 */
function repeatsInsight(bullet: string, insight: string): boolean {
  const flat = (t: string) => words(t).join(" ");
  const [b, i] = [flat(bullet), flat(insight)];
  if (b.split(" ").length >= 3 && (i.includes(b) || b.includes(i))) return true;
  const own = new Set(words(bullet));
  const theirs = new Set(words(insight));
  const shared = [...own].filter((w) => theirs.has(w)).length;
  return shared >= 3 && shared / new Set([...own, ...theirs]).size >= 0.6;
}

export function youllLearnCheckErrors(topics: Pick<Topic, "id" | "youllLearn" | "insight">[], notYet: readonly string[] = NOT_YET_FILLED): string[] {
  const errors: string[] = [];
  const ids = new Set(topics.map((t) => t.id));
  for (const id of notYet) if (!ids.has(id)) errors.push(`"${id}" is on the not-yet-filled list but is not a Topic: remove it from src/course/youll-learn-check.ts`);
  for (const topic of topics) {
    const listed = notYet.includes(topic.id);
    if (!topic.youllLearn?.length) {
      if (!listed) errors.push(`Topic ${topic.id} has no You'll learn: give it two or three short bullets drafted from its concept and principle`);
      continue;
    }
    if (listed) errors.push(`Topic ${topic.id} has You'll learn: remove it from the not-yet-filled list in src/course/youll-learn-check.ts`);
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
