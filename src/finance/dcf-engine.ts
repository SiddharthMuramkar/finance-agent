// The valuation engine (spec 2026-11-12, B1): turns a Valuation story into a value a share. It is the one source
// of numbers for every Workbench Widget and every computed judgement question, so a Widget, a question and the
// Tutor can never disagree about what a story is worth.
//
// Rates here are fractions (0.05 means 5%), unlike the rest of src/finance: the paths are worked on year by year
// and fractions keep that arithmetic plain. `valuation-case.ts` reads the percents a Topic file holds and turns
// them into these inputs.
//
// This module imports nothing (no "@/" paths), so `scripts/check-course.mjs` can run it with Node's type stripping.

/** The years forecast one by one. Every yearly path (growth, margin, cost of capital) has this many entries. */
export const FORECAST_YEARS = 10;

export type DcfInputs = {
  /** Revenue in the base year, the year before year 1. */
  baseRevenue: number;
  /** How much revenue grows in each of years 1 to 10. */
  growth: readonly number[];
  /** The operating margin in each of years 1 to 10. */
  margin: readonly number[];
  /** The operating margin after year 10. */
  marginAfter: number;
  /** The tax rate after year 10, and in every year 1 to 10 that `taxRateByYear` does not set. */
  taxRate: number;
  /** The tax rate in each of years 1 to 10, when it changes by year (Damodaran's Uber ramps 31% to 40%). */
  taxRateByYear?: readonly number[];
  /** Losses carried forward from before year 1, which shield later profits from tax. */
  lossesCarried: number;
  /** Revenue added for each unit of new capital invested. */
  salesToCapital: number;
  /** Sales to capital in each of years 1 to 10, when it changes by year (Tesla: 3 in years 1 to 5, then 2). */
  salesToCapitalByYear?: readonly number[];
  /** The cost of capital in each of years 1 to 10. */
  costOfCapital: readonly number[];
  /** Growth after year 10, for ever. Must be below the year-10 cost of capital. */
  growthAfter: number;
  /** The return new capital earns after year 10; it sets how much of year 11's profit is reinvested. */
  returnOnCapitalAfter: number;
  cash: number;
  debt: number;
  /** The value of employee options, which belongs to their holders, not to shareholders. */
  options: number;
  /** Shares, counted in the same unit as the money (millions of shares for a Case in millions). */
  shares: number;
  /**
   * A chance the business fails before its future arrives, and what is recovered if it does: a fixed amount
   * (`recovered`, 0 if left out), or a share of the going-concern value (`recoveredShare`, Tesla's and Zomato's 50%),
   * which moves with the story when a lever moves it. When both are given the share wins.
   */
  failure?: { chance: number; recovered?: number; recoveredShare?: number };
};

export type DcfYear = {
  year: number;
  revenue: number;
  margin: number;
  operatingIncome: number;
  tax: number;
  /** Losses still carried forward at the end of the year. */
  nolAfter: number;
  reinvestment: number;
  fcf: number;
  /** What one unit of this year's cash is worth today: 1 over the product of (1 + each year's cost of capital) so far. */
  discountFactor: number;
  /** This year's free cash flow in today's money. */
  pv: number;
};

export type DcfValue = {
  years: DcfYear[];
  /** Free cash flow in year 11, the first year of "for ever". */
  fcf11: number;
  /** Everything after year 10, valued as of the end of year 10. */
  terminalValue: number;
  /** The terminal value in today's money. */
  pvTerminal: number;
  /** Years 1 to 10 in today's money. */
  sumPv: number;
  /** The business if it survives: sumPv plus pvTerminal. */
  goingConcern: number;
  /** What failure recovers: the fixed amount, or the share of the going concern; 0 without a chance of failure. */
  recovered: number;
  /** The going concern weighted with what is recovered in failure; the going concern when there is no chance of failure. */
  businessValue: number;
  /** businessValue plus cash, less debt. */
  equityBeforeOptions: number;
  /** What is left for shareholders after the option holders. */
  equity: number;
  /** The true number, negative when lenders and option holders take more than the business is worth. A Widget shows $0 then. */
  valuePerShare: number;
  /**
   * The share of business value that comes from the years after year 10. Without a chance of failure it is
   * pvTerminal / businessValue; with one, the terminal value is weighted by the chance of surviving as well, so
   * failure with nothing recovered leaves the share unchanged. Above 1 when years 1 to 10 add up to a loss.
   */
  terminalShare: number;
};

