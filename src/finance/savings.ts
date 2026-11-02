import { annuityFutureValue, compoundAmount } from "./tvm";
import { fraction } from "./formula";

// Indian savings products. Each returns what was put in, what it grows to and the gain.

type Outcome = { invested: number; maturity: number; gain: number };
const outcome = (invested: number, maturity: number): Outcome => ({ invested, maturity, gain: maturity - invested });

/** A SIP: the same sum each month, invested at the start of the month, growing at a yearly rate. */
export function sipMaturity(monthly: number, ratePercent: number, years: number) {
  const months = years * 12;
  return outcome(monthly * months, annuityFutureValue(monthly, ratePercent, months, 12, "start"));
}

/** PPF: a yearly deposit at the start of each year, interest compounded yearly. */
export function ppfMaturity(yearlyDeposit: number, ratePercent: number, years: number) {
  const maturity = annuityFutureValue(yearlyDeposit, ratePercent, years, 1, "start");
  return { ...outcome(yearlyDeposit * years, maturity), interest: maturity - yearlyDeposit * years };
}

const COMPOUNDING = { yearly: 1, half_yearly: 2, quarterly: 4, monthly: 12 } as const;
export type Compounding = keyof typeof COMPOUNDING;
export const COMPOUNDINGS = Object.keys(COMPOUNDING) as Compounding[];

/** A fixed deposit: one sum, interest compounded at the chosen frequency. */
export function fixedDeposit(principal: number, ratePercent: number, years: number, compounding: Compounding) {
  return outcome(principal, compoundAmount(principal, ratePercent, years, COMPOUNDING[compounding]));
}

/** A recurring deposit: a sum each month, with interest compounded quarterly. */
export function recurringDeposit(monthly: number, ratePercent: number, months: number) {
  const quarterly = fraction(ratePercent) / 4;
  // Each instalment earns interest for the quarters left, (months - m + 1) / 3 of them.
  let maturity = 0;
  for (let m = 1; m <= months; m++) maturity += monthly * (1 + quarterly) ** ((months - m + 1) / 3);
  return outcome(monthly * months, maturity);
}
