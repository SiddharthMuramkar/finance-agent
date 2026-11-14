import { EFFECT, FV, IRR, NOMINAL, NPV, PV } from "@formulajs/formulajs";
import { fraction, numberOrThrow, percent } from "./formula";

// Time value of money. Rates are yearly percentages (5 means 5%); money in is positive.
// Where formula.js has the function it does the arithmetic.

export type Timing = "end" | "start";
const timing = (t: Timing) => (t === "start" ? 1 : 0);

/** What a lump sum grows to. `perYear` is the compounding frequency, or "continuous". */
export function compoundAmount(amount: number, ratePercent: number, years: number, perYear: number | "continuous"): number {
  if (perYear === "continuous") return amount * Math.exp(fraction(ratePercent) * years);
  return numberOrThrow(FV(fraction(ratePercent) / perYear, perYear * years, 0, -amount));
}

/** Future value of equal payments, `perYear` a year for `periods` payments in total. */
export function annuityFutureValue(payment: number, ratePercent: number, periods: number, perYear: number, when: Timing): number {
  if (ratePercent === 0) return payment * periods;
  return numberOrThrow(FV(fraction(ratePercent) / perYear, periods, -payment, 0, timing(when)));
}

/** Present value of equal payments, `perYear` a year for `periods` payments in total. */
export function annuityPresentValue(payment: number, ratePercent: number, periods: number, perYear: number, when: Timing): number {
  if (ratePercent === 0) return payment * periods;
  return numberOrThrow(PV(fraction(ratePercent) / perYear, periods, -payment, 0, timing(when)));
}

/** A payment forever, optionally growing; the first payment is one year away. */
export function perpetuityValue(payment: number, ratePercent: number, growthPercent = 0): number {
  if (growthPercent >= ratePercent) throw new Error("The growth rate must be below the discount rate, or the value is infinite.");
  return payment / fraction(ratePercent - growthPercent);
}

export function effectiveAnnualRate(nominalPercent: number, perYear: number): number {
  return percent(numberOrThrow(EFFECT(fraction(nominalPercent), perYear)));
}

export function nominalRate(effectivePercent: number, perYear: number): number {
  return percent(numberOrThrow(NOMINAL(fraction(effectivePercent), perYear)));
}

/** The Fisher relation: the return after inflation. */
export function realRate(nominalPercent: number, inflationPercent: number): number {
  return percent((1 + fraction(nominalPercent)) / (1 + fraction(inflationPercent)) - 1);
}

/** What today's amount costs after years of yearly inflation. */
export function inflationAdjusted(amount: number, inflationPercent: number, years: number): number {
  return amount * (1 + fraction(inflationPercent)) ** years;
}

/** Years to double, by the rule of 72. */
export function ruleOf72(ratePercent: number): number {
  return 72 / ratePercent;
}

/** Net present value; the first cash flow is today (unlike a spreadsheet's NPV, which starts one period out). */
export function netPresentValue(ratePercent: number, cashFlows: number[]): number {
  const [today, ...later] = cashFlows;
  if (later.length === 0) return today;
  return today + numberOrThrow(NPV(fraction(ratePercent), ...later));
}

/** The yearly rate, in percent, that makes the net present value zero. */
export function internalRateOfReturn(cashFlows: number[]): number {
  if (!cashFlows.some((c) => c < 0) || !cashFlows.some((c) => c > 0)) throw new Error("An internal rate of return needs at least one outflow and one inflow.");
  return percent(numberOrThrow(IRR(cashFlows)));
}
