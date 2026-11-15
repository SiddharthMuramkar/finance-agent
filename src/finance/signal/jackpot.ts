import { annuityBreakEven, annuitySchedule } from "../present-value";

// Signal spec §6.3: the jackpot widget's maths, the 2018 Mega Millions prize.
// Money is in $ millions. Rates are yearly percentages (5 means 5%). Pure: no React, no database.

/** The prize as the winner saw it in October 2018. */
export const JACKPOT = {
  /** The advertised total: the plain sum of the 30 payments, in $ millions. */
  advertisedTotal: 1537,
  /** The cash option, paid that day, in $ millions. */
  cash: 877.8,
  /** The number of yearly payments. The first is paid at once (t = 0). */
  payments: 30,
  /** Each payment is this many percent bigger than the one before. */
  growthPercent: 5,
  /** The calendar year of the first payment. */
  firstYear: 2018,
} as const;

/** One chart column: a payment as paid and its worth today. */
export type JackpotColumn = {
  /** The calendar year of the payment, 2018 to 2047. */
  year: number;
  /** The payment as paid, in $ millions. */
  paid: number;
  /** The payment's worth today at the chosen rate, in $ millions. */
  worthToday: number;
};

/** The jackpot at one interest rate. */
export type JackpotAtRate = {
  ratePercent: number;
  columns: JackpotColumn[];
  /** The 30 payments' worth today added up, in $ millions. */
  sum: number;
  /** `sum − cash`, in $ millions: above zero the payments are worth more, below zero the cash is. */
  d: number;
  /** True when the two are within $5M of each other (`|d| < 5`): "about the same". */
  same: boolean;
  /** Which meter row gets the pill: "same" on both rows, else the row that is worth more. */
  worthMore: "payments" | "cash" | "same";
};

/** How close, in $ millions, the payments and the cash must be to count as "about the same". */
export const SAME_WITHIN = 5;

/** The 30 payments and their worth today at `ratePercent` a year. */
export function jackpotAt(ratePercent: number): JackpotAtRate {
  const { rows, presentValue } = annuitySchedule({
    total: JACKPOT.advertisedTotal,
    payments: JACKPOT.payments,
    growthPercent: JACKPOT.growthPercent,
    ratePercent,
  });
  const columns = rows.map((row) => ({ year: JACKPOT.firstYear + row.year, paid: row.payment, worthToday: row.presentValue }));
  const d = presentValue - JACKPOT.cash;
  const same = Math.abs(d) < SAME_WITHIN;
  const worthMore = same ? "same" : d > 0 ? "payments" : "cash";
  return { ratePercent, columns, sum: presentValue, d, same, worthMore };
}

/** Who set the rate: the learner by hand (slider or preset), or a scripted run after the call. */
export type RateSource = "hand" | "script";

/**
 * The "Found" state. It turns on only when the learner sets a "same" rate by hand: a scripted run that passes
 * through 3.4% does not count. Once on, it stays on for the session.
 */
export function breakEvenFound(wasFound: boolean, at: Pick<JackpotAtRate, "same">, source: RateSource): boolean {
  return wasFound || (source === "hand" && at.same);
}

/**
 * The true break-even rate, in percent a year: the rate at which the 30 payments are worth exactly the cash today.
 * Below it the payments are worth more. Above it the cash is.
 */
export function jackpotBreakEven(): number {
  const { advertisedTotal, payments, growthPercent, cash } = JACKPOT;
  const rate = annuityBreakEven({ total: advertisedTotal, payments, growthPercent }, cash);
  if (rate === null) throw new Error("No rate from 0 to 100% makes the payments worth the cash.");
  return rate;
}
