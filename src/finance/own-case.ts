import { FORECAST_YEARS, valueStory, type DcfValue } from "./dcf-engine.ts";
import { marginPath } from "./dcf-paths.ts";
import { toEngineInputs, valuationBlock, type ValuationBlock, type ValuationBlockInput } from "./valuation-case.ts";

// An Own Case (GLOSSARY.md; spec #68, Assignments and Own Cases): a listed company the Learner picks, dated at its
// annual report, valued from about eight numbers they copy from that report. It is built into the course's own
// valuation input shape (valuation-case.ts), so the one engine values it with no new maths (ADR 0010). Nothing is
// fetched: the price is the one the Learner reads for the report's date (ADR 0013, ADR 0020).
//
// This module imports only relative modules (no "@/" paths), so plain Node and the page can both run it.

/** The markets an Own Case can be in. India first (#107); more markets add their code here. */
export const OWN_CASE_MARKETS = ["IN"] as const;
export type OwnCaseMarket = (typeof OWN_CASE_MARKETS)[number];

/**
 * The industries a Learner picks from, each with the yardsticks its opening Estimate takes: the industry's operating
 * margin, sales for each rupee invested, and cost of capital in rupees. From Damodaran's India data of 5 Jan 2026
 * (the same rows #105's Market readings carry; ids match them).
 */
export const INDIA_INDUSTRIES = [
  { id: "auto", label: "Auto and truck makers", operatingMarginPercent: 9.69, salesToCapital: 1.03, costOfCapitalPercent: 13.9 },
  { id: "food", label: "Food processors", operatingMarginPercent: 7.26, salesToCapital: 2.34, costOfCapitalPercent: 11.97 },
  { id: "software", label: "Software makers", operatingMarginPercent: 16.73, salesToCapital: 1.85, costOfCapitalPercent: 12.67 },
  { id: "market", label: "Any other firm (not a bank or insurer)", operatingMarginPercent: 11.2, salesToCapital: 1.25, costOfCapitalPercent: 11.45 },
] as const;
export type OwnCaseIndustry = (typeof INDIA_INDUSTRIES)[number]["id"];
export const INDUSTRY_SOURCE = {
  title: "Damodaran, India industry averages, January 2026 update (margins, capital and cost of capital sheets)",
  url: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccIndia.xls",
};

/** What the Learner types from the annual report. Money in rupees crore; shares as the plain count the report prints. */
export type OwnCaseInputs = {
  company: string;
  market: OwnCaseMarket;
  /** The annual report's date (ISO): the Own Case's As-of date. */
  reportDate: string;
  industry: OwnCaseIndustry;
  sales: number;
  operatingProfit: number;
  taxPercent: number;
  debt: number;
  cash: number;
  /** Shares outstanding, as a plain count (20,60,01,719). */
  shares: number;
  /** The share price on the report's date, in rupees. */
  price: number;
  /** A link to the annual report, when the Learner gives one. */
  reportUrl?: string;
};

/** The Learner's Estimate: the story their Own Case is valued on. Percents, like the course's blocks. */
export type OwnCaseEstimate = {
  /** Growth in years 1 to 5; it fades in a straight line to `growthAfterPercent` by year 10. */
  growthPercent: number;
  growthAfterPercent: number;
  /** The operating margin it heads for, closing half the gap each year from the report's margin. */
  targetMarginPercent: number;
  salesToCapital: number;
  /** Cost of capital in years 1 to 5; it fades in a straight line to `costOfCapitalAfterPercent` by year 10. */
  costOfCapitalPercent: number;
  costOfCapitalAfterPercent: number;
  returnOnCapitalAfterPercent: number;
};

/** Growth after year 10 an opening Estimate assumes: a mature company growing with the economy, in rupees. */
const OPENING_GROWTH_AFTER = 5;
/** Growth in years 1 to 5 an opening Estimate assumes, before the Learner moves it. */
const OPENING_GROWTH = 10;

/** The Estimate an Own Case opens with: the industry's yardsticks, a 10% growth fading to 5%. */
export function openingEstimate(industry: OwnCaseIndustry): OwnCaseEstimate {
  const row = INDIA_INDUSTRIES.find((i) => i.id === industry) ?? INDIA_INDUSTRIES[INDIA_INDUSTRIES.length - 1];
  return {
    growthPercent: OPENING_GROWTH,
    growthAfterPercent: OPENING_GROWTH_AFTER,
    targetMarginPercent: row.operatingMarginPercent,
    salesToCapital: row.salesToCapital,
    costOfCapitalPercent: row.costOfCapitalPercent,
    costOfCapitalAfterPercent: row.costOfCapitalPercent,
    returnOnCapitalAfterPercent: row.costOfCapitalPercent,
  };
}

