import { applyLevers, type Levers as EngineLevers, type ValuationBlock } from "../valuation-case.ts";
import { valuationCase } from "../valuation-cases.ts";

// The four levers widget's model (Signal spec §6.2.1; decision #18, option C): Amazon in February 2000, valued by the one
// valuation engine on Case amazon-dcf-2000, Damodaran's sourced inputs. Four numbers (how big it gets, what it keeps, what
// growth costs, how risky) move the Case's story, `applyLevers` values it, and this module reads the result in dollars a
// share. The engine reproduces Damodaran's published $35.08 within 2% ($35.04: the paper prints its costs of capital to two
// decimals), so the Signal widget, the Topic Workbench and the Tutor show the same numbers.
//
// The levers are in the units the sliders show: revenue in year 10 in $bn, margin and cost of capital in percent. Money in
// the result is in the Case's unit ($ millions); values a share are in dollars.
//
// Pure functions: no React, no database. Imports only relative modules, so plain Node can run it too.

/** The Case the widget values: Damodaran's Amazon, February 2000, as the val-dcf Topic holds it. */
export const CASE_ID = "amazon-dcf-2000";

function caseBlock(): ValuationBlock {
  const block = valuationCase(CASE_ID);
  if (!block) throw new Error(`The valuation Case ${CASE_ID} is missing or does not parse.`);
  return block;
}

/** The Case's valuation block, parsed once. */
export const AMAZON: ValuationBlock = caseBlock();

/** The share price on 3 February 2000, in dollars: the Case's price. */
export const PRICE = AMAZON.price.value;

/** The Case's money is in $ millions; the revenue lever is in $bn. */
const MILLIONS_PER_BN = 1000;

export type LeverKey = "rev" | "margin" | "s2c" | "wacc";
/** The four levers in slider units: revenue in year 10 ($bn), mature margin (%), sales per $1 invested, cost of capital (%). */
export type Levers = Record<LeverKey, number>;

export type Lever = { key: LeverKey; name: string; label: string; min: number; max: number; step: number };

/** The four levers in display order, with their slider ranges (spec §6.2.1). */
export const LEVERS: readonly Lever[] = [
  { key: "rev", name: "How big it gets", label: "Revenue in year 10", min: 5, max: 80, step: 1 },
  { key: "margin", name: "What it keeps", label: "Operating margin once mature", min: 0, max: 20, step: 0.5 },
  { key: "s2c", name: "What growth costs", label: "Sales for each $1 invested", min: 1, max: 6, step: 0.25 },
  { key: "wacc", name: "How risky", label: "Cost of capital while it grows", min: 8.04, max: 17.84, step: 0.2 },
];

export type PresetKey = "damodaran" | "grocer" | "price";

/**
 * The preset chips. His story is the Case. "One story worth $84" is $59bn of revenue, a 12% margin and an 11.84% cost of
 * capital: $83.69, which shows as $84 ($60bn gives $85 on the engine).
 */
export const PRESETS: Record<PresetKey, { label: string; levers: Levers }> = {
  damodaran: { label: "The published Story", levers: { rev: 39, margin: 10, s2c: 3, wacc: 12.84 } },
  grocer: { label: "A grocer’s margins", levers: { rev: 39, margin: 5, s2c: 3, wacc: 12.84 } },
  price: { label: "One story worth $84", levers: { rev: 59, margin: 12, s2c: 3, wacc: 11.84 } },
};

/** The reference story, "his story": every effect is measured against it. */
export const REFERENCE: Levers = PRESETS.damodaran.levers;

/** A lever within a millionth of its reference value counts as at it (slider values are snapped to 2 decimals). */
const atReference = (key: LeverKey, value: number) => Math.abs(value - REFERENCE[key]) < 1e-6;

/**
 * The engine's levers for a story. A lever at its reference value leaves the Case's own figure alone (the rule of the
 * Workbench's `leversFor`), so his story is exactly the Case: $35.04, not the $35.03 a flat $39bn of revenue would give.
 */
export function engineLevers(levers: Levers): EngineLevers {
  return {
    ...(!atReference("rev", levers.rev) && { revenueYear10: levers.rev * MILLIONS_PER_BN }),
    ...(!atReference("margin", levers.margin) && { marginTarget: levers.margin }),
    ...(!atReference("s2c", levers.s2c) && { salesToCapital: levers.s2c }),
    ...(!atReference("wacc", levers.wacc) && { costOfCapitalGrowing: levers.wacc }),
  };
}

