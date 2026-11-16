import { FORECAST_YEARS, type DcfResult } from "@/finance/dcf-engine";
import { CURRENCY_STYLE } from "@/finance/money";
import { applyLevers, priceWord, returnOnNewCapital, type Levers, type ValuationBlock } from "@/finance/valuation-case";
import { valuationCaseIds } from "@/finance/valuation-cases";
import { findValuation, type OwnCases } from "@/finance/valuation-lookup";
import { near, niceUp, oneFigure, onStep, type BenchLever, type BenchReading } from "./bench";
import { modeCases, topicStorySchema, valueLeversModeSchema, type Market, type TopicStory, type ValueLeversMode } from "./data-schemas";
import { MONTHS } from "../months";

// Value levers, the first Workbench Widget (spec 2026-11-12, B3; ADR 0010), as pure functions over one Case's valuation
// block: the four Levers and "More settings" with their ranges, the value a story gives (from the one valuation engine,
// through applyLevers), the headline, the bar, the cash-flow bars, the stories, the Things to try and when each ticks, and
// which lever has moved the value most. Every word that names a figure (the price, its date, the currency) comes from the
// block; nothing here knows it is Amazon. The view (value-levers-view.tsx) and the Widget part draw only what this returns,
// and the server tells the Tutor from it, so the screen and the Tutor always agree.

/** The Levers, then the one setting under "More settings", in the order the Widget shows them. */
export const LEVER_IDS = ["revenue", "margin", "salesToCapital", "risk", "failure"] as const;
export type LeverId = (typeof LEVER_IDS)[number];

/** A setting for every lever, in the lever's own unit: revenue in its display unit ($bn for a Case in millions of dollars), percents, sales per unit invested. */
export type LeverSettings = Record<LeverId, number>;

/** One lever as the Widget draws it. */
export type LeverSpec = {
  id: LeverId;
  /** The Lever's plain name: "How big it gets". */
  title: string;
  /** What it sets: "Sales in year 10". */
  label: string;
  min: number;
  max: number;
  step: number;
  /** Where it opens: the Case's own figure, rounded to a step for revenue. At this setting the lever leaves the Case's figure alone. */
  opening: number;
  /** Values a drag rests on (B5): the opening, which for the cost of capital is off the 0.25 steps (12.84%). */
  stops: number[];
  /** Under "More settings". */
  more: boolean;
  /** A setting as the readout prints it: "$39bn", "10%", "$3.00". */
  reading: (value: number) => string;
  /** A setting said aloud with its unit: "39 billion dollars". */
  spoken: (value: number) => string;
  /** A small line under the label: today's revenue for lever 1. */
  caption?: string;
  /** Figures marked on the track, each with its words (margin marks: rivals' margins on lever 2). */
  marks?: { value: number; label: string }[];
};

/** The $variables a Value levers program binds each lever to, and the three it keeps its move record in. */
export const LEVER_VARIABLES: Record<LeverId, string> = { revenue: "revenue", margin: "margin", salesToCapital: "salesToCapital", risk: "risk", failure: "failure" };
export const MOVE_VARIABLES = { moved: "moved", mostLever: "mostLever", mostBy: "mostBy" } as const;
/** The $variable that holds which market lever 1 is a share of, in market mode. */
export const MARKET_VARIABLE = "market";
/** The $variable that holds which Case the Learner chose, in all open mode with a Case chip (Spine Topic 15). */
export const CASE_VARIABLE = "case";

// ——— Money in the Case's currency and unit ———

/** What money in a Case is counted in: its currency and unit. A valuation block is one; a Workbench's own data may be another. */
export type Money = Pick<ValuationBlock, "currency" | "unit">;

const UNIT_SIZE: Record<ValuationBlock["unit"], number> = { millions: 1e6, crores: 1e7, billions: 1e9 };
const SYMBOL = (currency: ValuationBlock["currency"]) => CURRENCY_STYLE[currency].symbol;
const CURRENCY_WORD = (currency: ValuationBlock["currency"]) => CURRENCY_STYLE[currency].word;
const LOCALE = (currency: ValuationBlock["currency"]) => CURRENCY_STYLE[currency].locale;

/** The currency's sign: "$", "₹", "¥", "₩", "€". */
export const currencySign = (block: Money): string => SYMBOL(block.currency);

/** Up to `digits` decimals, none when the number is whole, grouped for the currency's locale. */
const grouped = (n: number, block: Money, digits = 1) => n.toLocaleString(LOCALE(block.currency), { maximumFractionDigits: digits });

/** An amount in the block's unit as a short figure: "$2.2tn", "$1.1bn", "$931m", "₹1,250 crore", "₹45 lakh". */
export function moneyText(amount: number, block: Money): string {
  const sign = amount < 0 ? "-" : "";
  const whole = Math.abs(amount) * UNIT_SIZE[block.unit];
  const symbol = SYMBOL(block.currency);
  if (block.currency === "INR") {
    if (whole >= 1e7) return `${sign}${symbol}${grouped(whole / 1e7, block)} crore`;
    if (whole >= 1e5) return `${sign}${symbol}${grouped(whole / 1e5, block)} lakh`;
    return `${sign}${symbol}${grouped(whole, block, 0)}`;
  }
  if (whole >= 1e12) return `${sign}${symbol}${grouped(whole / 1e12, block)}tn`;
  if (whole >= 1e9) return `${sign}${symbol}${grouped(whole / 1e9, block)}bn`;
  if (whole >= 1e6) return `${sign}${symbol}${grouped(whole / 1e6, block)}m`;
  return `${sign}${symbol}${grouped(whole, block, 0)}`;
}

