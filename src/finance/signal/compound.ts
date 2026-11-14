import { fraction } from "../formula";
import { formatInr } from "../indian-format";
import { compoundAmount } from "../tvm";

// The Signal compounding widget (spec §6.4): ₹1,000 at 10% a year, left alone for up to 30 years.

const PRINCIPAL = 1000;
const RATE_PERCENT = 10;
const MAX_YEARS = 30;

/** TOT(t): the balance after `t` years. */
const total = (t: number) => compoundAmount(PRINCIPAL, RATE_PERCENT, t, 1);

/**
 * One year of the model. `growth` is everything above the ₹1,000; `added` is what this year alone
 * adds, 10% of the balance it starts with. Split mode cuts `growth` in two: `simple` is earned on
 * the ₹1,000 (₹100 a year), `onGrowth` is earned on growth from earlier years.
 */
export type CompoundYear = {
  year: number;
  balance: number;
  growth: number;
  added: number;
  simple: number;
  onGrowth: number;
};

/** The slider runs from year 1 to year 30 in whole years; anything else is a caller bug. */
function assertYear(year: number) {
  if (!Number.isInteger(year) || year < 1 || year > MAX_YEARS) {
    throw new RangeError(`Years must be a whole number from 1 to ${MAX_YEARS}, not ${year}.`);
  }
}

export function compoundYear(year: number): CompoundYear {
  assertYear(year);
  const balance = total(year);
  const growth = balance - PRINCIPAL;
  const simple = Math.min(PRINCIPAL * fraction(RATE_PERCENT) * year, growth);
  return {
    year,
    balance,
    growth,
    added: total(year - 1) * fraction(RATE_PERCENT),
    simple,
    onGrowth: growth - simple,
  };
}

export type DoublingMark = { year: number; label: string };

/**
 * The chart: one column a year, a height scale of the year-30 balance, and a mark above the first
 * year the balance reaches 2×, 4×, 8×… the ₹1,000.
 */
export function compoundChart(): { columns: CompoundYear[]; max: number; doublings: DoublingMark[] } {
  const columns = Array.from({ length: MAX_YEARS }, (_, i) => compoundYear(i + 1));
  const doublings: DoublingMark[] = [];
  for (let times = 2; ; times *= 2) {
    const first = columns.find((c) => c.balance >= PRINCIPAL * times);
    if (!first) break;
    doublings.push({ year: first.year, label: `${times}×` });
  }
  return { columns, max: total(MAX_YEARS), doublings };
}

/** Spec §6.1 `inr`: rupees rounded to the whole rupee, Indian digit grouping. */
const inr = (amount: number) => formatInr(Math.round(amount));

/** One part of the segmented bar. `label` is its entry in the foot key. */
export type ReadingSegment = {
  part: "putIn" | "growth" | "simple" | "onGrowth";
  label: string;
  value: number;
  text: string;
};

export type CompoundReading = {
  /** "3 years", or "1 year" when 1: the slider output and the `n` in "after n years". */
  yearsText: string;
  balance: string;
  growth: string;
  added: string;
  segments: ReadingSegment[];
  /** Only in split mode: the extra sentence "Of that growth, ₹A was earned on your ₹1,000 and ₹B on earlier growth." */
  split?: { simple: string; onGrowth: string };
};

const segment = (part: ReadingSegment["part"], label: string, value: number): ReadingSegment => ({
  part,
  label,
  value,
  text: inr(value),
});

/** What the reading shows after `years` years: the big number, the segmented bar and the sentence. */
export function compoundReading(years: number, split: boolean): CompoundReading {
  const year = compoundYear(years);
  const putIn = segment("putIn", "What you put in", PRINCIPAL);
  const shared = {
    yearsText: years === 1 ? "1 year" : `${years} years`,
    balance: inr(year.balance),
    growth: inr(year.growth),
    added: inr(year.added),
  };
  if (!split) return { ...shared, segments: [putIn, segment("growth", "Growth", year.growth)] };
  return {
    ...shared,
    segments: [
      putIn,
      segment("simple", "Earned on your ₹1,000", year.simple),
      segment("onGrowth", "Earned on earlier growth", year.onGrowth),
    ],
    split: { simple: inr(year.simple), onGrowth: inr(year.onGrowth) },
  };
}
