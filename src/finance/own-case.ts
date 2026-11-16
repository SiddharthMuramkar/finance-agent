import { FORECAST_YEARS, valueStory, type DcfValue } from "./dcf-engine.ts";
import { marginPath } from "./dcf-paths.ts";
import { marketReading } from "../markets/readings.ts";
import { toEngineInputs, valuationBlock, type ValuationBlock, type ValuationBlockInput } from "./valuation-case.ts";

// An Own Case (GLOSSARY.md; spec #68, Assignments and Own Cases): a listed company the Learner picks, dated at its
// annual report, valued from about eight numbers they copy from that report. It is built into the course's own
// valuation input shape (valuation-case.ts), so the one engine values it with no new maths (ADR 0010). Nothing is
// fetched: the price is the one the Learner reads for the report's date (ADR 0013, ADR 0020).
//
// This module imports only relative modules (no "@/" paths), so plain Node and the page can both run it.

/** The markets an Own Case can be in. India first (#107), then the US (#113); more markets add their code here. */
export const OWN_CASE_MARKETS = ["IN", "US"] as const;
export type OwnCaseMarket = (typeof OWN_CASE_MARKETS)[number];

/**
 * How each market's annual report counts money, and the Estimate it opens with. India: rupees crore (shares counted
 * in crores, 1e7 each). The US: a Form 10-K's US$ millions (shares in millions). Growth after year 10 is a mature company
 * growing with the economy in that currency; in the US it sits below the 10-year Treasury yield (`us-treasury-10y`).
 */
export const OWN_CASE_MARKET = {
  IN: { name: "India", currency: "INR", unit: "crores", shareScale: 1e7, growthAfterPercent: 5, riskFree: null },
  US: { name: "the US", currency: "USD", unit: "millions", shareScale: 1e6, growthAfterPercent: 3, riskFree: "us-treasury-10y" },
} as const satisfies Record<OwnCaseMarket, { name: string; currency: "INR" | "USD"; unit: "crores" | "millions"; shareScale: number; growthAfterPercent: number; riskFree: string | null }>;

type YardstickKind = "margin" | "sales-to-capital" | "cost-of-capital";
const YARDSTICK_KINDS: readonly YardstickKind[] = ["margin", "sales-to-capital", "cost-of-capital"];

/** The id of the Market reading (#105, #113) an industry's yardstick comes from: `<market>-<industry>-<kind>`. */
const yardstickId = (market: OwnCaseMarket, industry: string, kind: YardstickKind) => `${market.toLowerCase()}-${industry}-${kind}`;

/** The yardstick a Market reading gives, by market, industry and kind. */
function yardstick(market: OwnCaseMarket, industry: string, kind: YardstickKind): number {
  const reading = marketReading(yardstickId(market, industry, kind));
  if (!reading) throw new Error(`No Market reading ${yardstickId(market, industry, kind)}`);
  return reading.value;
}

const INDUSTRY_PICK = [
  { id: "auto", label: "Auto and truck makers" },
  { id: "food", label: "Food processors" },
  { id: "software", label: "Software makers" },
  { id: "market", label: "Any other firm (not a bank or insurer)" },
] as const;
export type OwnCaseIndustry = (typeof INDUSTRY_PICK)[number]["id"];

/** A market's industries, each with the yardsticks its opening Estimate takes, read from that market's dated Market readings. */
function industriesOf(market: OwnCaseMarket) {
  return INDUSTRY_PICK.map((i) => ({
    ...i,
    operatingMarginPercent: yardstick(market, i.id, "margin"),
    salesToCapital: yardstick(market, i.id, "sales-to-capital"),
    costOfCapitalPercent: yardstick(market, i.id, "cost-of-capital"),
    /** The reading the yardsticks come from: its source, for the Own Case's sources when the Learner gives no report link. */
    source: marketReading(yardstickId(market, i.id, "cost-of-capital"))!,
  }));
}

/**
 * The industries a Learner picks from, each with the yardsticks its opening Estimate takes: the industry's operating
 * margin, sales for each rupee invested, and cost of capital in rupees, read from the dated Market readings for India
 * (src/markets/readings.ts: Damodaran's India data, January 2026; ids match them).
 */
export const INDIA_INDUSTRIES = industriesOf("IN");

/** The same industries from Damodaran's US data, January 2026 (#113). */
export const US_INDUSTRIES = industriesOf("US");

/** The industries an Own Case in this market picks from. */
export const ownCaseIndustries = (market: OwnCaseMarket) => (market === "US" ? US_INDUSTRIES : INDIA_INDUSTRIES);

/** The Market readings shown beside an Own Case: the industry's three yardsticks, then the market's risk-free rate if it has one. */
export function ownCaseReadingIds(market: OwnCaseMarket, industry: OwnCaseIndustry): string[] {
  const riskFree = OWN_CASE_MARKET[market].riskFree;
  return [...YARDSTICK_KINDS.map((kind) => yardstickId(market, industry, kind)), ...(riskFree ? [riskFree] : [])];
}

/** What the Learner types from the annual report. Money in the market's unit (₹ crore, US$ millions); shares as the plain count the report prints. */
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
  /** The share price on the report's date, in rupees or dollars. */
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

/** Growth in years 1 to 5 an opening Estimate assumes, before the Learner moves it. */
const OPENING_GROWTH = 10;

/** The Estimate an Own Case opens with: the industry's yardsticks in its market, a 10% growth fading to the market's growth after year 10. */
export function openingEstimate(industry: OwnCaseIndustry, market: OwnCaseMarket = "IN"): OwnCaseEstimate {
  const industries = ownCaseIndustries(market);
  const row = industries.find((i) => i.id === industry) ?? industries[industries.length - 1];
  return {
    growthPercent: OPENING_GROWTH,
    growthAfterPercent: OWN_CASE_MARKET[market].growthAfterPercent,
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

/** The industry's yardstick reading as a source line. */
function industrySource(market: OwnCaseMarket, industry: OwnCaseIndustry) {
  const industries = ownCaseIndustries(market);
  const r = (industries.find((i) => i.id === industry) ?? industries[industries.length - 1]).source;
  return { title: `${r.source} (${r.date})`, url: r.sourceUrl };
}

export type OwnCaseBlockResult = { ok: true; block: ValuationBlock } | { ok: false; error: string };

/** The Own Case as a course valuation block (illustration, never reproducing a published value), or why it cannot be one. */
export function ownCaseBlock(inputs: OwnCaseInputs, estimate: OwnCaseEstimate, now: Date = new Date()): OwnCaseBlockResult {
  const problem = typedProblem(inputs, now);
  if (problem) return { ok: false, error: problem };
  const market = OWN_CASE_MARKET[inputs.market] ?? OWN_CASE_MARKET.IN;
  const raw: ValuationBlockInput = {
    currency: market.currency,
    unit: market.unit,
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
    shares: inputs.shares / market.shareScale,
    per: "share",
    price: { value: inputs.price, date: inputs.reportDate },
    illustration: true,
    published: { note: `An Own Case: ${inputs.company.trim()}, from its annual report of ${inputs.reportDate}.` },
    sources: [inputs.reportUrl && URL.canParse(inputs.reportUrl) ? { title: `${inputs.company.trim()} annual report`, url: inputs.reportUrl } : industrySource(inputs.market in OWN_CASE_MARKET ? inputs.market : "IN", inputs.industry)],
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
