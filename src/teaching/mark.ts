/**
 * Marking: a Learner's typed number or True/False against one item, with no model call. The verdict is right, a
 * Known mistake with its one-line fix, or wrong.
 */
import {
  absolute,
  exactEquals,
  exactFrom,
  formatExact,
  isNegative,
  normalize,
  parseAnswer,
  type Exact,
  type SignRule,
  type Unit,
} from "./answers.ts";
import type { DrawnItem } from "./templates.ts";

/** A Quick try or Check question written in full in the Topic file: a number to type, or True or False. */
export interface FixedItem {
  id: string;
  skill: string;
  ask: string;
  kind: "number" | "truth";
  answer: number | boolean;
  /** Number items only; "number" when left out. */
  unit?: Unit;
  /**
   * Number items only: the decimals the ask states. Set it only when the answer is rounded ("to two decimal places"):
   * then a longer typed answer that rounds to it is right. Left out, the answer is exact, and a typed answer must
   * equal it (1.24 is not 1.2).
   */
  decimals?: number;
  /** Number items only; "either" when left out. */
  sign?: SignRule;
  /** Wrong answers the Topic expects, each with its one-line fix. A tag names it; without one it is `<item id>#<place>`. */
  mistakes?: { answer: number | boolean; fix: string; tag?: string }[];
}

export type Verdict = { verdict: "right" } | { verdict: "known_mistake"; tag: string; fix: string } | { verdict: "wrong" };

/** The number of decimal places a value needs, ignoring trailing zeros. */
const precision = (x: Exact) => normalize(x).scale;

/**
 * True when `input` is the answer under the item's sign rule. A rounded answer is compared at its `decimals`, so 8.333
 * is 8.33; an exact one is compared exactly, so 30.4 is not 30.
 */
export function matchesAnswer(input: Exact, answer: Exact, decimals: number, sign: SignRule, rounded = false): boolean {
  const places = rounded ? decimals : Math.max(decimals, precision(input), precision(answer));
  if (sign === "magnitude") return exactEquals(absolute(input), absolute(answer), places);
  if (exactEquals(input, answer, places)) return true;
  return sign === "either" && isNegative(answer) && exactEquals(input, absolute(answer), places);
}

/**
 * True when `input` is the Known mistake `value`. Sizes are compared, since a Learner who makes the mistake may drop
 * the sign as well, the same way as the answer: at the item's decimals when it is rounded, exactly otherwise, and
 * never coarser than the mistake's own decimals (0.012 is not 0.01). A mistake the same size as the answer (a wrong
 * sign) is compared with its sign.
 */
export function matchesMistake(input: Exact, value: Exact, answer: Exact, decimals: number, rounded = false): boolean {
  const places = Math.max(decimals, precision(value), rounded ? 0 : precision(input));
  if (exactEquals(absolute(value), absolute(answer), places)) return exactEquals(input, value, places);
  return exactEquals(absolute(input), absolute(value), places);
}

/** How the right answer is written back: a fall under the either rule reads "30 bp (a fall)". */
export function expectedText(answer: Exact, unit: Unit, sign: SignRule): string {
  if (!isNegative(answer) || sign === "signed") return formatExact(answer, unit);
  const size = formatExact(absolute(answer), unit);
  return sign === "either" ? `${size} (a fall)` : size;
}

const TRUE_WORDS = new Set(["true", "t", "yes", "y"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n"]);

function readTruth(input: string): boolean | null {
  const word = input.trim().toLowerCase().replace(/[.!]$/, "");
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return null;
}

function markTruth(item: FixedItem, input: string): Verdict & { expected: string } {
  const expected = item.answer ? "True" : "False";
  const picked = readTruth(input);
  if (picked === item.answer) return { verdict: "right", expected };
  const index = picked === null ? -1 : (item.mistakes ?? []).findIndex((m) => m.answer === picked);
  if (index >= 0) {
    const mistake = item.mistakes![index];
    return { verdict: "known_mistake", tag: mistake.tag ?? `${item.id}#${index}`, fix: mistake.fix, expected };
  }
  return { verdict: "wrong", expected };
}

interface NumberCase {
  answer: Exact;
  unit: Unit;
  decimals: number;
  sign: SignRule;
  rounded?: boolean;
  mistakes: { value: Exact; tag: string; fix: string }[];
}

function fixedCase(item: FixedItem): NumberCase {
  if (typeof item.answer !== "number") throw new Error(`Item ${item.id} is a number item with a ${typeof item.answer} answer`);
  const answer = exactFrom(item.answer);
  const mistakes = (item.mistakes ?? []).flatMap((m, index) =>
    typeof m.answer === "number" ? [{ value: exactFrom(m.answer), tag: m.tag ?? `${item.id}#${index}`, fix: m.fix }] : [],
  );
  return {
    answer,
    unit: item.unit ?? "number",
    decimals: item.decimals ?? precision(answer),
    sign: item.sign ?? "either",
    rounded: item.decimals !== undefined,
    mistakes,
  };
}

function markNumber(c: NumberCase, input: string): Verdict & { expected: string } {
  const expected = expectedText(c.answer, c.unit, c.sign);
  const typed = parseAnswer(input, c.unit);
  if (!typed) return { verdict: "wrong", expected };
  if (matchesAnswer(typed, c.answer, c.decimals, c.sign, c.rounded)) return { verdict: "right", expected };
  const mistake = c.mistakes.find((m) => matchesMistake(typed, m.value, c.answer, c.decimals, c.rounded));
  if (mistake) return { verdict: "known_mistake", tag: mistake.tag, fix: mistake.fix, expected };
  return { verdict: "wrong", expected };
}

/** Marks what the Learner typed against a fixed or drawn item. `expected` is the right answer as the Learner reads it. */
export function markAnswer(item: FixedItem | DrawnItem, input: string): Verdict & { expected: string } {
  if ("templateId" in item) return markNumber(item, input);
  if (item.kind === "truth") return markTruth(item, input);
  return markNumber(fixedCase(item), input);
}
