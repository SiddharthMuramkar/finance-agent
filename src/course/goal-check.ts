import { rawFormulaHits } from "../finance/raw-formula.ts";
import type { Topic } from "./map.ts";
import { FIGURE, repeatsInsight } from "./youll-learn-check.ts";

// The course check for a Topic's goal and its "what the Learner found" lines. The goal is shown in the Topic bar before the
// Learner has found the Insight, so it is in words (no digits, currency or percent signs, no typed formula, ADR 0002) and
// never repeats the written Insight. A found line takes its number from the Learner's own saved state ({value}); a figure
// typed into it would be a number nobody checked (ADR 0003). The step settings themselves (opens, doneWhen) are
// checked by the Topic schema in map.ts, which names the Widget, Check or Guided Task that does not exist.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

export function goalCheckErrors(topics: Pick<Topic, "id" | "goal" | "found" | "insight">[]): string[] {
  const errors: string[] = [];
  for (const topic of topics) {
    if (topic.goal) {
      if (FIGURE.test(topic.goal)) errors.push(`Topic ${topic.id} has a figure in its goal; write it in words: "${topic.goal}"`);
      const hits = rawFormulaHits(topic.goal);
      if (hits.length) errors.push(`Topic ${topic.id} types a formula in its goal (ADR 0002): ${hits.join("; ")}`);
      if (topic.insight && repeatsInsight(topic.goal, topic.insight.written)) errors.push(`Topic ${topic.id}'s goal repeats its Insight: say what the Learner will be able to do, not what they will find`);
    }
    (topic.found ?? []).forEach((f, i) => {
      if (/[0-9$€£₹¥]/.test(f.text.replaceAll("{value}", ""))) errors.push(`Topic ${topic.id} found line ${i + 1} types a figure; take it from the saved state with {value}: "${f.text}"`);
    });
  }
  return errors;
}
