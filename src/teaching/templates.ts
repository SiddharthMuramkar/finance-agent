/**
 * Question templates: a Check question or Quick try whose numbers and answer code makes. Ranges, named answer
 * functions and named mistake functions, never eval strings; a seed makes each draw repeatable.
 */
import {
  absolute,
  add,
  divide,
  exactEquals,
  exactFrom,
  formatExact,
  isNegative,
  isZero,
  multiply,
  normalize,
  plainExact,
  roundTo,
  sameValue,
  subtract,
  type Exact,
  type SignRule,
  type Unit,
} from "./answers.ts";
import { matchesAnswer } from "./mark.ts";
import { MISTAKE_FNS, mistakeValue, type KnownMistakeSpec, type MistakeFnId } from "./mistakes.ts";
import { nearRoundingBoundary } from "./growth.ts";
import { ANSWER_FNS, BOUNDARY_FNS, CannotCompute, ROUNDED_FNS, answerValue, moveBp, movePoints, type AnswerFnId, type Values } from "./quantities.ts";

/** A drawn parameter runs from min to max in steps of step, all inclusive and exact (0.05 steps are exact). */
export interface ParamRange {
  min: number;
  max: number;
  step: number;
}

export interface QuestionTemplate {
  id: string;
  skill: string;
  /** The question, with {name} slots for its parameters, e.g. "A rate moves from {a}% to {b}%. How many basis points?" */
  ask: string;
  params: Record<string, ParamRange>;
  /** Values worked out from the parameters by a named function: { b: "plus(a, d)" }. */
  derived?: Record<string, string>;
  answer: AnswerFnId;
  unit: Unit;
  decimals: number;
  sign: SignRule;
  mistakes: KnownMistakeSpec[];
  /** The half-done variant (R5): `shows` is the first step done for the Learner, and the Learner gives `asks`. */
  halfDone?: { shows: string; asks: AnswerFnId };
  /** Numbers a draw must not use, such as the running example's and the Concept card's. */
  avoid?: number[];
}

/** One draw of a template: the question as the Learner reads it, and everything needed to mark it. */
export interface DrawnItem {
  id: string;
  templateId: string;
  skill: string;
  prompt: string;
  kind: "number";
  answer: Exact;
  unit: Unit;
  decimals: number;
  sign: SignRule;
  /** True when the answer is rounded to `decimals` (a percent change), so a longer typed answer that rounds to it is right. */
  rounded?: boolean;
  /** Every parameter and derived value, as plain decimals, so the draw can be stored and shown again. */
  params: Record<string, string>;
  mistakes: { value: Exact; tag: MistakeFnId; fix: string }[];
}

/** Functions a derived value may use, written "plus(a, d)". Each is exact. */
const DERIVED_FNS: Record<string, (x: Exact, y: Exact) => Exact> = {
  plus: add,
  minus: subtract,
  times: multiply,
};

const DERIVED = /^\s*([a-z_]+)\(\s*([\w.-]+)\s*,\s*([\w.-]+)\s*\)\s*$/;
const NAME = /^[a-z_]\w*$/i;
const SLOT = /\{(\w+)\}/g;
const MAX_ATTEMPTS = 500;

/** A template's problem, found before any Learner sees a draw. */
class TemplateProblem extends Error {}

