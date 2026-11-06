/**
 * The no-sum rule (ADR 0009): the Learner never types a number, and the Tutor never asks for a sum. Numbers may be
 * facts in a story or answer labels the Learner recognises; anything that needs working out is a sum.
 *
 * `sumAsk` is the one shared detector. Lint L10, reply check V8 and the story-recipe checks all call it. It is pure and
 * has no `@/` imports, so `scripts/check-course.mjs` can load it under plain Node.
 */

const NUMBER = String.raw`[₹$€£]?\d[\d,]*(?:\.\d+)?%?`;
const UNIT_WORD = /\b(?:basis points?|bps?|points?|percent|rupees|dollars|lakh|crore|notch(?:es)?|steps?|years?|months?|days?)\b|[₹$€£]|\d/i;

/** Compute is a sum-verb, but not in the AI-compute nouns ("compute costs", "compute capacity"). */
const COMPUTE = String.raw`compute(?!\s+(?:costs?|capacity|power|spend|agreements?|commitments?|deals?|budget))`;

/**
 * "work out" is a sum-verb when it has an object that is a number word ("work it out") or when it is asked of someone
 * ("can you work out", "to work out"), or when it opens the text as an instruction ("Work out the EMI"). "ETFs work out
 * a NAV each day" states a fact and is left alone.
 */
const WORK_OUT = String.raw`(?:^\s*work\s+out|work(?:ed|ing)?\s+(?:it|this|that)\s+out|(?:you|to|please|let['’]s|we can|can|could|try|then)\s+work(?:ed|ing)?\s+out)`;

/** Patterns that match anywhere in the text, tried in order; the first match is the phrase returned. */
const ANYWHERE: RegExp[] = [
  // 1. Calculate verbs (and "add 50 bp", the same ask in plain words).
  new RegExp(String.raw`\b(?:calculate|${COMPUTE}|${WORK_OUT}|figure\s+out|add\s+up|multiply|divide|subtract)\b`, "i"),
  new RegExp(String.raw`\b(?:add|take away)\s+${NUMBER}`, "i"),
  // 9. Recompute asks, in a Check prompt or in what a pass demands ("redo the arithmetic", "correct notch counts").
  /\b(?:re-?comput\w*|redo the (?:arithmetic|sums?|maths?|calculations?)|do the (?:arithmetic|sums?|maths?)|(?:correct|right) notch counts?)\b/i,
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
  // 10. "What is the move from 6% to 6.5%?": a question for the size of a change between two numbers. "What do traders
  // call the move from 6% to 6.5%?" asks for a name and is left alone.
  /\bwhat(?:['’]s|\s+is|\s+was|\s+would\s+be|\s+will\s+be)\s+(?:the\s+)?(?:size\s+of\s+the\s+)?(?:move|change|rise|fall|jump|drop|gap|cut|hike|increase|decrease)\b[^.?!]*\bfrom\b[^.?!]*\d[^.?!]*\bto\b[^.?!]*\d/i,
  // 11. "What is 1% of 5000?", "What would 10% of that be?": a share of something, asked as a figure.
  new RegExp(String.raw`\bwhat(?:['’]s|\s+is|\s+was|\s+would|\s+will|\s+are)\s+(?:be\s+)?${NUMBER}%\s+of\b`, "i"),
  // 12. "What do you owe after 2 years at 10%?": an amount owed, earned or paid over a time or at a rate.
  new RegExp(String.raw`\bwhat\s+(?:do|does|did|would|will|should)\s+(?:you|they|we|it|he|she|i|the\s+\w+)\s+(?:owe|earn|get|pay|make|save|have|end\s+up\s+with)\b[^.?!]*\b(?:after|over|at)\s+${NUMBER}`, "i"),
  // 13. "So 2 lakh at 5% earns what?": a number, then a money verb, then "what".
  new RegExp(String.raw`${NUMBER}[^.?!]{0,60}?\b(?:earns?|grows?(?:\s+to)?|makes?|gives?|becomes?|pays?|owes?|comes?\s+to|adds?\s+up\s+to|is\s+worth)\s+what\b`, "i"),
];

/**
 * "What is its operating margin?", "What is the present value of $5,000 ...?", "What was its revenue for the twelve
 * months ...?": a question for a figure that has to be worked out. Only a sum when the text also carries a number, so
 * "What is the present value of a payment?" (a words question) is left alone.
 */
const QUANTITY_ASK = new RegExp(
  String.raw`\bwhat(?:['’]s|\s+is|\s+was|\s+are|\s+were|\s+would\s+be|\s+will\s+be)\s+(?:the\s+|its\s+|their\s+|that\s+|this\s+)?(?:[\w$%.,/-]+\s+){0,5}?(?:present value|future value|margin|ratio|premium|cost of (?:equity|debt|capital)|revenue|difference|npa|rate|yield|total|average|payment|price|value|return|profit|loss|growth|spread|duration)\b`,
  "i",
);
const HAS_NUMBER = /\d/;

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
  // 8. A question for a figure ("What is its operating margin?") in text that gives numbers to work it out from.
  if (HAS_NUMBER.test(text)) {
    for (const sentence of text.split(/(?<=[.?!])\s+/)) {
      if (!sentence.includes("?")) continue;
      const hit = QUANTITY_ASK.exec(sentence);
      if (hit) return hit[0];
    }
  }
  return null;
}