/** Five years at `start`, then a straight line to `end` in year 10 (Coffee Day's 15% → 5%, 11.8% → 10.5%). */
function fadePath(start: number, end: number): number[] {
  const half = FORECAST_YEARS / 2;
  return Array.from({ length: FORECAST_YEARS }, (_, i) => (i < half ? start : round(start + ((end - start) * (i + 1 - half)) / half)));
}
const round = (n: number) => Math.round(n * 1e10) / 1e10;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: string) => ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** Why these typed figures cannot make an Own Case, in a sentence the Learner reads; null when they can. */
function typedProblem(inputs: OwnCaseInputs, now: Date): string | null {
  if (!inputs.company?.trim()) return "Name the company.";
  if (!isDay(inputs.reportDate ?? "")) return "Give the report's date as a day, month and year.";
  if (inputs.reportDate > now.toISOString().slice(0, 10)) return "The report's date must be in the past.";
  if (!(inputs.sales > 0)) return "Sales must be above zero.";
  if (!Number.isFinite(inputs.operatingProfit)) return "Operating profit must be a number (below zero for a loss).";
  if (!(inputs.taxPercent >= 0 && inputs.taxPercent <= 100)) return "The tax rate must be between 0% and 100%.";
  if (!(inputs.debt >= 0)) return "Debt cannot be below zero.";
  if (!(inputs.cash >= 0)) return "Cash cannot be below zero.";
  if (!(inputs.shares > 0)) return "The share count must be above zero.";
  if (!(inputs.price > 0)) return "The share price must be above zero.";
  return null;
}

export type OwnCaseBlockResult = { ok: true; block: ValuationBlock } | { ok: false; error: string };

/** The Own Case as a course valuation block (illustration, never reproducing a published value), or why it cannot be one. */
export function ownCaseBlock(inputs: OwnCaseInputs, estimate: OwnCaseEstimate, now: Date = new Date()): OwnCaseBlockResult {
  const problem = typedProblem(inputs, now);
  if (problem) return { ok: false, error: problem };
  const raw: ValuationBlockInput = {
    currency: "INR",
    unit: "crores",
    baseRevenue: inputs.sales,
    growthPercent: fadePath(estimate.growthPercent, estimate.growthAfterPercent),
    margin: {
      marginPercent: marginPath((inputs.operatingProfit / inputs.sales) * 100, estimate.targetMarginPercent),
      afterPercent: estimate.targetMarginPercent,
    },
    taxPercent: inputs.taxPercent,
    lossesCarried: 0,
    salesToCapital: estimate.salesToCapital,
    costOfCapitalPercent: fadePath(estimate.costOfCapitalPercent, estimate.costOfCapitalAfterPercent),
    growthAfterPercent: estimate.growthAfterPercent,
    returnOnCapitalAfterPercent: estimate.returnOnCapitalAfterPercent,
    cash: inputs.cash,
    debt: inputs.debt,
    options: 0,
    shares: inputs.shares / 1e7,
    per: "share",
    price: { value: inputs.price, date: inputs.reportDate },
    illustration: true,
    published: { note: `An Own Case: ${inputs.company.trim()}, from its annual report of ${inputs.reportDate}.` },
    sources: [inputs.reportUrl && URL.canParse(inputs.reportUrl) ? { title: `${inputs.company.trim()} annual report`, url: inputs.reportUrl } : INDUSTRY_SOURCE],
    reproduces: false,
  };
  // The engine's own sentences first (no shares, growth that never ends), then the shape the course's blocks keep.
  const engine = valueStory(toEngineInputs(raw as ValuationBlock));
  if (!engine.ok) return { ok: false, error: engine.error };
  const parsed = valuationBlock.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "These figures cannot be valued. Check each one against the report." };
  return { ok: true, block: parsed.data };
}

export type OwnCaseValue = ({ ok: true; block: ValuationBlock } & DcfValue) | { ok: false; error: string };

/** The engine's value of an Own Case on an Estimate, or a readable reason it has none. Never throws. */
export function valueOwnCase(inputs: OwnCaseInputs, estimate: OwnCaseEstimate, now: Date = new Date()): OwnCaseValue {
  const built = ownCaseBlock(inputs, estimate, now);
  if (!built.ok) return built;
  const value = valueStory(toEngineInputs(built.block));
  if (!value.ok) return value;
  return { ...value, block: built.block };
}