/** Like the Finance Calculations, a story that cannot be valued comes back as a plain sentence, not a throw. */
export type DcfResult = ({ ok: true } & DcfValue) | { ok: false; error: string };

/** Why these inputs cannot be valued, or null when they can. */
function inputProblem(inputs: DcfInputs): string | null {
  const paths: Record<string, readonly number[]> = { growth: inputs.growth, margin: inputs.margin, "cost of capital": inputs.costOfCapital };
  if (inputs.taxRateByYear) paths["tax rate"] = inputs.taxRateByYear;
  if (inputs.salesToCapitalByYear) paths["sales to capital"] = inputs.salesToCapitalByYear;
  for (const [name, path] of Object.entries(paths)) {
    if (path.length !== FORECAST_YEARS) return `The ${name} path needs ${FORECAST_YEARS} years; it has ${path.length}.`;
  }
  const numbers = [
    inputs.baseRevenue, ...inputs.growth, ...inputs.margin, inputs.marginAfter, inputs.taxRate, inputs.lossesCarried,
    inputs.salesToCapital, ...inputs.costOfCapital, inputs.growthAfter, inputs.returnOnCapitalAfter, inputs.cash,
    inputs.debt, inputs.options, inputs.shares, inputs.failure?.chance ?? 0, inputs.failure?.recovered ?? 0,
    inputs.failure?.recoveredShare ?? 0, ...(inputs.taxRateByYear ?? []), ...(inputs.salesToCapitalByYear ?? []),
  ];
  if (!numbers.every(Number.isFinite)) return "Every input must be a number.";
  if (inputs.growth.some((g) => g <= -1)) return "Revenue cannot shrink by 100% or more in a year.";
  if (inputs.costOfCapital.some((c) => c <= -1)) return "The cost of capital must be above -100%.";
  if (!(inputs.salesToCapital > 0) || inputs.salesToCapitalByYear?.some((v) => !(v > 0))) return "Sales to capital must be above zero.";
  if (inputs.taxRateByYear?.some((t) => t < 0 || t > 1)) return "Each year's tax rate must be between 0% and 100%.";
  const share = inputs.failure?.recoveredShare;
  if (share !== undefined && (share < 0 || share > 1)) return "The share recovered in failure must be between 0% and 100%.";
  if (!(inputs.returnOnCapitalAfter > 0)) return "The return on capital after year 10 must be above zero.";
  if (!(inputs.shares > 0)) return "The share count must be above zero.";
  if (inputs.lossesCarried < 0) return "Losses carried forward cannot be negative.";
  const chance = inputs.failure?.chance ?? 0;
  if (chance < 0 || chance > 1) return "The chance of failure must be between 0% and 100%.";
  if (inputs.growthAfter >= inputs.costOfCapital[FORECAST_YEARS - 1]) {
    return "Growth after year 10 must be below the year-10 cost of capital, or the value is infinite.";
  }
  return null;
}

/** One year's cash by rules 1 to 5: what a year of the forecast turns into, before it is discounted. */
export type YearCash = {
  revenue: number;
  operatingIncome: number;
  tax: number;
  /** Losses still carried forward at the end of the year. */
  nolAfter: number;
  reinvestment: number;
  fcf: number;
};

/**
 * Rules 1 to 5 for one year, from last year's revenue and the losses carried into the year. valueStory runs it for each of
 * the ten years, and the Cash waterfall Widget (spec B4) runs it once, so both say the same about a year's cash.
 */
