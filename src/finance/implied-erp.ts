import { z } from "zod";

// The implied equity risk premium (spec 2026-11-12 C4, Spine Topic 13): instead of a required return giving a value,
// the market's price gives the required return. Damodaran's two-stage version: the cash paid to holders of the index
// (dividends and buybacks) grows at one rate for five years and at the riskfree rate after; the return that makes those
// cash flows worth the index level, less the riskfree rate, is the premium the market prices in.
//
// Not a company valuation, so it is not a B1 `valuation:` block: a Case holds it as `impliedPremium:`. Rates are percents
// in the block (the house convention) and fractions in the solver. Imports only packages, like valuation-case.ts.

/** The years of the first stage. */
export const IMPLIED_PREMIUM_YEARS = 5;

export const impliedPremiumBlock = z
  .object({
    /** The index and the date of its close. */
    index: z.object({ name: z.string().trim().min(1), level: z.number().positive(), date: z.iso.date() }).strict(),
    /** The ten-year government bond yield: the riskfree rate, and growth after year 5. */
    riskFreePercent: z.number().min(0),
    /** The cash paid to holders as a share of the index level: dividends and buybacks (an average over years, as the source chose). */
    cashYieldPercent: z.number().positive(),
    /** Growth of that cash in years 1 to 5 (the analysts' consensus). */
    growthPercent: z.number(),
    /** Growth after year 5; the riskfree rate in Damodaran's version. */
    growthAfterPercent: z.number(),
    published: z.object({ requiredReturnPercent: z.number(), premiumPercent: z.number(), note: z.string().trim().min(1).optional() }).strict(),
    sources: z.array(z.object({ title: z.string().trim().min(1), url: z.url() }).strict()).min(1),
  })
  .strict()
  .refine((b) => b.growthAfterPercent < b.riskFreePercent + 100, { message: "growthAfterPercent is out of range", path: ["growthAfterPercent"] });

export type ImpliedPremiumBlock = z.output<typeof impliedPremiumBlock>;

export type ImpliedPremium = {
  /** The cash flows of years 1 to 5 and year 6 (the first of the second stage), in index points. */
  cashFlows: number[];
  /** The return that prices the index at its level, as a fraction. */
  requiredReturn: number;
  /** The required return less the riskfree rate, as a fraction. */
  premium: number;
};

/** The index value the two-stage cash flows give at a required return r (a fraction). */
export function indexValueAt(block: ImpliedPremiumBlock, r: number): number {
  const g = block.growthPercent / 100;
  const after = block.growthAfterPercent / 100;
  let cash = (block.index.level * block.cashYieldPercent) / 100;
  let value = 0;
  for (let t = 1; t <= IMPLIED_PREMIUM_YEARS; t++) {
    cash *= 1 + g;
    value += cash / (1 + r) ** t;
  }
  return value + (cash * (1 + after)) / (r - after) / (1 + r) ** IMPLIED_PREMIUM_YEARS;
}

/** Solves for the required return that prices the index at its level (bisection), and the premium over the riskfree rate. */
export function impliedPremium(block: ImpliedPremiumBlock): ImpliedPremium {
  const after = block.growthAfterPercent / 100;
  // The value falls as r rises above growth after year 5, so the root is bracketed between just above it and 100%.
  let low = after + 1e-9;
  let high = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (indexValueAt(block, mid) > block.index.level) low = mid;
    else high = mid;
  }
  const requiredReturn = (low + high) / 2;
  const g = block.growthPercent / 100;
  const base = (block.index.level * block.cashYieldPercent) / 100;
  const cashFlows = Array.from({ length: IMPLIED_PREMIUM_YEARS }, (_, i) => base * (1 + g) ** (i + 1));
  cashFlows.push(cashFlows[IMPLIED_PREMIUM_YEARS - 1] * (1 + after));
  return { cashFlows, requiredReturn, premium: requiredReturn - block.riskFreePercent / 100 };
}