/** An amount in the block's unit said aloud: "15.2 billion dollars", "26 million dollars", "45 crore rupees". */
export function moneySpoken(amount: number, block: Money): string {
  const sign = amount < 0 ? "minus " : "";
  const whole = Math.abs(amount) * UNIT_SIZE[block.unit];
  const [one, many] = CURRENCY_WORD(block.currency);
  const scaled = (size: number, word: string) => `${sign}${grouped(whole / size, block)} ${word} ${many}`;
  if (block.currency === "INR") {
    if (whole >= 1e7) return scaled(1e7, "crore");
    if (whole >= 1e5) return scaled(1e5, "lakh");
  } else {
    if (whole >= 1e12) return scaled(1e12, "trillion");
    if (whole >= 1e9) return scaled(1e9, "billion");
    if (whole >= 1e6) return scaled(1e6, "million");
  }
  const n = grouped(whole, block, 0);
  return `${sign}${n} ${n === "1" ? one : many}`;
}

/** A value a share as the headline shows it: whole from 10 up ("$35", "₹1,234"), to the cent below ("$2.40"); yen and won always whole ("¥8"). */
export function priceText(value: number, block: Money): string {
  const symbol = SYMBOL(block.currency);
  const n = Math.abs(value);
  const text = n >= 10 || !CURRENCY_STYLE[block.currency].cents ? Math.round(n).toLocaleString(LOCALE(block.currency)) : n.toFixed(2);
  return `${value < 0 ? "-" : ""}${symbol}${text}`;
}