/** cyrb53: a short string hash, so any seed string gives a 53-bit number. */
function hash(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32: a small deterministic generator of numbers in [0, 1). */
function generator(seed: string): () => number {
  let state = hash(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many values a range holds; a problem when it is empty or its step does not divide it exactly. */
function rangeSize(name: string, range: ParamRange): { min: Exact; step: Exact; count: number } {
  const valid = [range.min, range.max, range.step].every(Number.isFinite) && range.step > 0 && range.min <= range.max;
  if (!valid) throw new TemplateProblem(`range ${name} needs min <= max and a step above 0`);
  const min = exactFrom(range.min);
  const step = exactFrom(range.step);
  const span = subtract(exactFrom(range.max), min);
  const steps = divide(span, step, 0)!;
  if (!sameValue(multiply(steps, step), span)) {
    throw new TemplateProblem(`range ${name}: step ${range.step} does not divide ${range.min} to ${range.max}`);
  }
  return { min, step, count: Number(steps.scaled) + 1 };
}

function deriveOne(name: string, expression: string, values: Values): Exact {
  const match = DERIVED.exec(expression);
  const fn = match ? DERIVED_FNS[match[1]] : undefined;
  if (!match || !fn) throw new TemplateProblem(`derived ${name}: "${expression}" is not plus(x, y), minus(x, y) or times(x, y)`);
  const operand = (token: string) => {
    if (NAME.test(token)) {
      const value = values[token];
      if (!value) throw new TemplateProblem(`derived ${name}: "${token}" is not a parameter or an earlier derived value`);
      return value;
    }
    try {
      return exactFrom(token);
    } catch {
      throw new TemplateProblem(`derived ${name}: "${token}" is not a name or a number`);
    }
  };
  return fn(operand(match[2]), operand(match[3]));
}

/** Runs `read`, giving undefined when the draw's values cannot give that quantity. */
function tryCompute<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    if (error instanceof CannotCompute) return undefined;
    throw error;
  }
}

/** The values a slot may name: parameters, derived values, and the size of the move in points ({points}) and basis points ({bp}). */
function slotValues(values: Values): Values {
  const slots: Values = { ...values };
  const points = slots.points ?? tryCompute(() => absolute(movePoints(values)));
  const bp = slots.bp ?? tryCompute(() => absolute(moveBp(values)));
  if (points) slots.points = points;
  if (bp) slots.bp = bp;
  return slots;
}

function fill(text: string, slots: Values, where: string): string {
  return text.replace(SLOT, (_, name: string) => {
    const value = slots[name];
    if (!value) throw new TemplateProblem(`${where}: slot {${name}} names no parameter or derived value`);
    return formatExact(value, "number");
  });
}

const slotNames = (text: string) => [...text.matchAll(SLOT)].map((m) => m[1]);

/** One attempt at a draw: the item, or null when these numbers break a draw rule and the next numbers should be tried. */
function attempt(t: QuestionTemplate, random: () => number, halfDone: boolean, seed: string): DrawnItem | null {
  const values: Values = {};
  for (const [name, range] of Object.entries(t.params)) {
    const { min, step, count } = rangeSize(name, range);
    values[name] = add(min, multiply(exactFrom(Math.floor(random() * count)), step));
  }
  for (const [name, expression] of Object.entries(t.derived ?? {})) {
    if (t.params[name]) throw new TemplateProblem(`derived ${name} has the same name as a parameter`);
    values[name] = deriveOne(name, expression, values);
  }

  const fn = halfDone ? t.halfDone!.asks : t.answer;
  const rounded = ROUNDED_FNS.includes(fn);
  const computed = tryCompute(() => answerValue(fn, values, t.decimals));
  if (!computed) return null; // a percent change from 0%: try other numbers
  if (BOUNDARY_FNS.includes(fn) && nearRoundingBoundary(computed, t.decimals)) return null; // could fairly round either way
  if (!rounded && !sameValue(roundTo(computed, t.decimals), computed)) {
    throw new TemplateProblem(`answer ${plainExact(computed)} is not exact at ${t.decimals} decimals; raise decimals`);
  }
  // Under the magnitude rule the answer is a size, so it is stored without a sign, and so are its mistakes.
  const size = (x: Exact) => (t.sign === "magnitude" ? absolute(x) : x);
  const answer = size(normalize(roundTo(computed, t.decimals)));
  const move = tryCompute(() => movePoints(values));
  if (isZero(answer) || (move && isZero(move))) return null;

  const slots = slotValues(values);
  const text = halfDone ? `${t.ask} ${t.halfDone!.shows}` : t.ask;
  const shown = slotNames(text).flatMap((name) => (slots[name] ? [slots[name]] : []));
  if (shown.some(isNegative)) return null;
  const avoid = (t.avoid ?? []).map(exactFrom);
  const used = [...Object.values(values), ...shown, answer];
  if (used.some((x) => avoid.some((a) => sameValue(absolute(x), absolute(a))))) return null;

  const fixSlots: Values = { ...slots, answer: absolute(answer) };
  const mistakes = t.mistakes.map((m) => ({
    // On a rounded ask the mistake is rounded the same way, so a typed 8.3 matches 100 ÷ 12 = 8.33...
    value: size(normalize(rounded ? roundTo(mistakeValue(m.tag, fn, values, Math.max(t.decimals, 2)), t.decimals) : mistakeValue(m.tag, fn, values, Math.max(t.decimals, 2)))),
    tag: m.tag,
    fix: fill(m.fix, fixSlots, `mistake ${m.tag}`),
  }));
  const clashes = (value: Exact) =>
    exactEquals(absolute(value), absolute(answer), Math.max(t.decimals, normalize(value).scale, answer.scale)) ||
    matchesAnswer(value, answer, t.decimals, t.sign, rounded);
  if (mistakes.some((m) => clashes(m.value))) return null;

  return {
    id: `${t.id}:${seed}${halfDone ? ":half" : ""}`,
    templateId: t.id,
    skill: t.skill,
    prompt: fill(text, slots, "ask"),
    kind: "number",
    answer,
    unit: t.unit,
    decimals: t.decimals,
    sign: t.sign,
    rounded,
    params: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, plainExact(value)])),
    mistakes,
  };
}

