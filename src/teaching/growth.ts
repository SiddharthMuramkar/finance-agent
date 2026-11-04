/**
 * The quantities a growth question is about (Growth, compounding and logs): what an amount grows to, the years the rule
 * of 72 gives to double, and the steady yearly rate between two levels (CAGR). Compound growth over whole years is
 * exact here; a root (CAGR) is worked in floating point, then held to a few more places than any ask states. The
 * tested calculators in src/finance (future_value, rule_of_72, cagr) give the same numbers, and a test proves it.
 */
import { add, divide, exactFrom, multiply, shift, subtract, type Exact } from "./answers.ts";
import { CannotCompute, type Values } from "./quantities.ts";

const ONE: Exact = { scaled: 1n, scale: 0 };
const HUNDRED: Exact = { scaled: 100n, scale: 0 };
/** Extra places a rounded growth answer is worked to, beyond the decimals its ask states. */
const EXTRA = 6;

const need = (v: Values, ...names: string[]) => {
  for (const n of names) if (!v[n]) throw new CannotCompute(`needs ${names.join(", ")}`);
};

/** Whole years as a count; growth questions compound once a year. */
function wholeYears(years: Exact): number {
  const n = Number(years.scaled) / 10 ** years.scale;
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new CannotCompute("years must be a whole number from 1 to 60");
  return n;
}

/** 1 + rate ÷ 100: the yearly growth factor, 1.1 for 10%. */
const factorOf = (rate: Exact) => add(ONE, shift(rate, -2));

/** What `amount` grows to at `rate`% a year for whole `years`, compounded yearly. Exact. */
export function compoundValue(v: Values): Exact {
  need(v, "amount", "rate", "years");
  const factor = factorOf(v.rate);
  let total = v.amount;
  for (let i = 0; i < wholeYears(v.years); i++) total = multiply(total, factor);
  return total;
}

/** The simple-growth slip: the yearly gain on the starting amount only, `years` times. Exact. */
export function simpleGrowthValue(v: Values): Exact {
  need(v, "amount", "rate", "years");
  return multiply(v.amount, add(ONE, shift(multiply(v.rate, v.years), -2)));
}

/** The rule of 72: about 72 ÷ rate years to double, worked to `decimals` + 6 places. */
export function ruleOf72Years(v: Values, decimals: number): Exact {
  need(v, "rate");
  const years = divide({ scaled: 72n, scale: 0 }, v.rate, decimals + EXTRA);
  if (!years) throw new CannotCompute("a rate of 0% never doubles");
  return years;
}

/** The simple-growth doubling slip: 100 ÷ rate years, as if each year's gain were on the start only. */
export function simpleDoublingYears(v: Values, decimals: number): Exact {
  need(v, "rate");
  const years = divide(HUNDRED, v.rate, decimals + EXTRA);
  if (!years) throw new CannotCompute("a rate of 0% never doubles");
  return years;
}

/** The compound annual growth rate from `start` to `end` over `years`, in percent, worked to `decimals` + 6 places. */
export function cagrPercent(v: Values, decimals: number): Exact {
  need(v, "start", "end", "years");
  const start = Number(v.start.scaled) / 10 ** v.start.scale;
  const end = Number(v.end.scaled) / 10 ** v.end.scale;
  const years = Number(v.years.scaled) / 10 ** v.years.scale;
  if (start <= 0 || end <= 0 || years <= 0) throw new CannotCompute("start, end and years must be above 0");
  return exactFrom((((end / start) ** (1 / years) - 1) * 100).toFixed(decimals + EXTRA));
}

/** The averaged-gain slip: the total gain as a percent of the start, divided by the years. */
export function averagedGainPercent(v: Values, decimals: number): Exact {
  need(v, "start", "end", "years");
  const gain = divide(multiply(subtract(v.end, v.start), HUNDRED), v.start, decimals + EXTRA);
  const perYear = gain && divide(gain, v.years, decimals + EXTRA);
  if (!perYear) throw new CannotCompute("start and years must be above 0");
  return perYear;
}

/**
 * True when `x` lies within 0.001 of a rounding boundary at `decimals` places (8.4995 to 8.5005 at 0 places), so a
 * Learner's own working could fairly round either way. Template draws with such an answer are dropped.
 */
export function nearRoundingBoundary(x: Exact, decimals: number): boolean {
  const value = Math.abs(Number(x.scaled) / 10 ** x.scale) * 10 ** decimals;
  const fraction = value - Math.floor(value);
  return Math.abs(fraction - 0.5) * 10 ** -decimals < 0.001;
}
