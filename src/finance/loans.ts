import { PMT } from "@formulajs/formulajs";
import { fraction, numberOrThrow } from "./formula";

/** The equal monthly instalment (EMI) on a loan, with a yearly rate in percent. */
export function emi(principal: number, ratePercent: number, years: number): number {
  const months = years * 12;
  if (ratePercent === 0) return principal / months;
  return -numberOrThrow(PMT(fraction(ratePercent) / 12, months, principal));
}

export type AmortizationRow = { month: number; payment: number; interest: number; principalPaid: number; balance: number };

/** Each month's interest, principal repaid and balance left. */
export function amortizationSchedule(principal: number, ratePercent: number, years: number) {
  const payment = emi(principal, ratePercent, years);
  const monthly = fraction(ratePercent) / 12;
  let balance = principal;
  const rows: AmortizationRow[] = [];
  for (let month = 1; month <= years * 12; month++) {
    const interest = balance * monthly;
    const principalPaid = payment - interest;
    balance = month === years * 12 ? 0 : balance - principalPaid;
    rows.push({ month, payment, interest, principalPaid, balance });
  }
  return { emi: payment, rows, totalInterest: rows.reduce((sum, r) => sum + r.interest, 0) };
}