/**
 * Draws one question from a template. The same seed always gives the same draw. A draw never has a zero move, never
 * shows a negative number, never uses a number in `avoid`, and never has an answer equal to one of its Known-mistake
 * values. With `halfDone`, the template's first step is shown and the Learner gives the last.
 */
export function drawTemplate(t: QuestionTemplate, seed: string, opts?: { halfDone?: boolean }): DrawnItem {
  const halfDone = opts?.halfDone ?? false;
  if (halfDone && !t.halfDone) throw new Error(`Template ${t.id} has no half-done variant`);
  const random = generator(`${t.id}\u0000${seed}\u0000${halfDone ? "half" : "full"}`);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const item = attempt(t, random, halfDone, seed);
    if (item) return item;
  }
  throw new Error(`Template ${t.id} found no valid draw in ${MAX_ATTEMPTS} tries: widen its ranges or shorten avoid`);
}

/** What is wrong with a template, in words for the course check; empty when it is sound and draws. */
export function templateProblems(t: QuestionTemplate): string[] {
  const problems: string[] = [];
  const answerFns: readonly string[] = ANSWER_FNS;
  const mistakeFns: readonly string[] = MISTAKE_FNS;
  if (!answerFns.includes(t.answer)) problems.push(`answer function "${t.answer}" is not one of ${ANSWER_FNS.join(", ")}`);
  if (t.halfDone && !answerFns.includes(t.halfDone.asks)) {
    problems.push(`half-done answer function "${t.halfDone.asks}" is not one of ${ANSWER_FNS.join(", ")}`);
  }
  for (const m of t.mistakes) {
    if (!mistakeFns.includes(m.tag)) problems.push(`mistake "${m.tag}" is not one of ${MISTAKE_FNS.join(", ")}`);
  }
  if (!Number.isInteger(t.decimals) || t.decimals < 0) problems.push(`decimals ${t.decimals} must be a whole number from 0`);
  for (const [name, range] of Object.entries(t.params)) {
    try {
      rangeSize(name, range);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  const names = new Set([...Object.keys(t.params), "points", "bp"]);
  for (const [name, expression] of Object.entries(t.derived ?? {})) {
    const match = DERIVED.exec(expression);
    if (!match || !(match[1] in DERIVED_FNS)) {
      problems.push(`derived ${name}: "${expression}" is not plus(x, y), minus(x, y) or times(x, y)`);
    } else {
      for (const token of [match[2], match[3]]) {
        if (NAME.test(token) && !names.has(token)) problems.push(`derived ${name}: "${token}" is not a parameter or an earlier derived value`);
      }
    }
    names.add(name);
  }
  const texts: [string, string][] = [["ask", t.ask]];
  if (t.halfDone) texts.push(["half-done", t.halfDone.shows]);
  for (const m of t.mistakes) texts.push([`mistake ${m.tag}`, m.fix]);
  for (const [where, text] of texts) {
    for (const slot of slotNames(text)) {
      if (!names.has(slot) && !(slot === "answer" && where.startsWith("mistake"))) {
        problems.push(`${where}: slot {${slot}} names no parameter or derived value`);
      }
    }
  }
  if (problems.length > 0) return problems;
  for (const halfDone of t.halfDone ? [false, true] : [false]) {
    for (let i = 0; i < 200; i++) {
      try {
        drawTemplate(t, `check-${i}`, { halfDone });
      } catch (error) {
        return [`${halfDone ? "half-done " : ""}draw: ${(error as Error).message}`];
      }
    }
  }
  return [];
}