/** A move in a share's value, to the minor unit and grouped for the currency: "$10.04", "₹1,234.50"; yen and won whole ("₩1,500"). */
export function moveText(value: number, block: Money): string {
  const digits = CURRENCY_STYLE[block.currency].cents ? 2 : 0;
  const text = Math.abs(value).toLocaleString(LOCALE(block.currency), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 ? "-" : ""}${SYMBOL(block.currency)}${text}`;
}

/** A Workbench's headline figure: a share's value, or for a company valued whole (per: company) the company's value. */
export function valueText(value: number, block: ValuationBlock): string {
  return block.per === "company" ? moneyText(value, block) : priceText(value, block);
}


/** An ISO date as the Widget writes it: "1 Feb 2000". */
export function dateText(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// ——— The levers ———

/** The Case's revenue in year 10, in the block's unit, from its own growth path. */
function caseYear10Revenue(block: ValuationBlock): number {
  return block.growthPercent.reduce((revenue, g) => revenue * (1 + g / 100), block.baseRevenue);
}

/** How lever 1 shows revenue: in billions for a Case in millions of dollars, euros, yen or won that reaches a billion (trillions for yen and won that reach one), else in the block's own unit. */
function revenueUnit(block: ValuationBlock): { per: number; short: (n: number) => string; spoken: (n: number) => string } {
  const symbol = SYMBOL(block.currency);
  const [, many] = CURRENCY_WORD(block.currency);
  const figure = (n: number) => grouped(n, block, 2);
  // Yen and won run to trillions (Toyota: ¥45tn), so a Case in millions of either that reaches a trillion reads in trillions.
  if ((block.currency === "JPY" || block.currency === "KRW") && block.unit === "millions" && caseYear10Revenue(block) >= 1e6) {
    return { per: 1e6, short: (n) => `${symbol}${figure(n)}tn`, spoken: (n) => `${figure(n)} trillion ${many}` };
  }
  if (block.currency !== "INR" && block.unit === "millions" && caseYear10Revenue(block) >= 1000) {
    return { per: 1000, short: (n) => `${symbol}${figure(n)}bn`, spoken: (n) => `${figure(n)} billion ${many}` };
  }
  // Rupees counted in millions read in crore, as Indian readers and the caption do (Zomato: ₹16,400 crore, not ₹1,64,000m).
  if (block.currency === "INR" && block.unit === "millions") {
    return { per: 10, short: (n) => `${symbol}${figure(n)} crore`, spoken: (n) => `${figure(n)} crore ${many}` };
  }
  const word = { millions: ["m", "million"], crores: [" crore", "crore"], billions: ["bn", "billion"] }[block.unit];
  return { per: 1, short: (n) => `${symbol}${figure(n)}${word[0]}`, spoken: (n) => `${figure(n)} ${word[1]} ${many}` };
}

const percentReading = (n: number) => `${Number(n.toPrecision(12))}%`;
const percentSpoken = (n: number) => `${Number(n.toPrecision(12))} percent`;
/** A share that is rarely on a round step (the Case's own): to two decimals. */
const percentReading2 = (n: number) => `${Number(n.toFixed(2))}%`;
const percentSpoken2 = (n: number) => `${Number(n.toFixed(2))} percent`;

/** The margin after year 10, in percent: the Case's figure lever 2 opens at. */
function caseMargin(block: ValuationBlock): number {
  return "marginPercent" in block.margin ? block.margin.afterPercent : (block.margin.afterPercent ?? block.margin.targetPercent);
}

/**
 * The levers for a Case (B3). Each range is worked out from the Case, so another Case gets its own: for Damodaran's Amazon
 * they are exactly the spec's table.
 * - How big it gets: revenue in year 10 from a quarter to two and a half times the Case's, in about 40 steps, each rounded
 *   to one figure ($10bn to $100bn in $1bn steps, opening at $39bn), with today's revenue as its caption.
 * - What it keeps: the margin once mature from a fifth of the Case's to twice it, in steps of 0.5 (2% to 20%, opening at 10%).
 * - What growth costs: sales for each unit invested from a third of the Case's to five thirds of it, in steps of 0.25 (1 to 5, opening at 3).
 * - How risky: the cost of capital while it grows, from the whole percent above the Case's rate after year 10 to five points
 *   above its year-1 rate rounded up, in steps of 0.25, with a stop at the Case's year-1 rate where it opens (10% to 18%, 12.84%).
 *   A Case whose year-1 rate is under that start (its rate rises towards year 10, or sits within a point of its mature rate)
 *   starts the lever two whole points under its year-1 rate instead (Tesla: 5% to 12%, opening at 7%; Coffee Day: 7% to 15%, at 9.4%).
 * - Chance it fails, under More settings: 0% to 50% in steps of 5, opening at the Case's chance (0%).
 */
function baseSpecs(block: ValuationBlock): LeverSpec[] {
  const revenue = revenueUnit(block);
  const year10 = caseYear10Revenue(block) / revenue.per;
  const revenueStep = oneFigure(year10 / 40);
  const margin = caseMargin(block);
  const marginMin = Math.max(0.5, onStep(margin / 5, 0.5));
  const firstRate = block.costOfCapitalPercent[0];
  const lastRate = block.costOfCapitalPercent[FORECAST_YEARS - 1];
  const chance = block.failure?.chancePercent ?? 0;
  const symbol = SYMBOL(block.currency);
  const [one, many] = CURRENCY_WORD(block.currency);
  const lever = (spec: Omit<LeverSpec, "stops" | "more"> & { more?: boolean }): LeverSpec => ({ ...spec, more: spec.more ?? false, stops: [spec.opening] });
  return [
    lever({
      id: "revenue",
      title: "How big it gets",
      // "Sales", the plain word the Spine uses throughout; no Spine Topic cards "revenue" (F12, #87/#88).
      label: "Sales in year 10",
      min: oneFigure(year10 / 4),
      max: oneFigure(year10 * 2.5),
      step: revenueStep,
      opening: onStep(year10, revenueStep),
      // At its opening the lever leaves the Case's own revenue alone, so it reads that figure (to three figures), not the step.
      reading: (n) => revenue.short(n === onStep(year10, revenueStep) ? Number(year10.toPrecision(3)) : n),
      spoken: (n) => revenue.spoken(n === onStep(year10, revenueStep) ? Number(year10.toPrecision(3)) : n),
      caption: `Today: ${moneyText(block.baseRevenue, block)}`,
    }),
    lever({
      id: "margin",
      title: "What it keeps",
      label: "Operating margin once mature",
      min: marginMin,
      max: Math.max(onStep(margin * 2, 0.5), marginMin + 10),
      step: 0.5,
      opening: margin,
      reading: percentReading,
      spoken: percentSpoken,
    }),
    lever({
      id: "salesToCapital",
      title: "What growth costs",
      label: `Sales for each ${one} invested`,
      min: Math.max(0.25, onStep(block.salesToCapital / 3, 0.25)),
      max: Math.max(onStep((block.salesToCapital * 5) / 3, 0.25), 1),
      step: 0.25,
      opening: block.salesToCapital,
      reading: (n) => `${symbol}${n.toFixed(2)}`,
      spoken: (n) => `${Number(n.toPrecision(12))} ${n === 1 ? one : many}`,
    }),
    lever({
      id: "risk",
      title: "How risky",
      label: "Cost of capital while it grows",
      // A Case whose year-1 rate sits under that floor would open outside the range: Tesla's rises from 7% to 7.4%, and
      // Coffee Day's 9.4% is within a point of its mature 9%. It starts two points under its year-1 rate instead.
      min: firstRate < Math.floor(lastRate) + 1 ? Math.max(0.25, Math.floor(firstRate) - 2) : Math.floor(lastRate) + 1,
      max: Math.ceil(firstRate) + 5,
      step: 0.25,
      opening: firstRate,
      reading: percentReading2,
      spoken: percentSpoken2,
    }),
    lever({
      id: "failure",
      title: "Chance it fails",
      label: "Chance it fails",
      min: 0,
      max: Math.max(50, Math.ceil(chance / 5) * 5),
      step: 5,
      opening: chance,
      reading: percentReading,
      spoken: percentSpoken,
      more: true,
    }),
  ];
}

/** A market's size in year 10, in the block's unit: today's size grown at its yearly rate for ten years. */
export function marketInYear10(market: Market): number {
  return market.size * (1 + (market.growthPercent ?? 0) / 100) ** FORECAST_YEARS;
}

/** Lever 1 in market mode: the Case's revenue in year 10 as a share of the first market, and a range around it. */
function shareSpec(block: ValuationBlock, base: LeverSpec, market: Market): LeverSpec {
  const opening = (caseYear10Revenue(block) / marketInYear10(market)) * 100;
  const max = Math.min(100, niceUp(opening * 2.5));
  const step = oneFigure(max / 100);
  const min = Math.max(step, onStep(opening / 4, step));
  return { ...base, label: "Share of the market in year 10", min, max, step, opening, stops: [opening], reading: percentReading2, spoken: percentSpoken2, caption: undefined };
}

/**
 * The levers for a Case in a Spine Topic's mode (Appendix D). Every mode keeps four levers at rest and one under More
 * settings: in failure mode the chance it fails is at rest and what growth costs moves under More settings; in market mode
 * lever 1 is the share of a market, which feeds revenue in year 10; with margin marks, rivals' margins are marked on lever 2.
 */
export function leverSpecs(block: ValuationBlock, mode?: ValueLeversMode): LeverSpec[] {
  const specs = baseSpecs(block);
  if (!mode) return specs;
  if (mode.kind === "failure") return specs.map((s) => (s.id === "failure" ? { ...s, more: false } : s.id === "salesToCapital" ? { ...s, more: true } : s));
  if (mode.kind === "market") return specs.map((s) => (s.id === "revenue" ? shareSpec(block, s, mode.markets[0]) : s));
  if (mode.kind === "margin_marks") return specs.map((s) => (s.id === "margin" ? { ...s, marks: mode.marks.map((m) => ({ value: m.percent, label: `${m.label} ${percentReading2(m.percent)}` })) } : s));
  // Range mode (Spine Topic 14): the Topic's likely band for a lever is shown as two ticks on it, so the Learner sees the
  // spread Damodaran drew his guesses from while the thumb stays their own pick.
  if (mode.kind === "range" && mode.bands) {
    return specs.map((s) => {
      const band = mode.bands?.[s.id];
      return band ? { ...s, marks: [{ value: band[0], label: s.reading(band[0]) }, { value: band[1], label: s.reading(band[1]) }] } : s;
    });
  }
  return specs;
}

/** Every lever at its opening: the Case's own story. */
export function openingSettings(specs: readonly LeverSpec[]): LeverSettings {
  return Object.fromEntries(specs.map((s) => [s.id, s.opening])) as LeverSettings;
}

/** A lever's spec by id. */
const specOf = (specs: readonly LeverSpec[], id: LeverId) => specs.find((s) => s.id === id)!;

/**
 * The engine's levers for these settings. A lever at its opening leaves the Case's own figure alone, so the Widget opens on
 * exactly the Case's value ($35.04, not the $35.03 a flat $39bn would give).
 */
export function leversFor(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode?: ValueLeversMode, market = 0): Levers {
  const moved = (id: LeverId) => (near(settings[id], specOf(specs, id).opening) ? undefined : settings[id]);
  // In market mode lever 1 is a share of the market chosen: revenue in year 10 is that share of the market's size then.
  const markets = mode?.kind === "market" ? mode.markets : null;
  const chosen = markets ? markets[Math.min(markets.length - 1, Math.max(0, Math.round(market)))] : null;
  const atCase = chosen === null ? moved("revenue") === undefined : moved("revenue") === undefined && chosen === markets![0];
  const revenueYear10 = atCase ? undefined : chosen ? (settings.revenue / 100) * marketInYear10(chosen) : settings.revenue * revenueUnit(block).per;
  return {
    ...(revenueYear10 !== undefined && { revenueYear10 }),
    ...(moved("margin") !== undefined && { marginTarget: settings.margin }),
    ...(moved("salesToCapital") !== undefined && { salesToCapital: settings.salesToCapital }),
    ...(moved("risk") !== undefined && { costOfCapitalGrowing: settings.risk }),
    ...(moved("failure") !== undefined && { failureChance: settings.failure }),
  };
}

/** What a story is worth, by the one valuation engine. */
export function valueOf(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode?: ValueLeversMode, market = 0): DcfResult {
  return applyLevers(block, leversFor(block, specs, settings, mode, market));
}

// ——— What the Widget shows ———

/** How close to the price counts as "a story worth the price": $2 on Amazon's $84, a fortieth of the price to one figure. */
export function priceTolerance(block: ValuationBlock): number {
  return oneFigure(block.price.value / 40);
}

/** The top of the headline's bar: half as much again as the price, rounded up to a round number ($150 for an $84 price). */
export function barTop(price: number): number {
  return niceUp(price * 1.5);
}

/** The label of the share of value after year 10, one of the numbers at rest. */
export const AFTER_YEAR_10_LABEL = "Value from after year 10";

/** The caption of the cash-flow bars. */
export const CASH_FLOW_CAPTION = "Cash it makes each year, then after year 10";

export type CashFlowBar = { label: string; value: number; gain: boolean; text: string; afterYear10: boolean };

export type ValueLeversModel = {
  /** The engine's value a share (or the company's, per: company); null when the story cannot be valued. */
  value: number | null;
  /** True when nothing is left for shareholders: the headline then says so in coral, never a negative price. */
  nothingLeft: boolean;
  /** The headline in three parts, the middle one the key number: "This story is worth " "$35" " a share". */
  headline: { before: string; key: string; after: string };
  /** The headline's bar: its top, how full it is and where the price sits (0 to 1); full above the top, the number still shown. `span` shades the range (Topic 14). */
  bar: { top: number; topText: string; fill: number; marker: number; full: boolean; span?: { low: number; high: number } };
  /** In range mode (Topic 14), the value as a range and where the price sits against it; null in every other mode. */
  range: { low: number; high: number; text: string; where: "above" | "below" | "inside" } | null;
  /** The Case's figure the bar marks: `label` names it with its date ("Price on 3 Feb 2000", "Talk on 2 Dec 2014"), `word` alone ("price", "talk"). */
  price: { value: number; text: string; label: string; word: string };
  /** The share of the business's value from the years after year 10, as "112%". */
  afterYear10: { share: number; text: string } | null;
  /** Ten bars of free cash flow and one for everything after year 10, in today's money. */
  cashFlows: CashFlowBar[];
  /** Within priceTolerance of the price: the second Thing to try ticks. */
  nearPrice: boolean;
  /** A Spine Topic mode's one readout, in place of the share after year 10 (Appendix D); null in the base Widget. */
  readout: ModeReadout | null;
  /** Settings that contradict each other, in words (two stories mode); none when the story holds together. */
  flags: string[];
  /** The engine's sentence when the story cannot be valued. */
  error?: string;
};

/** A mode's readout: a label and its figure, with a line under it for the range's ranking, in coral when it warns. */
export type ModeReadout = { label: string; text: string; note?: string; warn?: boolean };

/** Everything Value levers shows for these settings, in the Spine Topic's mode and, in market mode, for the market chosen. */
export function valueLeversModel(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode?: ValueLeversMode, market = 0): ValueLeversModel {
  const result = valueOf(block, specs, settings, mode, market);
  const word = priceWord(block);
  const price = { value: block.price.value, text: valueText(block.price.value, block), label: `${capitalised(word)} on ${dateText(block.price.date)}`, word };
  const top = barTop(block.price.value);
  const bar = { top, topText: valueText(top, block), marker: Math.min(1, block.price.value / top) };
  if (!result.ok) {
    return {
      value: null,
      nothingLeft: false,
      headline: { before: "This story cannot be valued: ", key: "", after: result.error },
      bar: { ...bar, fill: 0, full: false },
      range: null,
      price,
      afterYear10: null,
      cashFlows: [],
      nearPrice: false,
      readout: null,
      flags: [],
      error: result.error,
    };
  }
  const value = result.valuePerShare;
  const nothingLeft = value <= 0;
  const takers = block.options > 0 ? "lenders and option holders take everything" : "lenders take everything";
  // Range mode (Topic 14): the value is a range, so the headline leads with the range and the bar shades it. The point and the price are shown beside it.
  const range =
    mode?.kind === "range"
      ? (() => {
          const { low, high } = valueRange(block, specs, settings, mode);
          const where = block.price.value > high ? "above" : block.price.value < low ? "below" : "inside";
          return { low, high, text: `${shown(low, block)} to ${shown(high, block)}`, where } as const;
        })()
      : null;
  const headline = range
    ? { before: "A range of values: ", key: range.text, after: "" }
    : nothingLeft
      ? { before: "", key: `${SYMBOL(block.currency)}0`, after: `: ${takers}` }
      : // The headline names whose story it is: a published Story judged with Case chips (the ready-Case valuation Topic) is
        // "the story", every other one "this story" (#88). Never "your story" (GLOSSARY: a Story is someone's claim to judge,
        // and the Learner's own settings are an Estimate, made only in an Assignment), all open mode included.
        { before: mode?.kind === "match_price" && mode.cases ? "The story is worth " : "This story is worth ", key: valueText(value, block), after: block.per === "company" ? "" : " a share" };
  const span = range ? { low: Math.min(1, Math.max(0, range.low) / top), high: Math.min(1, Math.max(0, range.high) / top) } : undefined;
  const cashFlows: CashFlowBar[] = [
    ...result.years.map((y) => ({ label: `Year ${y.year}`, value: y.fcf, gain: y.fcf >= 0, text: moneyText(y.fcf, block), afterYear10: false })),
    { label: "After year 10, in today's money", value: result.pvTerminal, gain: result.pvTerminal >= 0, text: moneyText(result.pvTerminal, block), afterYear10: true },
  ];
  return {
    value,
    nothingLeft,
    headline,
    bar: { ...bar, fill: nothingLeft ? 0 : Math.min(1, value / top), full: value > top, span },
    range,
    price,
    afterYear10: Number.isFinite(result.terminalShare) ? { share: result.terminalShare, text: `${Math.round(result.terminalShare * 100)}%` } : null,
    cashFlows,
    nearPrice: Math.abs(value - block.price.value) <= priceTolerance(block) + 1e-9,
    readout: mode ? modeReadout(block, specs, settings, mode, market, result) : null,
    // In all open mode (Spine Topic 15) only the wish is flagged: the Learner's own story starts at the Case's risk, which can sit in the "safe" third.
    flags: mode?.kind === "two_stories" ? contradictions(specs, settings) : mode?.kind === "all_open" ? contradictions(specs, settings).filter((f) => f.startsWith("Every lever")) : [],
  };
}

// ——— What each Spine Topic's mode reads out (Appendix D) ———

/** Short names for the levers in a readout's list. */
const SHORT: Record<LeverId, string> = { revenue: "revenue", margin: "margin", salesToCapital: "reinvestment", risk: "risk", failure: "failure" };

/** One decimal, none when whole: 2.1, 3. */
const oneDecimal = (n: number) => `${Number(n.toFixed(1))}`;

/** A value a share as a readout writes it: $0 when nothing is left, never a negative price. */
const shown = (value: number, block: ValuationBlock) => (value <= 0 ? `${SYMBOL(block.currency)}0` : valueText(value, block));

function modeReadout(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode: ValueLeversMode, market: number, result: Extract<DcfResult, { ok: true }>): ModeReadout | null {
  switch (mode.kind) {
    case "market": {
      const chosen = mode.markets[Math.min(mode.markets.length - 1, Math.max(0, Math.round(market)))];
      const size = marketInYear10(chosen);
      const revenue = result.years[FORECAST_YEARS - 1].revenue;
      return { label: "Sales in year 10", text: `${moneyText(revenue, block)} of a ${moneyText(size, block)} market` };
    }
    case "margin_marks":
      // The marks on lever 2 are ticks; this readout names them, so their words sit beside the Widget once (ADR 0015: colour is never the only signal).
      return { label: "Rivals' margins", text: mode.marks.map((m) => `${m.label} ${percentReading2(m.percent)}`).join(", ") };
    case "roic": {
      const earns = returnOnNewCapital(settings.margin, settings.salesToCapital, block.taxPercent);
      const below = earns < settings.risk;
      return { label: "Return on new capital", text: `${oneDecimal(earns)}%, ${below ? "below" : "above"} the ${Number(settings.risk.toFixed(2))}% it costs`, warn: below };
    }
    case "failure": {
      const survives = (result.goingConcern + block.cash - block.debt - block.options) / block.shares;
      return { label: "If it survives", text: `${shown(survives, block)}${block.per === "company" ? "" : " a share"}` };
    }
    case "two_stories": {
      const opening = openingSettings(specs);
      const [a, b] = mode.stories.map((story) => valueOf(block, specs, storySettings(specs, opening, story), mode));
      const text = (r: DcfResult) => (r.ok ? shown(r.valuePerShare, block) : "no value");
      return { label: "The two stories", text: `${text(a)} against ${text(b)}` };
    }
    case "match_price": {
      const reaches = priceReach(block, specs, settings, mode);
      return { label: `Reaches the ${valueText(block.price.value, block)} ${priceWord(block)} alone`, text: reaches.length ? reaches.join(", or ") : "no lever alone" };
    }
    case "range": {
      // The range is the headline now; this readout names the single story value and ranks the levers by their swing.
      const { ranked } = valueRange(block, specs, settings, mode);
      return { label: "This story", text: shown(result.valuePerShare, block), note: `By effect: ${ranked.map((id) => SHORT[id]).join(", ")}` };
    }
    case "all_open":
      return null;
  }
}

/** A story's settings: the Case's own with the story's levers, each kept inside its range. */
export function storySettings(specs: readonly LeverSpec[], opening: LeverSettings, story: TopicStory): LeverSettings {
  const settings = { ...opening };
  for (const spec of specs) {
    const v = story.levers[spec.id];
    if (typeof v === "number") settings[spec.id] = Math.min(spec.max, Math.max(spec.min, v));
  }
  return settings;
}

/** Where a setting sits in its lever's range, 0 at the low end to 1 at the high end. */
const placeIn = (spec: LeverSpec, value: number) => (spec.max === spec.min ? 0 : (value - spec.min) / (spec.max - spec.min));

/**
 * Settings that contradict each other (Spine Topic 11), each a sentence: fast growth that needs little investment, fast growth
 * that carries less risk, and, above them, every lever at the end that raises the value at once, which is a wish, not a story.
 * "Fast" and "little" are the top or bottom third of each lever's range.
 */
export function contradictions(specs: readonly LeverSpec[], settings: LeverSettings): string[] {
  const at = (id: LeverId) => placeIn(specOf(specs, id), settings[id]);
  const big = at("revenue") >= 2 / 3;
  const rich = at("margin") >= 2 / 3;
  const cheap = at("salesToCapital") >= 2 / 3;
  const safe = at("risk") <= 1 / 3;
  if (big && rich && cheap && safe) return ["Every lever at its best: a wish, not a story"];
  return [...(big && cheap ? ["Fast growth with little investment"] : []), ...(big && safe ? ["Fast growth with less risk"] : [])];
}

/** The levers at rest, each one alone: the setting nearest the price on its own steps, when its range reaches the price. */
export function priceReach(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode?: ValueLeversMode): string[] {
  const target = block.price.value;
  return specs
    .filter((spec) => !spec.more && spec.id !== "failure")
    .flatMap((spec) => {
      let before: { v: number; gap: number } | null = null;
      for (let v = spec.min; v <= spec.max + 1e-9; v = onStep(v + spec.step, spec.step)) {
        const valued = valueOf(block, specs, { ...settings, [spec.id]: v }, mode);
        if (!valued.ok) continue;
        const gap = valued.valuePerShare - target;
        if (before && Math.sign(gap) !== Math.sign(before.gap)) {
          const nearest = Math.abs(gap) < Math.abs(before.gap) ? v : before.v;
          return [`${SHORT[spec.id]} ${spec.reading(nearest)}`];
        }
        if (gap === 0) return [`${SHORT[spec.id]} ${spec.reading(v)}`];
        before = { v, gap };
      }
      return [];
    });
}

/**
 * The range of values (Spine Topic 14): each lever at rest moved alone to the low and the high end of its band, the others
 * as they are, and the levers ranked by how far that moves the value. A band is the Topic's, written around the Case's own
 * setting and moved with the Learner's (so it spreads around their story, not his), or an eighth of the lever's range
 * either side of its setting. One lever at a time, so it is narrower than a simulation that moves them all together.
 */
export function valueRange(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode: Extract<ValueLeversMode, { kind: "range" }>): { low: number; high: number; ranked: LeverId[] } {
  const swings = specs
    .filter((spec) => !spec.more)
    .map((spec) => {
      const width = (spec.max - spec.min) / 8;
      const band = mode.bands?.[spec.id];
      const shift = settings[spec.id] - spec.opening;
      const [from, to] = band ? [band[0] + shift, band[1] + shift] : [settings[spec.id] - width, settings[spec.id] + width];
      const ends = [from, to].map((v) => valueOf(block, specs, { ...settings, [spec.id]: Math.min(spec.max, Math.max(spec.min, v)) }, mode)).flatMap((r) => (r.ok ? [r.valuePerShare] : []));
      return { id: spec.id, ends };
    })
    .filter((s) => s.ends.length === 2);
  const all = swings.flatMap((s) => s.ends);
  const ranked = [...swings].sort((a, b) => Math.abs(b.ends[1] - b.ends[0]) - Math.abs(a.ends[1] - a.ends[0])).map((s) => s.id);
  return { low: Math.min(...all), high: Math.max(...all), ranked };
}

// ——— Stories ———

/** A chip that moves every lever at once to a story; `afterInsight` ones show only once the Topic's Insight is settled. */
export type Story = { id: string; label: string; settings: LeverSettings; afterInsight: boolean; flagged?: boolean };

/** What a Topic or the Tutor may say about the stories: the Case's story's name, and the settings of the story worth the price. */
export type StoryOptions = { caseStory?: string; priceStory?: Partial<LeverSettings> };

/** The settings of a story worth the price: `given` when it lands within priceTolerance, else found by moving revenue alone, then margin alone; null when neither reaches it. */
export function storyAtPrice(block: ValuationBlock, specs: readonly LeverSpec[], given?: Partial<LeverSettings>, mode?: ValueLeversMode): LeverSettings | null {
  const opening = openingSettings(specs);
  const lands = (settings: LeverSettings) => {
    const valued = valueOf(block, specs, settings, mode);
    return valued.ok && Math.abs(valued.valuePerShare - block.price.value) <= priceTolerance(block) + 1e-9;
  };
  if (given) {
    const settings = { ...opening, ...given };
    return lands(settings) ? settings : null;
  }
  for (const id of ["revenue", "margin"] as const) {
    const spec = specOf(specs, id);
    for (let v = spec.min; v <= spec.max + 1e-9; v = onStep(v + spec.step, spec.step)) {
      const settings = { ...opening, [id]: v };
      if (lands(settings)) return settings;
    }
  }
  return null;
}

/** The margin a grocer keeps, for the contrast story "A grocer's margins". */
export const GROCER_MARGIN = 4;

/**
 * The story chips (B3): the Case's own story; "A grocer's margins", the Case's story with a grocer's 4% margin, in the base
 * Widget only; in two stories mode the Topic's two stories, each flagged when its settings contradict each other; and, only
 * after the Topic's Insight is settled, "A story worth" the price, whose settings the engine has checked land within
 * priceTolerance of it (it is left out when they do not).
 */
export function valueLeversStories(block: ValuationBlock, specs: readonly LeverSpec[], options: StoryOptions = {}, mode?: ValueLeversMode): Story[] {
  const opening = openingSettings(specs);
  const margin = specOf(specs, "margin");
  const stories: Story[] = [{ id: "case", label: options.caseStory ?? "The Case's story", settings: opening, afterInsight: false }];
  if (!mode && GROCER_MARGIN >= margin.min && GROCER_MARGIN <= margin.max && !near(margin.opening, GROCER_MARGIN)) {
    stories.push({ id: "grocer", label: "A grocer's margins", settings: { ...opening, margin: GROCER_MARGIN }, afterInsight: false });
  }
  if (mode?.kind === "two_stories") {
    mode.stories.forEach((story, i) => {
      const settings = storySettings(specs, opening, story);
      stories.push({ id: `story${i + 1}`, label: story.label, settings, afterInsight: false, flagged: contradictions(specs, settings).length > 0 });
    });
  }
  const atPrice = storyAtPrice(block, specs, options.priceStory, mode);
  if (atPrice) stories.push({ id: "price", label: `A story worth ${valueText(block.price.value, block)}`, settings: atPrice, afterInsight: true });
  return stories;
}

/** True when two settings are the same story. */
export function sameSettings(a: LeverSettings, b: LeverSettings): boolean {
  return LEVER_IDS.every((id) => near(a[id], b[id]));
}

// ——— Things to try, and what has moved the value ———

/** A word with its first letter capitalised, for a label that starts with it ("Talk on 2 Dec 2014"). */
const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The Things to try (B3), the price in the Case's own words (its label, when it is not a price anyone paid). */
export function valueLeversTasks(block: ValuationBlock): string[] {
  return ["Move one lever at a time. Which one moves the value most?", `Find a story worth the ${valueText(block.price.value, block)} ${priceWord(block)}`];
}

/**
 * Which levers have moved the value (a bit for each, in LEVER_IDS order), and the lever whose one move has moved it most so
 * far (its place in LEVER_IDS plus one; 0 for none) and by how much. Kept as three Widget state numbers, so a reload, the
 * server and the Tutor all read it.
 */
export type Moves = { moved: number; mostLever: number; mostBy: number };

/** The lever being moved now and the value before it started; a move of another lever, or a story chip, starts a new one. */
export type MoveRun = { lever: LeverId | null; from: number | null };

export const NO_MOVES: Moves = { moved: 0, mostLever: 0, mostBy: 0 };
export const NO_RUN: MoveRun = { lever: null, from: null };

/** The move record after `lever` moved the value from `before` to `after` (null when a story cannot be valued). */
export function recordMove(moves: Moves, run: MoveRun, lever: LeverId, before: number | null, after: number | null): { moves: Moves; run: MoveRun } {
  const next: MoveRun = run.lever === lever ? run : { lever, from: before };
  if (next.from === null || after === null) return { moves, run: next };
  const by = Math.abs(after - next.from);
  const index = LEVER_IDS.indexOf(lever);
  const moved = by > 0 ? moves.moved | (1 << index) : moves.moved;
  const most = by > moves.mostBy ? { mostLever: index + 1, mostBy: by } : { mostLever: moves.mostLever, mostBy: moves.mostBy };
  return { moves: { moved, ...most }, run: next };
}

/** How many different levers have moved the value. */
export function leversMoved(moves: Moves): number {
  return LEVER_IDS.filter((_, i) => (moves.moved & (1 << i)) !== 0).length;
}

/** Whether each Thing to try holds now: two levers moved one at a time, and a story within priceTolerance of the price. */
export function taskConditions(model: ValueLeversModel, moves: Moves): boolean[] {
  return [leversMoved(moves) >= 2, model.nearPrice];
}

/** The lever that has moved the value most so far, and by how much in the headline's terms; null before any move. */
export function biggestMover(moves: Moves, specs: readonly LeverSpec[], block: ValuationBlock): { spec: LeverSpec; by: string } | null {
  const id = LEVER_IDS[moves.mostLever - 1];
  if (!id || !(moves.mostBy > 0)) return null;
  const by = block.per === "company" ? moneyText(moves.mostBy, block) : moveText(moves.mostBy, block);
  return { spec: specOf(specs, id), by };
}

/** The settings from Widget state numbers, each lever's own where it is a finite number, else its opening. */
export function settingsFrom(values: Partial<Record<LeverId, unknown>>, specs: readonly LeverSpec[]): LeverSettings {
  return Object.fromEntries(
    specs.map((s) => {
      const v = values[s.id];
      return [s.id, typeof v === "number" && Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.opening];
    }),
  ) as LeverSettings;
}

/** The move record from Widget state numbers. */
export function movesFrom(values: { moved?: unknown; mostLever?: unknown; mostBy?: unknown }): Moves {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  return { moved: Math.floor(n(values.moved)), mostLever: Math.floor(n(values.mostLever)), mostBy: n(values.mostBy) };
}

/**
 * The size of Value levers at rest, for the Workbench budget (B2): its controls at rest and under More settings, its one
 * visual, the numbers it shows at rest (the headline, the price, and the share after year 10 or the mode's readout), its
 * headline, its prose words (the headline, captions, the readouts' labels and a mode's readout, which names any marks) and
 * its Things to try.
 */
export function valueLeversShape(block: ValuationBlock, mode?: ValueLeversMode): { controls: number; more: number; visuals: number; numbers: number; headlines: number; words: number; tasks: number } {
  const specs = leverSpecs(block, mode);
  const model = valueLeversModel(block, specs, openingSettings(specs), mode);
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const readout = model.readout ? [model.readout.label, model.readout.text, model.readout.note ?? ""] : [AFTER_YEAR_10_LABEL];
  const prose = [
    `${model.headline.before}${model.headline.key}${model.headline.after}`,
    ...specs.flatMap((s) => (s.caption ? [s.caption] : [])),
    model.price.label,
    ...readout,
    CASH_FLOW_CAPTION,
    ...model.flags,
  ];
  return {
    controls: specs.filter((s) => !s.more).length,
    more: specs.filter((s) => s.more).length,
    visuals: 1,
    numbers: 1 + 1 + (model.readout || model.afterYear10 ? 1 : 0),
    headlines: 1,
    words: prose.reduce((sum, text) => sum + words(text), 0),
    tasks: valueLeversTasks(block).length,
  };
}

// ——— The part's data, what the check lists and what the Tutor is told ———

/** What a ValueLevers part draws: its Valuation Case, its Spine Topic's mode, and the names and settings of its stories. */
export type ValueLeversData = { block: ValuationBlock; mode?: ValueLeversMode; caseStory?: string; priceStory?: Partial<LeverSettings> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A ValueLevers part's data from its literal props, or a sentence saying what is wrong. Its Case is a course Case, else one of the Learner's Own Cases when given. */
export function valueLeversData(props: Record<string, unknown>, ownCases?: OwnCases | null): { data: ValueLeversData } | { problem: string } {
  // In a mode with Case chips (the ready-Case valuation Topic) the Learner's pick, `caseChoice`, decides which Case is valued, so
  // what the Tutor is told matches the Widget on screen rather than the Case the program was compiled with.
  const pickable = caseListOf(props.mode);
  const picked = typeof props.caseChoice === "number" && Number.isFinite(props.caseChoice) && pickable.length > 0;
  const caseId = picked ? pickable[Math.min(pickable.length - 1, Math.max(0, Math.round(props.caseChoice as number)))].id : props.caseId;
  const block = typeof caseId === "string" ? findValuation(caseId, ownCases) : null;
  if (!block) return { problem: `${typeof props.caseId === "string" ? `"${props.caseId}"` : "This part"} is not a Valuation Case. Cases: ${valuationCaseIds().join(", ")}.` };
  let mode: ValueLeversMode | undefined;
  if (props.mode !== undefined && props.mode !== null) {
    const parsed = valueLeversModeSchema.safeParse(props.mode);
    if (!parsed.success) return { problem: `mode: ${parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "value"}: ${i.message}`).join("; ")}` };
    mode = parsed.data;
  }
  const priceStory = isRecord(props.priceStory) ? topicStorySchema.shape.levers.safeParse(props.priceStory) : null;
  return {
    data: {
      block,
      ...(mode ? { mode } : {}),
      ...(typeof props.caseStory === "string" ? { caseStory: props.caseStory } : {}),
      ...(priceStory?.success ? { priceStory: priceStory.data } : {}),
    },
  };
}

