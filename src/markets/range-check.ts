import type { ValuationBlock } from "../finance/valuation-case.ts";
import { MARKET_READINGS, readingValueText, type MarketReading } from "./readings.ts";

// The range check (spec #68, ticket #109; user story 83): each Own Case input is compared with its industry's yardsticks
// from the Market readings (src/markets/readings.ts), and an input far outside the usual range is named, so a Learner
// catches a typo or a wild assumption. It never calls a value right or wrong and never gives advice (spec voice rule 7):
// it says only how far the value sits from the industry's usual range, and shows the yardstick's date and source.
// Imports only packages and relative paths, so plain Node can run it.

/** The inputs an industry yardstick can be held against. */
export type RangeInputs = { marginPercent?: number; salesToCapital?: number; costOfCapitalPercent?: number };

type YardstickKind = "operating_margin" | "sales_to_capital" | "cost_of_capital";

const INPUTS: { kind: YardstickKind; key: keyof RangeInputs; name: string }[] = [
  { kind: "operating_margin", key: "marginPercent", name: "operating margin" },
  { kind: "sales_to_capital", key: "salesToCapital", name: "sales to capital" },
  { kind: "cost_of_capital", key: "costOfCapitalPercent", name: "cost of capital" },
];

/**
 * The usual range around an industry's yardstick. A margin and sales to capital are ratios, so far means under half or
 * over double the industry's figure; a cost of capital is a rate, so far means more than 3 percentage points away.
 */
export function usualRange(r: Pick<MarketReading, "kind" | "value">): { low: number; high: number } {
  if (r.kind === "cost_of_capital") return { low: round(r.value - 3), high: round(r.value + 3) };
  const [a, b] = [r.value / 2, r.value * 2];
  return { low: round(Math.min(a, b)), high: round(Math.max(a, b)) };
}

const round = (n: number) => Number(n.toFixed(2));

export type RangeFlag = {
  input: YardstickKind;
  /** The input in plain words: "operating margin". */
  name: string;
  value: number;
  low: number;
  high: number;
  side: "above" | "below";
  /** The yardstick held against: its date, source, link and credit go on screen with the sentence. */
  yardstick: MarketReading;
  /** "Your operating margin of 45% is far above Food Processing's usual 3.63% to 14.52% in India." */
  sentence: string;
};

/** Where the yardstick comes from: Korea's are Damodaran's Emerging Markets figures (src/markets/readings-japan-korea.ts). */
const MARKET_WORD = { IN: "India", US: "the US", JP: "Japan", KR: "emerging markets", EU: "Europe" } as const;

/** The id word each yardstick kind carries: "in-food-margin" (src/markets/readings.ts). */
const KIND_ID = { operating_margin: "margin", sales_to_capital: "sales-to-capital", cost_of_capital: "cost-of-capital" } as const;

/**
 * Every input far outside its industry's usual range, in the order margin, sales to capital, cost of capital. The industry
 * is the source's name ("Food Processing") or the word in its readings' ids ("food", as the Own Case industry pick has it).
 */
export function rangeCheck(inputs: RangeInputs, where: { market: MarketReading["market"]; industry: string }): RangeFlag[] {
  return INPUTS.flatMap(({ kind, key, name }) => {
    const value = inputs[key];
    if (value === undefined || !Number.isFinite(value)) return [];
    const yardstick = MARKET_READINGS.find((r) => r.kind === kind && r.market === where.market && (r.industry === where.industry || r.id === `${where.market.toLowerCase()}-${where.industry}-${KIND_ID[kind]}`));
    if (!yardstick?.industry) return [];
    const { low, high } = usualRange(yardstick);
    if (value >= low && value <= high) return [];
    const side = value > high ? "above" : "below";
    const text = (v: number) => readingValueText({ value: v, unit: yardstick.unit });
    const sentence = `Your ${name} of ${text(value)} is far ${side} ${yardstick.industry}'s usual ${text(low)} to ${text(high)} in ${MARKET_WORD[where.market]}.`;
    return [{ input: kind, name, value, low, high, side, yardstick, sentence }];
  });
}

/** The industries with yardsticks in a market: the choices an Own Case's industry pick offers. */
export function yardstickIndustries(market: MarketReading["market"]): string[] {
  return [...new Set(MARKET_READINGS.flatMap((r) => (r.market === market && r.kind !== "implied_premium" && r.industry ? [r.industry] : [])))];
}

/** The engine inputs the range check reads from a valuation block: the base year's margin, sales to capital and year 1's cost of capital. */
export function blockRangeInputs(block: Pick<ValuationBlock, "margin" | "salesToCapital" | "costOfCapitalPercent">): RangeInputs {
  const marginPercent = "startPercent" in block.margin ? block.margin.startPercent : block.margin.marginPercent[0];
  return { marginPercent, salesToCapital: block.salesToCapital, costOfCapitalPercent: block.costOfCapitalPercent[0] };
}
