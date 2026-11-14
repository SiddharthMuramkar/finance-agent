/**
 * Computed judgement questions (spec 2026-11-12, D1 to D3, D5; ADR 0021): a which-lever, what-the-price-assumes or
 * predict question whose right choice, choice figures and mix-up fixes code works out with the valuation engine from a
 * Case's `valuation:` block. The Topic file holds only the words and the lever changes, so a changed Case input changes
 * the answer and every figure with no edit to the question.
 *
 * Pure, with relative imports only, so the course check (scripts/check-course.mjs) runs it under plain Node.
 */
import { applyLevers, priceWord, type Levers, type ValuationBlock } from "../finance/valuation-case.ts";
import { hash, shuffled } from "./choices.ts";

/** How close two figures may come before a question is a coin toss, and how close a story must come to the price (D1, D2). */
export const NEAR = 0.05;

/** The most choices a computed question shows when the file does not say (D1). */
const DEFAULT_SHOWN = 4;

export type JudgementKind = "which_lever" | "price_assumes" | "predict";
/** One change from the preset (which lever, predict) or one whole story (what the price assumes), as the Topic file writes it. */
export type LeverChange = { id: string; label: string; levers: Levers };
/** A band a predict result lands in, as a share of the value at the preset: in it when at least `min` and below `max`. */
export type PredictBand = { id: string; label: string; min?: number; max?: number };
export type ComputedSpec = { case: string; preset?: Levers; changes: readonly LeverChange[]; shown?: number; bands?: readonly PredictBand[] };
/** A computed question as the Topic file holds it: words and changes, never an answer or a figure. */
export type ComputedQuestionInput = { id: string; kind: JudgementKind; prompt: string; computed: ComputedSpec; explanation?: string };

/** One choice as code makes it: the file's words, the figure code worked out (shown once answered), and a fix when wrong. */
export type JudgementChoice = { id: string; text: string; figure: string; mistake?: { tag: string; fix: string } };

export type JudgementInstance = {
  id: string;
  kind: JudgementKind;
  prompt: string;
  /** In the order shown. For predict, the bands, whose figure is empty: the result is the instance's `predict`. */
  choices: JudgementChoice[];
  /** The right choice's id; for predict, the band the value lands in (stored and shown beside the tap, never marked wrong). */
  answer: string;
  /** The file's words, if any, then the figures code adds. */
  explanation: string;
  /** The value a share at the preset, before any change. */
  start: { value: number; figure: string };
  /** Predict only: the change shown and where it takes the value. */
  predict?: { change: string; value: number; figure: string };
};

export type JudgementResult = { ok: true; instance: JudgementInstance } | { ok: false; error: string };

/** A change valued: value a share (never below zero, as a Workbench shows it), its figure, and its move from the start. */
type Valued = { change: LeverChange; value: number; figure: string; move: number };

const money = (currency: ValuationBlock["currency"]) => (currency === "INR" ? { sign: "₹", locale: "en-IN" } : { sign: "$", locale: "en-US" });