/** The levers as a Workbench lists them (registry.ts): the same specs, with no chips (Value levers' Things to try name no value). */
export function valueLeversLevers(data: ValueLeversData): BenchLever<LeverId>[] {
  return leverSpecs(data.block, data.mode).map((spec) => ({ ...spec, chips: [] }));
}

/** The Cases the Learner can switch between with a chip (all open or match price mode), or [] when the mode has none. */
export function caseListOf(rawMode: unknown): { id: string; label: string }[] {
  if (rawMode === undefined || rawMode === null) return [];
  const parsed = valueLeversModeSchema.safeParse(rawMode);
  return parsed.success ? (modeCases(parsed.data) ?? []) : [];
}

/** The market chosen, from the Widget state number: the first one when it is missing or out of range. */
export function marketFrom(value: unknown, mode?: ValueLeversMode): number {
  if (mode?.kind !== "market") return 0;
  return typeof value === "number" && Number.isFinite(value) ? Math.min(mode.markets.length - 1, Math.max(0, Math.round(value))) : 0;
}

/**
 * What a Value levers part shows the Tutor (spec 2026-11-12, B3): each lever at its setting, as the Widget prints it, and the
 * readouts worked out by the valuation engine: the value, the price, the share of value after year 10 or the mode's readout,
 * any contradictions, the market chosen, and which lever has moved the value most so far.
 */
