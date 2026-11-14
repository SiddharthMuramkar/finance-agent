import { RATE } from "@formulajs/formulajs";
import { numberOrThrow, fraction, percent } from "./formula";
import { annuityPresentValue } from "./tvm";

// Bonds and equity valuation. Rates are yearly percentages.

/** The price of a bond: the coupons and the face value, discounted at the yield. */
export function bondPrice(face: number, couponPercent: number, yieldPercent: number, years: number, perYear: number): number {
  const periods = years * perYear;
  const coupon = (face * fraction(couponPercent)) / perYear;
  const y = fraction(yieldPercent) / perYear;
  return annuityPresentValue(coupon, yieldPercent, periods, perYear, "end") + face / (1 + y) ** periods;
}

/** Yearly coupon over price, in percent. */
export function currentYield(yearlyCoupon: number, price: number): number {
  return percent(yearlyCoupon / price);
}

/** The yearly yield (in percent) at which the bond's price equals `price`. */
export function yieldToMaturity(face: number, couponPercent: number, price: number, years: number, perYear: number): number {
  const coupon = (face * fraction(couponPercent)) / perYear;
  return percent(numberOrThrow(RATE(years * perYear, coupon, -price, face))) * perYear;
}

/** Macaulay duration (years) and modified duration, from the present value of each payment. */
export function bondDuration(face: number, couponPercent: number, yieldPercent: number, years: number, perYear: number) {
  const periods = years * perYear;
  const coupon = (face * fraction(couponPercent)) / perYear;
  const y = fraction(yieldPercent) / perYear;
  let weighted = 0;
  let total = 0;
  for (let t = 1; t <= periods; t++) {
    const pv = (coupon + (t === periods ? face : 0)) / (1 + y) ** t;
    weighted += t * pv;
    total += pv;
  }
  const macaulay = weighted / total / perYear;
  return { macaulay, modified: macaulay / (1 + y) };
}

/** Gordon growth: next year's dividend over (required return - growth). `lastDividend` is this year's. */
export function gordonGrowth(lastDividend: number, growthPercent: number, requiredPercent: number): number {
  if (growthPercent >= requiredPercent) throw new Error("The growth rate must be below the required return, or the value is infinite.");
  return (lastDividend * (1 + fraction(growthPercent))) / fraction(requiredPercent - growthPercent);
}

/** A high-growth stage for some years, then stable growth forever. */
export function twoStageDdm(lastDividend: number, highGrowthPercent: number, highGrowthYears: number, stableGrowthPercent: number, requiredPercent: number): number {
  if (stableGrowthPercent >= requiredPercent) throw new Error("The stable growth rate must be below the required return.");
  const g = fraction(highGrowthPercent);
  const r = fraction(requiredPercent);
  let dividend = lastDividend;
  let value = 0;
  for (let year = 1; year <= highGrowthYears; year++) {
    dividend *= 1 + g;
    value += dividend / (1 + r) ** year;
  }
  const terminal = (dividend * (1 + fraction(stableGrowthPercent))) / (r - fraction(stableGrowthPercent));
  return value + terminal / (1 + r) ** highGrowthYears;
}

export function dividendYield(dividend: number, price: number): number {
  return percent(dividend / price);
}

export type DcfInputs = {
  /** Free cash flow in each coming year, the first a year away. */
  cashFlows: number[];
  ratePercent: number;
  terminalGrowthPercent: number;
  netDebt?: number;
  shares?: number;
};

/** Discounts the cash flows and a terminal value (growing perpetuity after the last year). */
export function dcfValuation({ cashFlows, ratePercent, terminalGrowthPercent, netDebt = 0, shares }: DcfInputs) {
  if (terminalGrowthPercent >= ratePercent) throw new Error("The terminal growth rate must be below the discount rate.");
  const r = fraction(ratePercent);
  const explicit = cashFlows.reduce((sum, cf, i) => sum + cf / (1 + r) ** (i + 1), 0);
  const last = cashFlows[cashFlows.length - 1];
  const terminal = (last * (1 + fraction(terminalGrowthPercent))) / (r - fraction(terminalGrowthPercent));
  const terminalPresentValue = terminal / (1 + r) ** cashFlows.length;
  const enterpriseValue = explicit + terminalPresentValue;
  const equityValue = enterpriseValue - netDebt;
  return { enterpriseValue, equityValue, terminalPresentValue, perShare: shares ? equityValue / shares : undefined };
}

/** Compound annual growth rate, in percent. */
export function cagr(start: number, end: number, years: number): number {
  return percent((end / start) ** (1 / years) - 1);
}