/** A value a share as a choice shows it: "$48.51"; nothing left shows "$0", never a negative price (spec B3). */
export function shareFigure(value: number, currency: ValuationBlock["currency"]): string {
  const { sign, locale } = money(currency);
  if (!(value > 0)) return `${sign}0`;
  return `${sign}${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A price as the Case states it: "$84", or "$84.50" when it has cents. */
function priceFigure(value: number, currency: ValuationBlock["currency"]): string {
  const { sign, locale } = money(currency);
  const whole = Number.isInteger(Math.round(value * 100) / 100);
  return `${sign}${value.toLocaleString(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** A move a share in words: "about $13", or "under $1" for a move too small to round to a dollar. */
function aboutMove(move: number, currency: ValuationBlock["currency"]): string {
  const { sign, locale } = money(currency);
  const size = Math.round(Math.abs(move));
  return size < 1 ? `under ${sign}1` : `about ${sign}${size.toLocaleString(locale)}`;
}

/** Whether the block values a whole company (per: company), whose value is in the block's unit, not dollars a share. */
const whole = (block: ValuationBlock) => block.per === "company";
/** What follows a figure: "a share" for a share's value, nothing for a whole company's. */
const aShare = (block: ValuationBlock) => (whole(block) ? "" : " a share");

/** An amount in a whole company's unit as words show it: "$16.8bn", "$799m" (millions), "₹4,000 crore". */
function amountFigure(value: number, block: ValuationBlock): string {
  const { sign, locale } = money(block.currency);
  if (!(value > 0)) return `${sign}0`;
  const tidy = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 1 });
  if (block.unit === "crores") return `${sign}${tidy(Math.round(value))} crore`;
  const billions = block.unit === "billions" ? value : value / 1000;
  return billions >= 1 ? `${sign}${tidy(Math.round(billions * 10) / 10)}bn` : `${sign}${tidy(Math.round(billions * 1000))}m`;
}

/** A value as a choice shows it: a share's ("$48.51"), or a whole company's in its unit ("$16.8bn"). */
export function valueFigure(value: number, block: ValuationBlock): string {
  return whole(block) ? amountFigure(value, block) : shareFigure(value, block.currency);
}

/** The Case's price as words show it: "$84", or a whole company's last round in its unit ("$17bn"). */
const casePrice = (block: ValuationBlock) => (whole(block) ? amountFigure(block.price.value, block) : priceFigure(block.price.value, block.currency));

/** A move as words show it: "about $13" a share, or "about $11bn" for a whole company. */
const moveText = (move: number, block: ValuationBlock) => (whole(block) ? `about ${amountFigure(Math.abs(move), block)}` : aboutMove(move, block.currency));

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A label set inside a sentence: its first letter lower case, unless it opens with a capitalised word such as "EBITDA". */
const inSentence = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/** Words that say every change lifts the value, or lowers it. */
const LIFTS = /\b(?:lifts?|raises?|adds?)\b/i;
const LOWERS = /\b(?:lowers?|cuts?|takes?\s+off)\b/i;

/** Whether a which-lever question asks for the change that moves the value least, not most. */
export const asksLeast = (prompt: string) => /\bleast\b/i.test(prompt);

/** Whether two values are within NEAR of the first, the one the Learner should pick. */
const within = (value: number, of: number) => Math.abs(value - of) <= NEAR * Math.abs(of);

/** The preset and every change valued from the block, or why the engine cannot value one. */
function valueAll(q: ComputedQuestionInput, block: ValuationBlock): { ok: true; start: number; valued: Valued[] } | { ok: false; error: string } {
  const preset = q.computed.preset ?? {};
  const base = applyLevers(block, preset);
  if (!base.ok) return { ok: false, error: `the engine cannot value its preset (${base.error})` };
  const start = Math.max(0, base.valuePerShare);
  const valued: Valued[] = [];
  for (const change of q.computed.changes) {
    const result = applyLevers(block, { ...preset, ...change.levers });
    if (!result.ok) return { ok: false, error: `the engine cannot value change "${change.id}" (${result.error})` };
    const value = Math.max(0, result.valuePerShare);
    valued.push({ change, value, figure: valueFigure(value, block), move: value - start });
  }
  return { ok: true, start, valued };
}

/** The right choice among a set: the biggest (or, when asked, the smallest) move, or the story nearest the price and within NEAR of it. */
function rightOf(q: ComputedQuestionInput, set: readonly Valued[], price: number): Valued | null {
  if (q.kind === "price_assumes") {
    const nearest = [...set].sort((a, b) => Math.abs(a.value - price) - Math.abs(b.value - price))[0];
    return nearest && within(nearest.value, price) ? nearest : null;
  }
  const bySize = [...set].sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
  return (asksLeast(q.prompt) ? bySize[bySize.length - 1] : bySize[0]) ?? null;
}

/** The other choices too close to the right one to tell apart: by value a share, and for which lever by the size of the move too. */
function nearTies(q: ComputedQuestionInput, set: readonly Valued[], right: Valued): Valued[] {
  return set.filter(
    (o) => o !== right && (within(o.value, right.value) || (q.kind === "which_lever" && within(Math.abs(o.move), Math.abs(right.move)))),
  );
}

/** Problems with one set of shown changes: no story near the price, or a near tie with the right choice (D2). */
function setProblems(q: ComputedQuestionInput, set: readonly Valued[], block: ValuationBlock): string[] {
  const price = block.price.value;
  const right = rightOf(q, set, price);
  if (!right) return [`no story it shows comes within ${NEAR * 100}% of the ${casePrice(block)} ${priceWord(block)}`];
  return nearTies(q, set, right).map(
    (o) => `"${o.change.id}" (${o.figure}) comes within ${NEAR * 100}% of the right choice "${right.change.id}" (${right.figure}), so the question is a coin toss`,
  );
}

/** The changes a Check shows: the first `shown` of them (four at most when the file does not say). */
function canonical<T>(q: ComputedQuestionInput, items: readonly T[]): T[] {
  return items.slice(0, q.computed.shown ?? Math.min(DEFAULT_SHOWN, items.length));
}

/** Every way to pick `k` of the items, in file order. */
function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

/**
 * The shown set for a seed (D5): one of the sets of the same size drawn from the file's pool that has a clear right
 * answer, other than the Check's own set when there is another, so a Review does not repeat the same choices.
 */
function drawSet(q: ComputedQuestionInput, valued: readonly Valued[], block: ValuationBlock, seed: string): Valued[] {
  const first = canonical(q, valued);
  const sets = combinations(valued, first.length).filter((s) => setProblems(q, s, block).length === 0);
  const fresh = sets.filter((s) => s.some((v, i) => v !== first[i]));
  const from = fresh.length ? fresh : sets;
  return from.length ? from[hash(seed) % from.length] : first;
}

/** The bands a share of the start value lands in (a well-made predict question has exactly one). */
export function bandsFor(share: number, bands: readonly PredictBand[]): PredictBand[] {
  return bands.filter((b) => (b.min === undefined || share >= b.min) && (b.max === undefined || share < b.max));
}

/** A predict result's share of the start value, the start being above zero. */
const shareOf = (value: number, start: number) => value / start;

/** The mix-up fix of a wrong which-lever choice, quoting both figures (D3): "Cost of capital ... gives $38.34, about $3 a share more. ..." */
function leverFix(wrong: Valued, right: Valued, block: ValuationBlock): string {
  const way = (move: number) => (move >= 0 ? "more" : "less");
  return `${capital(wrong.change.label)} gives ${wrong.figure}, ${moveText(wrong.move, block)}${aShare(block)} ${way(wrong.move)}. ${capital(right.change.label)} gives ${right.figure}, ${moveText(right.move, block)} ${way(right.move)}.`;
}

/** The mix-up fix of a wrong what-the-price-assumes choice, quoting both figures and the price. */
function priceFix(wrong: Valued, right: Valued, block: ValuationBlock): string {
  const price = casePrice(block);
  const side = wrong.value < block.price.value ? "short of" : "above";
  return `${capital(wrong.change.label)} gives ${wrong.figure}, ${side} the ${price} ${priceWord(block)}. ${capital(right.change.label)} gives ${right.figure}, within ${NEAR * 100}% of it.`;
}

/** The figures code adds after the file's explanation: what each shown choice is worth. */
function figuresLine(q: ComputedQuestionInput, shown: readonly Valued[], start: number, block: ValuationBlock): string {
  const list = shown.map((v) => `${capital(v.change.label)} gives ${v.figure}`).join("; ");
  if (q.kind === "price_assumes") return `The ${priceWord(block)} is ${casePrice(block)}. ${list}.`;
  return `From ${valueFigure(start, block)}${aShare(block)}: ${list}.`;
}

const withExplanation = (q: ComputedQuestionInput, line: string) => [q.explanation, line].filter(Boolean).join(" ");

/**
 * The question as code serves it, worked out from the Case's valuation block. With no seed, the Check's own set (the
 * first `shown` changes, or a predict question's first change); with a seed, a fresh draw from the pool (D5). Choices
 * are ordered by the question and the seed, so the right one is not always first. An error when the engine cannot
 * value a change, when no story comes near the price, or when a predict result lands in no band.
 */
export function instantiateJudgement(q: ComputedQuestionInput, block: ValuationBlock, seed?: string): JudgementResult {
  const all = valueAll(q, block);
  if (!all.ok) return all;
  const { start, valued } = all;
  const startFigure = { value: start, figure: valueFigure(start, block) };

  if (q.kind === "predict") {
    const bands = q.computed.bands ?? [];
    if (!(start > 0)) return { ok: false, error: "its preset leaves nothing for shareholders, so there is no value to take a share of" };
    const pool = seed && valued.length > 1 ? valued.slice(1) : valued;
    const shown = seed ? pool[hash(seed) % pool.length] : valued[0];
    const landed = bandsFor(shareOf(shown.value, start), bands);
    if (landed.length !== 1) return { ok: false, error: `change "${shown.change.id}" (${shown.figure}) lands in ${landed.length} bands, not one` };
    const label = shown.change.label;
    const prompt = q.prompt.startsWith("{change}") ? q.prompt.replace("{change}", capital(label)) : q.prompt.replace("{change}", inSentence(label));
    return {
      ok: true,
      instance: {
        id: q.id,
        kind: q.kind,
        prompt,
        choices: bands.map((b) => ({ id: b.id, text: b.label, figure: "" })),
        answer: landed[0].id,
        explanation: withExplanation(q, `${capital(label)} takes the value from ${startFigure.figure} to ${shown.figure}${aShare(block)}: ${inSentence(landed[0].label)}.`),
        start: startFigure,
        predict: { change: label, value: shown.value, figure: shown.figure },
      },
    };
  }

  const set = seed ? drawSet(q, valued, block, seed) : canonical(q, valued);
  const right = rightOf(q, set, block.price.value);
  if (!right) return { ok: false, error: setProblems(q, set, block)[0] };
  const tag = q.kind === "price_assumes" ? "price-miss" : asksLeast(q.prompt) ? "bigger-move" : "smaller-move";
  const choices = shuffled(set, `${q.id}\u0000${seed ?? ""}`).map((v): JudgementChoice => {
    const choice = { id: v.change.id, text: v.change.label, figure: v.figure };
    if (v === right) return choice;
    return { ...choice, mistake: { tag, fix: q.kind === "price_assumes" ? priceFix(v, right, block) : leverFix(v, right, block) } };
  });
  return {
    ok: true,
    instance: {
      id: q.id,
      kind: q.kind,
      prompt: q.prompt,
      choices,
      answer: right.change.id,
      explanation: withExplanation(q, figuresLine(q, choices.map((c) => set.find((v) => v.change.id === c.id)!), start, block)),
      start: startFigure,
    },
  };
}

/**
 * What the course check finds wrong with a computed question at check time (lint L14, D2), worked out through the
 * engine: for which lever and what the price assumes, the Check's own set must have a clear right choice (no other
 * choice within 5% of it) and, for the price, a story within 5% of the price; for predict, every change in the pool
 * lands in exactly one band. Empty when the question is sound.
 */
export function judgementProblems(q: ComputedQuestionInput, block: ValuationBlock): string[] {
  const all = valueAll(q, block);
  if (!all.ok) return [all.error];
  if (q.kind === "which_lever") {
    // "Most" is the biggest move either way (D1), so a prompt that says the changes lift (or lower) the value must hold
    // for every change in the pool, or a Review's draw could make a fall the answer to "which lifts it most".
    const says = LIFTS.test(q.prompt) ? 1 : LOWERS.test(q.prompt) ? -1 : 0;
    const against = all.valued.filter((v) => says !== 0 && Math.sign(v.move) === -says);
    if (against.length) return against.map((v) => `its prompt says the changes ${says > 0 ? "lift" : "lower"} the value, but "${v.change.id}" takes it ${says > 0 ? "down" : "up"} to ${v.figure}`);
  }
  if (q.kind === "predict") {
    if (!(all.start > 0)) return ["its preset leaves nothing for shareholders, so there is no value to take a share of"];
    return all.valued.flatMap((v) => {
      const n = bandsFor(shareOf(v.value, all.start), q.computed.bands ?? []).length;
      return n === 1 ? [] : [`change "${v.change.id}" (${v.figure}, from ${valueFigure(all.start, block)}) lands in ${n} bands; it must land in exactly one`];
    });
  }
  return setProblems(q, canonical(q, all.valued), block);
}