export function valueLeversReading(data: ValueLeversData, props: Record<string, unknown>): BenchReading {
  const { block, mode } = data;
  const specs = leverSpecs(block, mode);
  const settings = settingsFrom(props, specs);
  const market = marketFrom(props[MARKET_VARIABLE], mode);
  const model = valueLeversModel(block, specs, settings, mode, market);
  const sliders = specs.map((spec) => ({ label: spec.title === spec.label ? spec.label : `${spec.label} (${spec.title.toLowerCase()})`, text: spec.reading(settings[spec.id]) }));
  const most = biggestMover(movesFrom(props), specs, block);
  const valued =
    model.value === null
      ? `Value: cannot be valued (${model.error})`
      : model.nothingLeft
        ? `Value: ${model.headline.key}, ${model.headline.after.replace(/^: /, "")}`
        : `Value: ${model.headline.key}${model.headline.after}`;
  const chosen = mode?.kind === "market" ? mode.markets[market] : null;
  return {
    sliders,
    readouts: [
      valued,
      `${model.price.label}: ${model.price.text}`,
      ...(model.readout ? [`${model.readout.label}: ${model.readout.text}${model.readout.note ? `. ${model.readout.note}` : ""}`] : model.afterYear10 ? [`Share of the value from after year 10: ${model.afterYear10.text}`] : []),
      ...(chosen ? [`Market: ${chosen.label}, ${moneyText(chosen.size, block)} today${chosen.growthPercent ? `, growing ${chosen.growthPercent}% a year` : ""} (sourced: ${chosen.source.title})`] : []),
      ...model.flags.map((flag) => `Flag: ${flag}`),
      most ? `Moved the value most so far: ${most.spec.title} (${most.spec.label.toLowerCase()}), by ${most.by}` : "No lever moved yet",
    ],
  };
}

