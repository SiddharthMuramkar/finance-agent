import { rawFormulaHits } from "../finance/raw-formula.ts";
import { WHY_MAX_WORDS, type Topic } from "./map.ts";
import { FIGURE, repeatsInsight } from "./youll-learn-check.ts";

// The course check for a Topic's goal, its "why it matters" line and its "what the Learner found" lines. The goal is shown
// in the Topic bar before the Learner has found the Insight, so it is in words (no digits, currency or percent signs, no
// typed formula, ADR 0003) and never repeats the written Insight. The why line (spec A6) links the Topic to valuing a
// company in thirty words or fewer, in plain words with no figure or typed formula, and is on every Spine Topic. A
// valuation starts from a story about the business, so the line never says it "starts from a rate". A found line takes its number from the Learner's own saved state ({value});
// a figure typed into it would be a number nobody checked (ADR 0009). The step settings themselves (opens, doneWhen) are
// checked by the Topic schema in map.ts, which names the Widget, Check or Guided Task that does not exist.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** Words in a line, as a person counts them: runs of letters, digits and joining marks between spaces. */
const wordCount = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** The wording A6 rules out: the Tutor once told a Learner that valuation "starts from a rate". */
const STARTS_FROM_A_RATE = /\bstarts?\s+(?:from|with)\s+(?:a|the)\s+(?:discount\s+)?rate\b/i;

/** Problems in one why line, without the Topic's name: too long, a figure or typed formula, or one that says valuation starts from a rate. */
export function whyProblems(why: string): string[] {
  const problems: string[] = [];
  const n = wordCount(why);
  if (n > WHY_MAX_WORDS) problems.push(`its why line has ${n} words; keep it to ${WHY_MAX_WORDS} or fewer`);
  // Plain words, no maths (spec A6): the Tutor says the line in its own words, and a number in it would be one nobody checked.
  if (FIGURE.test(why)) problems.push(`its why line has a figure; write it in words`);
  const hits = rawFormulaHits(why);
  if (hits.length) problems.push(`its why line types a formula (ADR 0003): ${hits.join("; ")}`);
  if (STARTS_FROM_A_RATE.test(why)) problems.push(`its why line says valuation starts from a rate; it starts from a story about the business (spec A6)`);
  return problems;
}

export function goalCheckErrors(topics: (Pick<Topic, "id" | "goal" | "found" | "insight" | "why"> & { stage?: Topic["stage"] })[]): string[] {
  const errors: string[] = [];
  for (const topic of topics) {
    if (topic.goal) {
      if (FIGURE.test(topic.goal)) errors.push(`Topic ${topic.id} has a figure in its goal; write it in words: "${topic.goal}"`);
      const hits = rawFormulaHits(topic.goal);
      if (hits.length) errors.push(`Topic ${topic.id} types a formula in its goal (ADR 0003): ${hits.join("; ")}`);
      if (topic.insight && repeatsInsight(topic.goal, topic.insight.written)) errors.push(`Topic ${topic.id}'s goal repeats its Insight: say what the Learner will be able to do, not what they will find`);
    }
    if (topic.why) for (const p of whyProblems(topic.why)) errors.push(`Topic ${topic.id}: ${p}: "${topic.why}"`);
    else if (topic.stage === "spine") errors.push(`Spine Topic ${topic.id} has no why line: give it one line, at most ${WHY_MAX_WORDS} words, linking it to valuing a company (spec A6)`);
    (topic.found ?? []).forEach((f, i) => {
      if (/[0-9$€£₹¥]/.test(f.text.replaceAll("{value}", ""))) errors.push(`Topic ${topic.id} found line ${i + 1} types a figure; take it from the saved state with {value}: "${f.text}"`);
    });
  }
  return errors;
}
