import { FORECAST_YEARS, valueStory } from "../dcf-engine.ts";

// The four levers model (Signal spec §6.2.1): Amazon in February 2000, simplified and calibrated to Damodaran's $35.08.
// Four numbers (how big it gets, what it keeps, what growth costs, how risky) give a value a share. The year-by-year
// arithmetic is the valuation engine's (dcf-engine.ts); this module only turns the four levers into an engine story.
// Money is in $bn, shares in bn, so a value a share is in dollars. The levers are in the units the sliders show:
// revenue in $bn, margin and cost of capital in percent.
//
// Pure functions: no React, no database. Imports only relative modules, so plain Node can run it too.

/** Revenue, $bn, 12 months to September 1999. */
export const R0 = 1.117;
/** The operating margin today: an operating loss of $410m on $1,117m of sales. */
export const M0 = -410 / 1117;
export const TAX = 0.35;
/** Shares, bn. */
export const SH = 0.3408;
/** $bn owed to others before shareholders. */
export const CLAIMS = 3.15;
/** How growth fades over years 1 to 10: year t grows at k × SHAPE[t − 1]. */
export const SHAPE = [1, 0.85, 0.72, 0.6, 0.5, 0.41, 0.33, 0.26, 0.2, 0.15] as const;
/** The cost of capital from year 10. */
export const STABLE_COST_OF_CAPITAL = 0.0961;
/** Growth after year 10, for ever. */
export const STABLE_GROWTH = 0.06;
/** The return new capital earns after year 10; it sets reinvestment then. */
export const STABLE_RETURN_ON_CAPITAL = 0.2;
/** The share price on 3 February 2000, in dollars. */
export const PRICE = 84;

export type LeverKey = "rev" | "margin" | "s2c" | "wacc";
/** The four levers in slider units: revenue in year 10 ($bn), mature margin (%), sales per $1 invested, cost of capital (%). */
export type Levers = Record<LeverKey, number>;

export type Lever = { key: LeverKey; name: string; label: string; min: number; max: number; step: number };

/** The four levers in display order, with their slider ranges. */
export const LEVERS: readonly Lever[] = [
  { key: "rev", name: "How big it gets", label: "Revenue in year 10", min: 5, max: 80, step: 1 },
  { key: "margin", name: "What it keeps", label: "Operating margin once mature", min: 0, max: 20, step: 0.5 },
  { key: "s2c", name: "What growth costs", label: "Sales for each $1 invested", min: 1, max: 6, step: 0.25 },
  { key: "wacc", name: "How risky", label: "Cost of capital while it grows", min: 8.04, max: 17.84, step: 0.2 },
];

export type PresetKey = "damodaran" | "grocer" | "price";

export const PRESETS: Record<PresetKey, { label: string; levers: Levers }> = {
  damodaran: { label: "His story", levers: { rev: 39, margin: 10, s2c: 3, wacc: 12.84 } },
  grocer: { label: "A grocer’s margins", levers: { rev: 39, margin: 5, s2c: 3, wacc: 12.84 } },
  price: { label: "One story worth $84", levers: { rev: 60, margin: 12, s2c: 3, wacc: 11.84 } },
};

/** The reference story, "his story": every effect is measured against it. */
export const REFERENCE: Levers = PRESETS.damodaran.levers;

export type LeversResult = {
  /** The growth scale k that takes revenue from R0 to the lever's revenue in year 10. */
  k: number;
  /** Each year's free cash flow in today's money, $bn, years 1 to 10. */
  flows: number[];
  /** Years 1 to 10 in today's money, $bn. */
  pv: number;
  /** Everything after year 10, valued at the end of year 10, $bn. */
  tv: number;
  /** The terminal value in today's money, $bn. */
  pvtv: number;
  /** The business: pv + pvtv, $bn. */
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
  /** What is owed to others, dollars a share (a positive number, taken away). */
  owes: number;
};

/** Revenue in year 10 for growth scale k. */
function revenueAfterTen(k: number): number {
  return SHAPE.reduce((revenue, shape) => revenue * (1 + k * shape), R0);
}

/** Solves R0 × Π (1 + k × SHAPE[t − 1]) = rev for k by bisection: 70 steps between −0.5 and 20. */
export function growthScale(rev: number): number {
  let lo = -0.5;
  let hi = 20;
  for (let step = 0; step < 70; step++) {
    const mid = (lo + hi) / 2;
    if (revenueAfterTen(mid) < rev) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Values a story told in the four levers, by the algorithm of spec §6.2.1. */
export function leversModel(levers: Levers): LeversResult {
  const k = growthScale(levers.rev);
  const margin = levers.margin / 100;
  const wacc = levers.wacc / 100;
  const years = Array.from({ length: FORECAST_YEARS }, (_, i) => i + 1);
  const valued = valueStory({
    baseRevenue: R0,
    growth: SHAPE.map((shape) => k * shape),
    // The margin moves from today's toward the mature margin, most of the way in the first years.
    margin: years.map((t) => M0 + (margin - M0) * (1 - (1 - t / 10) ** 6)),
    marginAfter: margin,
    taxRate: TAX,
    lossesCarried: 0,
    salesToCapital: levers.s2c,
    // The lever's cost of capital for five years, then a straight fade to the stable cost of capital in year 10.
    costOfCapital: years.map((t) => (t <= 5 ? wacc : wacc + ((STABLE_COST_OF_CAPITAL - wacc) * (t - 5)) / 5)),
    growthAfter: STABLE_GROWTH,
    returnOnCapitalAfter: STABLE_RETURN_ON_CAPITAL,
    cash: 0,
    debt: CLAIMS,
    options: 0,
    shares: SH,
  });
  if (!valued.ok) throw new Error(valued.error);

  const flows = valued.years.map((y) => y.pv);
  const firm = valued.goingConcern;
  return {
    k,
    flows,
    pv: valued.sumPv,
    tv: valued.terminalValue,
    pvtv: valued.pvTerminal,
    firm,
    perShare: valued.valuePerShare,
    tvShare: firm > 0 ? valued.pvTerminal / firm : null,
    flowsPerShare: flows.map((f) => f / SH),
    yrs: valued.sumPv / SH,
    after: valued.pvTerminal / SH,
    owes: CLAIMS / SH,
  };
}

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

/** What one lever can do on its own, the other three at their reference values. */
export function leverBand(key: LeverKey, reference: Levers = REFERENCE): LeverBand {
  const lever = LEVERS.find((l) => l.key === key)!;
  const valueAt = (setting: number) => leversModel({ ...reference, [key]: setting }).perShare;
  const atMin = valueAt(lever.min);
  const atMax = valueAt(lever.max);
  // Every setting the slider can take, snapped to 2 decimals as the slider snaps it.
  const steps = Math.round((lever.max - lever.min) / lever.step);
  const settings = Array.from({ length: steps + 1 }, (_, i) => Math.round((lever.min + i * lever.step) * 100) / 100);
  return { atMin, atMax, lo: Math.min(atMin, atMax), hi: Math.max(atMin, atMax), reach: settings.find((s) => valueAt(s) >= PRICE) ?? null };
}