/** A Learner's Valuation story as a one-page note (Spine Topic 15): what the Topic flow saves to the Notebook. */
export type SavedStory = { title: string; lines: string[]; settings: LeverSettings; value: number | null };

/** The note for these settings: the Case and its date, each lever as set, the value against the price (in the Case's own word for it), and the share after year 10. */
export function storyNote(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, model: ValueLeversModel, caseName?: string): SavedStory {
  const value = model.value === null ? "cannot be valued" : model.nothingLeft ? `${SYMBOL(block.currency)}0, nothing left for shareholders` : `${model.headline.key}${model.headline.after}`;
  return {
    title: `My Valuation story${caseName ? `: ${caseName}` : ""}, against the ${model.price.word} of ${dateText(block.price.date)}`,
    lines: [
      ...specs.map((spec) => (spec.title === spec.label ? `${spec.title}: ${spec.reading(settings[spec.id])}` : `${spec.title}: ${spec.label.toLowerCase()} ${spec.reading(settings[spec.id])}`)),
      `Worth: ${value}`,
      `${model.price.label}: ${model.price.text}`,
      ...(model.afterYear10 ? [`${AFTER_YEAR_10_LABEL}: ${model.afterYear10.text}`] : []),
      ...model.flags.map((flag) => `Flag: ${flag}`),
    ],
    settings,
    value: model.value,
  };
}
