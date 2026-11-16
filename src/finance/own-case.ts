import { FORECAST_YEARS, valueStory, type DcfValue } from "./dcf-engine.ts";
import { marginPath } from "./dcf-paths.ts";
import { marketReading, type MarketReading } from "../markets/readings.ts";
import { toEngineInputs, valuationBlock, type ValuationBlock, type ValuationBlockInput } from "./valuation-case.ts";

// An Own Case (GLOSSARY.md; spec #68, Assignments and Own Cases): a listed company the Learner picks, dated at its
// annual report, valued from about eight numbers they copy from that report. It is built into the course's own
// valuation input shape (valuation-case.ts), so the one engine values it with no new maths (ADR 0010). Nothing is
// fetched: the price is the one the Learner reads for the report's date (ADR 0013, ADR 0020).
//
// This module imports only relative modules (no "@/" paths), so plain Node and the page can both run it.

/** The markets an Own Case can be in. India first (#107), then the US (#113), Japan and Korea (#114) and Europe (#115); more markets add their code here. */
export const OWN_CASE_MARKETS = ["IN", "US", "JP", "KR", "EU"] as const;
export type OwnCaseMarket = (typeof OWN_CASE_MARKETS)[number];

/** The yardstick a Market reading (#105) gives, by market, industry and kind: `<market>-<industry>-<kind>`. */
function yardstick(market: OwnCaseMarket, industry: string, kind: "margin" | "sales-to-capital" | "cost-of-capital") {
  const id = `${market.toLowerCase()}-${industry}-${kind}`;
  const reading = marketReading(id);
  if (!reading) throw new Error(`No Market reading ${id}`);
  return reading;
}

const INDUSTRY_PICKS = [
  { id: "auto", label: "Auto and truck makers" },
  { id: "food", label: "Food processors" },
  { id: "software", label: "Software makers" },
  { id: "market", label: "Any other firm (not a bank or insurer)" },
] as const;
export type OwnCaseIndustry = (typeof INDUSTRY_PICKS)[number]["id"];

/** The industries a Learner picks from in a market, each with the yardsticks its opening Estimate takes. */
function industriesOf(market: OwnCaseMarket) {
  return INDUSTRY_PICKS.map((i) => ({
    ...i,
    operatingMarginPercent: yardstick(market, i.id, "margin").value,
    salesToCapital: yardstick(market, i.id, "sales-to-capital").value,
    costOfCapitalPercent: yardstick(market, i.id, "cost-of-capital").value,
    /** The reading the yardsticks come from: its source, for the Own Case's sources when the Learner gives no report link. */
    source: yardstick(market, i.id, "cost-of-capital"),
  }));
}
export type OwnCaseIndustryRow = ReturnType<typeof industriesOf>[number];

/**
 * The industries a Learner picks from in India, each with the yardsticks its opening Estimate takes: the industry's operating
 * margin, sales for each rupee invested, and cost of capital in rupees, read from the dated Market readings for India
 * (src/markets/readings.ts: Damodaran's India data, January 2026; ids match them).
 */
export const INDIA_INDUSTRIES = industriesOf("IN");

/**
 * Each market's money and its dated readings. The report's money unit is the one its statements print: India's ₹ crore,
 * a US 10-K's $ millions, Japan's 百万円 and Korea's 백만원 (millions), Europe's € millions (€m, Mio. €, M€). Growth after year 10 opens at the market's dated risk-free reading (the
 * 10-year government bond yield) where it has one, so a mature company never outgrows its economy; India keeps 5%.
 */
const MARKETS = {
  IN: { code: "IN", name: "India", currency: "INR", unit: "crores", unitSize: 1e7, riskFree: undefined },
  US: { code: "US", name: "the US", currency: "USD", unit: "millions", unitSize: 1e6, riskFree: "us-risk-free-10y" },
  JP: { code: "JP", name: "Japan", currency: "JPY", unit: "millions", unitSize: 1e6, riskFree: "jp-risk-free-10y" },
  KR: { code: "KR", name: "Korea", currency: "KRW", unit: "millions", unitSize: 1e6, riskFree: "kr-risk-free-10y" },
  EU: { code: "EU", name: "Europe", currency: "EUR", unit: "millions", unitSize: 1e6, riskFree: "eu-risk-free-10y" },
} as const;

/** Growth after year 10 an Indian opening Estimate assumes: a mature company growing with the economy, in rupees. */
const INDIA_GROWTH_AFTER = 5;

const MARKET_ROWS = Object.fromEntries(
  OWN_CASE_MARKETS.map((m) => {
    const spec = MARKETS[m];
    const riskFree = spec.riskFree ? marketReading(spec.riskFree) : undefined;
    if (spec.riskFree && !riskFree) throw new Error(`No Market reading ${spec.riskFree}`);
    return [m, { ...spec, riskFree, industries: m === "IN" ? INDIA_INDUSTRIES : industriesOf(m), growthAfter: riskFree?.value ?? INDIA_GROWTH_AFTER }];
  }),
) as Record<OwnCaseMarket, { code: OwnCaseMarket; name: string; currency: "INR" | "USD" | "JPY" | "KRW" | "EUR"; unit: "crores" | "millions"; unitSize: number; riskFree: MarketReading | undefined; industries: OwnCaseIndustryRow[]; growthAfter: number }>;

/** A market's money, name, dated risk-free reading and industries. */
export const ownCaseMarket = (market: OwnCaseMarket) => MARKET_ROWS[market];

/** The industries a Learner picks from in this market. */
export const ownCaseIndustries = (market: OwnCaseMarket): OwnCaseIndustryRow[] => MARKET_ROWS[market].industries;

/** The same industries from Damodaran's US data, January 2026 (#113). */
export const US_INDUSTRIES = ownCaseIndustries("US");

/** The Market readings shown beside an Own Case's industry pick (#113): that industry's three dated yardsticks in its market. */
export const ownCaseReadingIds = (market: OwnCaseMarket, industry: OwnCaseIndustry): string[] =>
  (["margin", "sales-to-capital", "cost-of-capital"] as const).map((kind) => `${market.toLowerCase()}-${industry}-${kind}`);

const isMarket = (m: string): m is OwnCaseMarket => (OWN_CASE_MARKETS as readonly string[]).includes(m);

/** What the Learner types from the annual report. Money in the market's report unit (₹ crore, ¥, ₩ or € millions); shares as the plain count the report prints. */
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
  /** The share price on the report's date, in the market's money (rupees, yen, won, euros). */
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

/** The Estimate an Own Case opens with: the industry's yardsticks, a 10% growth fading to the market's growth after year 10. */
export function openingEstimate(industry: OwnCaseIndustry, market: OwnCaseMarket = "IN"): OwnCaseEstimate {
  const { industries, growthAfter } = MARKET_ROWS[isMarket(market) ? market : "IN"];
  const row = industries.find((i) => i.id === industry) ?? industries[industries.length - 1];
  return {
    growthPercent: OPENING_GROWTH,
    growthAfterPercent: growthAfter,
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
  if (!isMarket(inputs.market)) return "Pick the company's market.";
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
  const market = MARKET_ROWS[inputs.market];
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
    shares: inputs.shares / market.unitSize,
    per: "share",
    price: { value: inputs.price, date: inputs.reportDate },
    illustration: true,
    published: { note: `An Own Case: ${inputs.company.trim()}, from its annual report of ${inputs.reportDate}.` },
    sources: [inputs.reportUrl && URL.canParse(inputs.reportUrl) ? { title: `${inputs.company.trim()} annual report`, url: inputs.reportUrl } : industrySource(inputs.market, inputs.industry)],
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
