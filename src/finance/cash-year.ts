import { yearCash } from "./dcf-engine.ts";

// One year of a business's cash, from revenue down to free cash flow (spec 2026-11-12, B4: the Cash waterfall Widget, Spine
// Topic 3). Percents, the house convention; money in whatever unit the revenue is in. The arithmetic is the valuation
// engine's own year (yearCash, rules 1 to 5 of B1), so the waterfall and Value levers can never disagree about a year.
//
// Imports only relative modules (no "@/" paths), so plain Node can run it too.

export type CashYearInputs = {
  /** Revenue in the year before, which this year's growth starts from. */
  lastRevenue: number;
  growthPercent: number;
  /** This year's operating margin, in percent; below zero for a loss. */
  marginPercent: number;
  taxPercent: number;
  /** Revenue added for each unit of new capital invested. */
  salesToCapital: number;
  /** Losses carried into the year, which shield a profit from tax; none when left out. */
  lossesCarried?: number;
};

/** The waterfall's steps, top to bottom: revenue, less what running the business costs, less tax, less what growth costs. */
export type CashYear = {
  revenue: number;
  /** Revenue less operating income: what running the business cost this year. */
  operatingCosts: number;
  operatingIncome: number;
  tax: number;
  /** What growth cost: the rise in revenue divided by sales to capital. */
  reinvestment: number;
  fcf: number;
  /** Losses still carried forward at the end of the year. */
  lossesAfter: number;
};

export type CashYearResult = ({ ok: true } & CashYear) | { ok: false; error: string };

/** One year of cash, by the engine's rules; a plain sentence instead when the inputs cannot make one. */
export function cashYear(inputs: CashYearInputs): CashYearResult {
  const losses = inputs.lossesCarried ?? 0;
  const numbers = [inputs.lastRevenue, inputs.growthPercent, inputs.marginPercent, inputs.taxPercent, inputs.salesToCapital, losses];
  if (!numbers.every(Number.isFinite)) return { ok: false, error: "Every input must be a number." };
  if (!(inputs.lastRevenue > 0)) return { ok: false, error: "Last year's revenue must be above zero." };
  if (inputs.growthPercent <= -100) return { ok: false, error: "Revenue cannot shrink by 100% or more in a year." };
  if (!(inputs.salesToCapital > 0)) return { ok: false, error: "Sales to capital must be above zero." };
  if (inputs.taxPercent < 0 || inputs.taxPercent > 100) return { ok: false, error: "The tax rate must be between 0% and 100%." };
  if (losses < 0) return { ok: false, error: "Losses carried forward cannot be negative." };
  const year = yearCash(inputs.lastRevenue, inputs.growthPercent / 100, inputs.marginPercent / 100, inputs.taxPercent / 100, inputs.salesToCapital, losses);
  return {
    ok: true,
    revenue: year.revenue,
    operatingCosts: year.revenue - year.operatingIncome,
    operatingIncome: year.operatingIncome,
    tax: year.tax,
    reinvestment: year.reinvestment,
    fcf: year.fcf,
    lossesAfter: year.nolAfter,
  };
}
