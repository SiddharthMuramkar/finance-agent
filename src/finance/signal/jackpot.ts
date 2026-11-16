import { annuityBreakEven, annuitySchedule } from "../present-value";

// Signal spec §6.3: the jackpot widget's maths, on the Kerala Thiruvonam Bumper of 9 October 2024 (Case Data checked
// against The Hindu and Mathrubhumi, 9 Oct 2024; see src/site/examples.ts for the links). Kerala paid its ₹25 crore first
// prize at once; the 30 payments are the same ₹25 crore paid the American way, a what-if to compare it with.
// Money is in ₹ crore. Rates are yearly percentages (5 means 5%). Pure: no React, no database.

/** The prize as the winner saw it on the day of the draw. */
export const JACKPOT = {
  /** The Moment's As-of date: the day of the draw. */
  asOf: "2024-10-09",
  /** The first prize, and the plain sum of the 30 payments, in ₹ crore. */
  advertisedTotal: 25,
  /** The prize as Kerala pays it, at once, in ₹ crore (before the agent's commission and tax). */
  cash: 25,
  /** The number of yearly payments. The first is paid at once (t = 0). */
  payments: 30,
  /** Each payment is this many percent bigger than the one before. */
  growthPercent: 5,
  /** The calendar year of the first payment. */
  firstYear: 2024,
} as const;

/** One chart column: a payment as paid and its worth today. */
export type JackpotColumn = {
  /** The calendar year of the payment, 2024 to 2053. */
  year: number;
  /** The payment as paid, in ₹ crore. */
  paid: number;
  /** The payment's worth today at the chosen rate, in ₹ crore. */
  worthToday: number;
};

/** The jackpot at one interest rate. */
export type JackpotAtRate = {
  ratePercent: number;
  columns: JackpotColumn[];
  /** The 30 payments' worth today added up, in ₹ crore. */
  sum: number;
  /** `sum − cash`, in ₹ crore: above zero the payments are worth more, below zero the cash is. */
  d: number;
  /** True when the two are within ₹10 lakh of each other (`|d| < 0.1`): "about the same". */
  same: boolean;
  /** Which meter row gets the pill: "same" on both rows, else the row that is worth more. */
  worthMore: "payments" | "cash" | "same";
};

/** How close, in ₹ crore, the payments and the cash must be to count as "about the same": ₹10 lakh. */
export const SAME_WITHIN = 0.1;

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
 * The "Found" state. It turns on only when the learner sets a "same" rate by hand: a scripted run that starts at the
 * "same" 0% does not count. Once on, it stays on for the session.
 */
export function breakEvenFound(wasFound: boolean, at: Pick<JackpotAtRate, "same">, source: RateSource): boolean {
  return wasFound || (source === "hand" && at.same);
}

/**
 * The true break-even rate, in percent a year: the rate at which the 30 payments are worth exactly the cash today.
 * With the same ₹25 crore on both sides it is 0%: at any rate above it the cash is worth more.
 */
export function jackpotBreakEven(): number {
  const { advertisedTotal, payments, growthPercent, cash } = JACKPOT;
  const rate = annuityBreakEven({ total: advertisedTotal, payments, growthPercent }, cash);
  if (rate === null && Math.abs(jackpotAt(0).d) < 1e-9) return 0;
  if (rate === null) throw new Error("No rate from 0 to 100% makes the payments worth the cash.");
  return rate;
}
