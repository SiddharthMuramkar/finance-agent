import { FORECAST_YEARS, valueStory, type DcfValue } from "./dcf-engine.ts";

// The multiple of revenue a view on growth, risk and margin justifies (spec 2026-11-12, B4: the Multiple decoder Widget,
// Spine Topic 12): the business value the valuation engine gives a company with one unit of revenue today, so value to
// sales. A multiple a market pays can then be read back as the growth, risk and margin it hides. Percents, the house
// convention.
//
// Imports only relative modules (no "@/" paths), so plain Node can run it too.

/** Years of the growth the lever sets, before growth fades in a straight line to growth after year 10. */
export const HIGH_GROWTH_YEARS = 5;

export type JustifiedMultipleInputs = {
  /** Revenue growth in each of years 1 to 5, in percent. */
  growthPercent: number;
  /** The cost of capital, the same every year, in percent: the risk lever. */
  costOfCapitalPercent: number;
  /** The operating margin, every year and after year 10, in percent. */
  marginPercent: number;
  taxPercent: number;
  /** Revenue added for each unit of new capital invested, which sets what growth costs. */
  salesToCapital: number;
  /** Growth after year 10, for ever, in percent; below the cost of capital. */
  growthAfterPercent: number;
};

export type JustifiedMultipleResult = ({ ok: true; multiple: number } & DcfValue) | { ok: false; error: string };

/**
 * The revenue growth path: the lever's growth for HIGH_GROWTH_YEARS years, then a straight fade to growth after year 10,
 * which year 10 reaches. 30% fading to 3% is 30, 30, 30, 30, 30, 24.6, 19.2, 13.8, 8.4 and 3.
 */
export function fadingGrowth(growth: number, growthAfter: number): number[] {
  const fade = FORECAST_YEARS - HIGH_GROWTH_YEARS;
  return Array.from({ length: FORECAST_YEARS }, (_, i) => (i < HIGH_GROWTH_YEARS ? growth : growth - ((growth - growthAfter) * (i + 1 - HIGH_GROWTH_YEARS)) / fade));
}

/**
 * Value to sales for this view: the engine values a company with revenue of 1 today, growing on fadingGrowth, keeping the
 * same margin every year, with no losses carried, no cash, debt or options, discounted at one cost of capital. After year
 * 10 new capital earns exactly the cost of capital, so growth then neither adds value nor takes it away, as for a mature
 * company with no edge left. With no growth at all the multiple is margin × (1 - tax) / cost of capital: 20% kept, 25%
 * tax and 10% cost of capital justify 1.5 times sales.
 */
export function justifiedMultiple(inputs: JustifiedMultipleInputs): JustifiedMultipleResult {
  const rate = inputs.costOfCapitalPercent / 100;
  const margin = inputs.marginPercent / 100;
  const valued = valueStory({
    baseRevenue: 1,
    growth: fadingGrowth(inputs.growthPercent / 100, inputs.growthAfterPercent / 100),
    margin: Array(FORECAST_YEARS).fill(margin),
    marginAfter: margin,
    taxRate: inputs.taxPercent / 100,
    lossesCarried: 0,
    salesToCapital: inputs.salesToCapital,
    costOfCapital: Array(FORECAST_YEARS).fill(rate),
    growthAfter: inputs.growthAfterPercent / 100,
    returnOnCapitalAfter: rate,
    cash: 0,
    debt: 0,
    options: 0,
    shares: 1,
  });
  if (!valued.ok) return valued;
  return { ...valued, multiple: valued.businessValue };
}
