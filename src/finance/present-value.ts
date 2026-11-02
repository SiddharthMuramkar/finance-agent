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
