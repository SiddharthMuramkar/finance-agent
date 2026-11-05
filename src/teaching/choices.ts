/**
 * The choice engine (ADR 0009): the Learner never types a number, so every number item becomes 2 to 4 answer choices
 * to tap. The right answer is one choice and each Known mistake's value is another, labelled in the item's unit
 * ("50 bp", "0.5 points", "₹2,420"), so a wrong tap is a named mix-up with its own one-line fix.
 *
 * Pure: no database, no model. The same seed always gives the same order, and a choice's id is its value, never its
 * position, so marking needs no seed.
 */
import { absolute, exactEquals, exactFrom, formatExact, isNegative, normalize, plainExact, type Exact, type SignRule, type Unit } from "./answers.ts";
import type { FixedItem } from "./mark.ts";
import type { DrawnItem } from "./templates.ts";

/** One answer to tap. A wrong choice with a `mistake` is a Known mistake and carries its one-line fix. */
export interface Choice {
  id: string;
  text: string;
  mistake?: { tag: string; fix: string };
}

/** The choices shown for an item, and the id of the right one. */
export interface ChoiceSet {
  choices: Choice[];
  answer: string;
}

/** The most choices an item shows. */
const MAX_CHOICES = 4;

/** A small string hash (cyrb53's first half), enough to seed a shuffle. */
function hash(text: string): number {
  let h = 0xdeadbeef;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 2654435761);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: a small deterministic generator of numbers in [0, 1). */
function generator(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same choices in an order the seed decides (Fisher-Yates), so the right answer is not always in one place. */
function shuffled<T>(items: readonly T[], seed: string): T[] {
  const random = generator(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** True when two values are the same answer under the sign rule (the size alone when the rule is not signed), at the item's decimals. */
function sameAnswer(a: Exact, b: Exact, sign: SignRule, places: number): boolean {
  const places_ = Math.max(places, normalize(a).scale, normalize(b).scale);
  return sign === "signed" ? exactEquals(a, b, places_) : exactEquals(absolute(a), absolute(b), places_);
}

interface NumberItem {
  id: string;
  answer: Exact;
  unit: Unit;
  sign: SignRule;
  decimals: number;
  label?: string;
  mistakes: { value: Exact; tag: string; fix: string }[];
}

function numberItem(item: FixedItem | DrawnItem): NumberItem | null {
  if ("templateId" in item) {
    return { id: item.id, answer: item.answer, unit: item.unit, sign: item.sign, decimals: item.decimals, label: item.label, mistakes: item.mistakes };
  }
  if (item.kind !== "number" || typeof item.answer !== "number") return null;
  const answer = exactFrom(item.answer);
  const mistakes = (item.mistakes ?? []).flatMap((m, index) =>
    typeof m.answer === "number" ? [{ value: exactFrom(m.answer), tag: m.tag ?? `${item.id}#${index}`, fix: m.fix }] : [],
  );
  return { id: item.id, answer, unit: item.unit ?? "number", sign: item.sign ?? "either", decimals: item.decimals ?? normalize(answer).scale, label: item.label, mistakes };
}

/** A value as the Learner reads it: in the item's unit, a fall under the either rule written "(a fall)", and the label pattern around it. */
function labelOf(n: NumberItem, value: Exact): string {
  const fall = isNegative(value) && n.sign !== "signed";
  const size = formatExact(fall ? absolute(value) : value, n.unit);
  const text = fall && n.sign === "either" ? `${size} (a fall)` : size;
  return n.label ? n.label.replace("{value}", text) : text;
}

function numberChoices(n: NumberItem): ChoiceSet {
  const answerId = plainExact(n.answer);
  const choices: Choice[] = [{ id: answerId, text: labelOf(n, n.answer) }];
  const seen = new Set([answerId, choices[0].text]);
  for (const m of n.mistakes) {
    const id = plainExact(m.value);
    const text = labelOf(n, m.value);
    if (sameAnswer(m.value, n.answer, n.sign, n.decimals) || seen.has(id) || seen.has(text)) continue;
    if (choices.length >= MAX_CHOICES) break;
    seen.add(id);
    seen.add(text);
    choices.push({ id, text, mistake: { tag: m.tag, fix: m.fix } });
  }
  return { choices, answer: answerId };
}

function truthChoices(item: FixedItem): ChoiceSet {
  const mistakes = item.mistakes ?? [];
  const pick = (value: boolean): Choice => {
    const index = mistakes.findIndex((m) => m.answer === value);
    const hit = index >= 0 && value !== item.answer ? mistakes[index] : undefined;
    return { id: String(value), text: value ? "True" : "False", ...(hit && { mistake: { tag: hit.tag ?? `${item.id}#${index}`, fix: hit.fix } }) };
  };
  return { choices: [pick(true), pick(false)], answer: String(item.answer) };
}

/**
 * The choices of an item in a fixed order, before any shuffle, whatever their number: the base of `choicesFor` and of
 * marking. Null for an item that cannot be turned into choices.
 */
export function choiceSet(item: FixedItem | DrawnItem): ChoiceSet | null {
  if ("templateId" in item) return numberChoices(numberItem(item)!);
  if (item.kind === "truth") return typeof item.answer === "boolean" ? truthChoices(item) : null;
  if (item.kind === "choice") {
    if (typeof item.answer !== "string" || !item.choices?.length) return null;
    return { choices: item.choices.map((c) => ({ id: c.id, text: c.text, ...(c.mistake && { mistake: c.mistake }) })), answer: item.answer };
  }
  const n = numberItem(item);
  return n ? numberChoices(n) : null;
}

/**
 * 2 to 4 answer choices for any item, in an order the seed decides (the same seed, the same order). Null when fewer
 * than 2 distinct choices remain: code then never shows the item, and lint L10 fails it. A True or False item keeps
 * its order.
 */
export function choicesFor(item: FixedItem | DrawnItem, seed: string): ChoiceSet | null {
  const set = choiceSet(item);
  if (!set || set.choices.length < 2) return null;
  const truth = !("templateId" in item) && item.kind === "truth";
  return { ...set, choices: truth ? set.choices : shuffled(set.choices, `${item.id}\u0000${seed}`) };
}