export function yearCash(lastRevenue: number, growth: number, margin: number, taxRate: number, salesToCapital: number, lossesCarried: number): YearCash {
  // Rules 1 and 2: revenue grows at the year's rate; operating income is revenue times the year's margin.
  const revenue = lastRevenue * (1 + growth);
  const operatingIncome = revenue * margin;
  // Rule 3: a loss adds to the losses carried forward and pays no tax; a profit uses them up first.
  let losses = lossesCarried;
  let tax = 0;
  if (operatingIncome < 0) losses -= operatingIncome;
  else {
    const used = Math.min(losses, operatingIncome);
    losses -= used;
    tax = (operatingIncome - used) * taxRate;
  }
  // Rules 4 and 5: reinvestment pays for the rise in revenue; free cash flow is what is left.
  const reinvestment = (revenue - lastRevenue) / salesToCapital;
  return { revenue, operatingIncome, tax, nolAfter: losses, reinvestment, fcf: operatingIncome - tax - reinvestment };
}

/** Values a Valuation story by the rules of spec B1, in their order. */
export function valueStory(inputs: DcfInputs): DcfResult {
  const problem = inputProblem(inputs);
  if (problem) return { ok: false, error: problem };

  const years: DcfYear[] = [];
  let lastRevenue = inputs.baseRevenue;
  let losses = inputs.lossesCarried;
  let growthOfOne = 1;
  for (let i = 0; i < FORECAST_YEARS; i++) {
    // Rules 1 to 5.
    const taxRate = inputs.taxRateByYear?.[i] ?? inputs.taxRate;
    const salesToCapital = inputs.salesToCapitalByYear?.[i] ?? inputs.salesToCapital;
    const cash = yearCash(lastRevenue, inputs.growth[i], inputs.margin[i], taxRate, salesToCapital, losses);
    // Rule 6: each year is discounted by every year's cost of capital up to it, not by one flat rate.
    growthOfOne *= 1 + inputs.costOfCapital[i];
    const discountFactor = 1 / growthOfOne;
    years.push({ year: i + 1, margin: inputs.margin[i], ...cash, discountFactor, pv: cash.fcf * discountFactor });
    lastRevenue = cash.revenue;
    losses = cash.nolAfter;
  }

  // Rule 7: year 11 pays full tax (losses no longer shield it) and reinvests growth / return on capital of its profit.
  const operatingIncome11 = lastRevenue * (1 + inputs.growthAfter) * inputs.marginAfter;
  const afterTax11 = operatingIncome11 > 0 ? operatingIncome11 * (1 - inputs.taxRate) : operatingIncome11;
  const fcf11 = afterTax11 * (1 - inputs.growthAfter / inputs.returnOnCapitalAfter);
  const terminalValue = fcf11 / (inputs.costOfCapital[FORECAST_YEARS - 1] - inputs.growthAfter);
  const pvTerminal = terminalValue * years[FORECAST_YEARS - 1].discountFactor;

  // Rule 8: the business is the discounted cash flows plus the discounted terminal value, weighted with failure.
  // What failure recovers is a fixed amount, or a share of the going concern (so it moves when the story moves).
  const sumPv = years.reduce((sum, y) => sum + y.pv, 0);
  const goingConcern = sumPv + pvTerminal;
  const chance = inputs.failure?.chance ?? 0;
  const survives = 1 - chance;
  const recoveredShare = inputs.failure?.recoveredShare;
  const recovered = recoveredShare !== undefined ? recoveredShare * goingConcern : (inputs.failure?.recovered ?? 0);
  const businessValue = survives * goingConcern + chance * recovered;

  // Rule 9: shareholders get the business plus cash, less debt and options, spread over the shares.
  const equityBeforeOptions = businessValue + inputs.cash - inputs.debt;
  const equity = equityBeforeOptions - inputs.options;
  return {
    ok: true,
    years,
    fcf11,
    terminalValue,
    pvTerminal,
    sumPv,
    goingConcern,
    recovered: chance > 0 ? recovered : 0,
    businessValue,
    equityBeforeOptions,
    equity,
    valuePerShare: equity / inputs.shares,
    terminalShare: (survives * pvTerminal) / businessValue,
  };
}
