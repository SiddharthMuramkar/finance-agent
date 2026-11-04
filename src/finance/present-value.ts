import { PV } from "@formulajs/formulajs";

// Finance Calculations: pure, tested formulas shared by widgets and tools.
// Rates are yearly percentages (5 means 5%).

/** Today's value of `amount` received in `years` years, discounted at `ratePercent` a year. */
export function presentValue(amount: number, ratePercent: number, years: number): number {
  const value = PV(ratePercent / 100, years, 0, -amount);
  if (value instanceof Error) throw value;
  return value;
}

export type AnnuityInputs = {
  /** The advertised total: the plain sum of every payment. */
  total: number;
  /** Number of yearly payments; the first is paid now. */
  payments: number;
  /** How much each payment grows on the one before, in percent. */
  growthPercent: number;
  /** The discount rate, in percent a year. */
  ratePercent: number;
};

export type AnnuityRow = { year: number; payment: number; presentValue: number };

/**
 * Splits an advertised total into yearly payments that grow at a fixed rate
 * (first payment now), and discounts each one to today.
 */
/** The payments as the annuity chart, its Widget tool and the Tutor's readouts take them: a whole number from 1 to 60. */
export const annuityPaymentCount = (payments: number) => Math.max(1, Math.min(60, Math.round(payments)));

export function annuitySchedule({ total, payments, growthPercent, ratePercent }: AnnuityInputs) {
  const g = growthPercent / 100;
  const weights = Array.from({ length: payments }, (_, year) => (1 + g) ** year);
  const first = total / weights.reduce((a, b) => a + b, 0);
  const rows: AnnuityRow[] = weights.map((w, year) => {
    const payment = first * w;
    return { year, payment, presentValue: presentValue(payment, ratePercent, year) };
  });
  return { rows, presentValue: rows.reduce((sum, r) => sum + r.presentValue, 0) };
}

/** Highest rate, in percent, the break-even search tries: far past any rate a Widget offers. */
const MAX_BREAK_EVEN_RATE = 100;

/**
 * The discount rate, in percent a year, at which the annuity is worth exactly `amount` today (a cash option, say).
 * Its present value falls as the rate rises, so the rate is found by halving the range. Null when no rate from 0 to
 * 100% gives it: the amount is more than the payments add up to, or too small (or not positive).
 */
export function annuityBreakEven(annuity: Omit<AnnuityInputs, "ratePercent">, amount: number): number | null {
  const worth = (ratePercent: number) => annuitySchedule({ ...annuity, ratePercent }).presentValue;
  let low = 0;
  let high = MAX_BREAK_EVEN_RATE;
  if (!(amount > 0) || amount > worth(low) || amount < worth(high)) return null;
  for (let i = 0; i < 60; i++) {
    const middle = (low + high) / 2;
    if (worth(middle) > amount) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
