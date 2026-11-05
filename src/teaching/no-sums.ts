/**
 * The no-sum rule (ADR 0009): the Learner never types a number, and the Tutor never asks for a sum. Numbers may be
 * facts in a story or answer labels the Learner recognises; anything that needs working out is a sum.
 *
 * `sumAsk` is the one shared detector. Lint L10, reply check V8 and the story-recipe checks all call it. It is pure and
 * has no `@/` imports, so `scripts/check-course.mjs` can load it under plain Node.
 */

const NUMBER = String.raw`[₹$€£]?\d[\d,]*(?:\.\d+)?%?`;
const UNIT_WORD = /\b(?:basis points?|bps?|points?|percent|rupees|dollars|lakh|crore)\b|[₹$€£]|\d/i;

/** Compute is a sum-verb, but not in the AI-compute nouns ("compute costs", "compute capacity"). */
const COMPUTE = String.raw`compute(?!\s+(?:costs?|capacity|power|spend|agreements?|commitments?|deals?|budget))`;

/**
 * "work out" is a sum-verb when it has an object that is a number word ("work it out") or when it is asked of someone
 * ("can you work out", "to work out"). "ETFs work out a NAV each day" states a fact and is left alone.
 */
const WORK_OUT = String.raw`(?:work(?:ed|ing)?\s+(?:it|this|that)\s+out|(?:you|to|please|let['’]s|we can|can|could|try|then)\s+work(?:ed|ing)?\s+out)`;

/** Patterns that match anywhere in the text, tried in order; the first match is the phrase returned. */
const ANYWHERE: RegExp[] = [
  // 1. Calculate verbs (and "add 50 bp", the same ask in plain words).
  new RegExp(String.raw`\b(?:calculate|${COMPUTE}|${WORK_OUT}|figure\s+out|add\s+up|multiply|divide|subtract)\b`, "i"),
  new RegExp(String.raw`\b(?:add|take away)\s+${NUMBER}`, "i"),
  // 3. "what's ... worth", within 60 characters.
  /\bwhat(?:['’]s|\s+is|\s+was|\s+would|\s+will)\b[^.?!]{0,60}?\bworth\b/i,
  // 4. Arithmetic between numbers (a bare x needs a space on both sides). One unit word may sit after the first number.
  new RegExp(String.raw`${NUMBER}(?:\s+[a-z]+)?\s*(?:×|\*|÷|\/|\+|−|\s+x\s+|\btimes\b|\bplus\b|\bminus\b|\bdivided by\b|\bmultiplied by\b)\s*${NUMBER}`, "i"),
  // 5. Conversion asks.
  new RegExp(String.raw`\b(?:what is|convert|turn)\s+${NUMBER}[^.?!]*?\b(?:in|into)\s+(?:basis points|bps|points|percent|rupees|dollars)\b`, "i"),
  // 6. Rounding asks.
  /\bto\s+(?:\w+)\s+decimal\s+places?\b/i,
  // 7. Change asks.
  /\b(?:percent change|growth rate|return|ratio|margin)\b[^.?!]*\bfrom\b[^.?!]*\d[^.?!]*\bto\b[^.?!]*\d/i,
];

const HOW_MANY = /\bhow\s+(?:much|many)\b/i;

/** The phrase that makes `text` ask for a sum, or null when it asks a story or lingo question. */
export function sumAsk(text: string): string | null {
  for (const pattern of ANYWHERE) {
    const hit = pattern.exec(text);
    if (hit) return hit[0];
  }
  // 2. "how much" and "how many", but only in a sentence that has a digit, a currency sign or a unit word.
  for (const sentence of text.split(/(?<=[.?!])\s+/)) {
    const hit = HOW_MANY.exec(sentence);
    if (hit && UNIT_WORD.test(sentence)) return hit[0];
  }
  return null;
}