export type LeversResult = {
  /** Each year's free cash flow in today's money, $ millions, years 1 to 10. */
  flows: number[];
  /** Years 1 to 10 in today's money, $ millions. */
  pv: number;
  /** Everything after year 10, valued at the end of year 10, $ millions. */
  tv: number;
  /** The terminal value in today's money, $ millions. */
  pvtv: number;
  /** The business: pv + pvtv, $ millions. */
  firm: number;
  /** The true value a share, negative when the business is worth less than it owes. */
  perShare: number;
  /** The share of the business value that arrives after year 10; above 1 when years 1 to 10 burn cash. Null when firm ≤ 0. */
  tvShare: number | null;
  /** Each year's cash in today's money, dollars a share. */
  flowsPerShare: number[];
  /** Years 1 to 10, dollars a share. */
  yrs: number;
  /** Everything after year 10, dollars a share. */
  after: number;
  /** What is owed to others (debt and options, less cash), dollars a share: a positive number, taken away. */
  owes: number;
};

/** Values a story told in the four levers with the valuation engine on the Case. */
export function leversModel(levers: Levers): LeversResult {
  const valued = applyLevers(AMAZON, engineLevers(levers));
  if (!valued.ok) throw new Error(valued.error);
  const { shares } = AMAZON;
  const flows = valued.years.map((y) => y.pv);
  const firm = valued.goingConcern;
  return {
    flows,
    pv: valued.sumPv,
    tv: valued.terminalValue,
    pvtv: valued.pvTerminal,
    firm,
    perShare: valued.valuePerShare,
    tvShare: firm > 0 ? valued.pvTerminal / firm : null,
    flowsPerShare: flows.map((f) => f / shares),
    yrs: valued.sumPv / shares,
    after: valued.pvTerminal / shares,
    owes: (AMAZON.debt + AMAZON.options - AMAZON.cash) / shares,
  };
}

/** His story's value a share: the reference notch on the ruler and the "This is his story" line (spec §6.2.2, §6.2.3). */
export const REFERENCE_VALUE = leversModel(REFERENCE).perShare;

const FACTORIAL = [1, 1, 2, 6, 24];

/**
 * What each lever adds to or takes from the reference story, in dollars a share: a Shapley value over the 16 ways to
 * mix current and reference levers, so the four effects always add up to perShare(current) − perShare(reference), in
 * whatever order the levers were moved. A lever at its reference value has an effect of exactly 0.
 */
export function leverEffects(current: Levers, reference: Levers = REFERENCE): Record<LeverKey, number> {
  const keys = LEVERS.map((lever) => lever.key);
  const n = keys.length;
  const subsets = Array.from({ length: 2 ** n }, (_, mask) => keys.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1));
  // value[mask]: the levers in the subset at their current values, the others at reference.
  const value = subsets.map((subset) => leversModel({ ...reference, ...Object.fromEntries(subset.map((key) => [key, current[key]])) }).perShare);
  const effectOf = (i: number) =>
    subsets.reduce((effect, subset, mask) => {
      if (subset.includes(keys[i])) return effect;
      const weight = (FACTORIAL[subset.length] * FACTORIAL[n - 1 - subset.length]) / FACTORIAL[n];
      return effect + weight * (value[mask + 2 ** i] - value[mask]);
    }, 0);
  return Object.fromEntries(keys.map((key, i) => [key, effectOf(i)])) as Record<LeverKey, number>;
}

export type LeverBand = {
  /** The value a share with the lever at its minimum, the other three at reference. */
  atMin: number;
  /** The value a share with the lever at its maximum, the other three at reference. */
  atMax: number;
  lo: number;
  hi: number;
  /** The first setting, stepping up from the minimum, at which the value is at least the $84 price; null if none. */
  reach: number | null;
};

/** Every setting a lever's slider can take, snapped to 2 decimals as the slider snaps it. */
export function leverSettings(lever: Lever): number[] {
  const steps = Math.round((lever.max - lever.min) / lever.step);
  return Array.from({ length: steps + 1 }, (_, i) => Math.round((lever.min + i * lever.step) * 100) / 100);
}

/** What one lever can do on its own, the other three at their reference values. */
export function leverBand(key: LeverKey, reference: Levers = REFERENCE): LeverBand {
  const lever = LEVERS.find((l) => l.key === key)!;
  const valueAt = (setting: number) => leversModel({ ...reference, [key]: setting }).perShare;
  const atMin = valueAt(lever.min);
  const atMax = valueAt(lever.max);
  return { atMin, atMax, lo: Math.min(atMin, atMax), hi: Math.max(atMin, atMax), reach: leverSettings(lever).find((s) => valueAt(s) >= PRICE) ?? null };
}

/** A slider value snapped to its lever's grid and range, at 2 decimals (spec §6.2.2, "Pointer to value"). */
export function snapLever(key: LeverKey, raw: number): number {
  const lever = LEVERS.find((l) => l.key === key)!;
  const clamped = Math.min(lever.max, Math.max(lever.min, Number.isFinite(raw) ? raw : REFERENCE[key]));
  return Math.round((Math.round((clamped - lever.min) / lever.step) * lever.step + lever.min) * 100) / 100;
}
