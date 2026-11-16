import { valueStory } from "@/finance/dcf-engine";
import { CURRENCY_STYLE } from "@/finance/money";
import { openingEstimate, ownCaseBlock, ownCaseMarket, type OwnCaseEstimate, type OwnCaseInputs, type OwnCaseMarket } from "@/finance/own-case";
import { toEngineInputs, type ValuationBlock } from "@/finance/valuation-case";
import { nothingLeftWords } from "@/learner/own-case-words";
import { fullSheetRows, NO_ROW_CHANGES, withRows, type FullSheetRow, type RowSettings } from "./full-sheet";
import { priceText } from "./value-levers-model";

// An Own Case on the Full sheet (spec #68, ticket #111): every input of the Learner's Own Case, each marked with where it
// came from: a figure they typed from the annual report, the industry's yardstick (a dated Market reading), the market's
// dated risk-free reading, a default the opening Estimate assumes, or an Estimate figure they set themselves. The rows are the engine's inputs (full-sheet.ts),
// plus the share price they typed, which the engine does not value but the Own Case is read beside. Changing a row
// (#104's sliders) revalues the Own Case through the one engine (ADR 0010).

/** Where an Own Case figure came from. */
export type RowOrigin = "typed" | "yardstick" | "reading" | "default" | "estimate";

/** The figures a Learner types into the Own Case form (the industry is a tap, the company and date are its name and As-of). */
export const OWN_CASE_TYPED = ["sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"] as const satisfies readonly (keyof OwnCaseInputs)[];
type Typed = (typeof OWN_CASE_TYPED)[number];
type EstimateField = keyof OwnCaseEstimate;

/**
 * What an opening Estimate figure is when the Learner has not set it (openingEstimate in own-case.ts): the industry's
 * yardstick; the market's dated risk-free reading (growth after year 10 in a market that has one; India keeps a default
 * 5%); or a default. Return on capital after year 10 is a default: the opening Estimate sets it equal to the cost of
 * capital after year 10, so growth then neither adds nor takes away value. It is not a yardstick of its own.
 */
function openingOrigin(field: EstimateField, market: OwnCaseMarket): "yardstick" | "reading" | "default" {
  switch (field) {
    case "growthPercent":
    case "returnOnCapitalAfterPercent":
      return "default";
    case "growthAfterPercent":
      return ownCaseMarket(market).riskFree ? "reading" : "default";
    default:
      return "yardstick";
  }
}

type SheetInput = FullSheetRow["input"] | "price";

/** The Own Case figures each Full sheet row is built from; a row built from none is a default (no losses, options or failure). */
const FROM: Record<SheetInput, readonly (Typed | EstimateField)[]> = {
  baseRevenue: ["sales"],
  growth: ["growthPercent", "growthAfterPercent"],
  margin: ["operatingProfit", "sales", "targetMarginPercent"],
  marginAfter: ["targetMarginPercent"],
  taxRate: ["taxPercent"],
  taxRateByYear: ["taxPercent"],
  lossesCarried: [],
  salesToCapital: ["salesToCapital"],
  salesToCapitalByYear: ["salesToCapital"],
  costOfCapital: ["costOfCapitalPercent", "costOfCapitalAfterPercent"],
  growthAfter: ["growthAfterPercent"],
  returnOnCapitalAfter: ["returnOnCapitalAfterPercent"],
  cash: ["cash"],
  debt: ["debt"],
  options: [],
  shares: ["shares"],
  failure: [],
  price: ["price"],
};

const ORIGIN_WORDS: Record<RowOrigin, string> = {
  typed: "You typed it",
  yardstick: "The industry's yardstick",
  reading: "The market's dated 10-year bond reading",
  default: "A default",
  estimate: "Your Estimate",
};

/** A default that is another figure, said as that figure: return on capital after year 10 is the cost of capital then. */
const DEFAULT_WORDS: Partial<Record<EstimateField, string>> = {
  returnOnCapitalAfterPercent: "A default: the same as the cost of capital after year 10",
};

/** One Own Case row: a Full sheet row, or the typed share price, with where its figures came from. */
export type OwnCaseSheetRow = Omit<FullSheetRow, "input" | "value"> & {
  input: SheetInput;
  /** The Own Case figures the row is built from. */
  from: readonly (Typed | EstimateField)[];
  /** Where they came from, typed first: a margin path starts at the typed margin and heads for the yardstick. */
  origins: RowOrigin[];
  /** The same in words: "You typed it", "You typed it; then the industry's yardstick", "A default; then the market's dated 10-year bond reading". */
  originWords: string;
};

export type OwnCaseSheet =
  | { ok: true; block: ValuationBlock; valued: ValuationBlock; rows: OwnCaseSheetRow[]; valuePerShare: number }
  | { ok: false; error: string };

/** In the order a row's path runs: a margin starts at the typed margin and heads for the yardstick; growth starts at a default and fades to the dated reading. */
const ORDER: RowOrigin[] = ["typed", "estimate", "yardstick", "default", "reading"];

const isTyped = (f: Typed | EstimateField): f is Typed => (OWN_CASE_TYPED as readonly string[]).includes(f);

function originsOf(from: readonly (Typed | EstimateField)[], estimate: OwnCaseEstimate, opening: OwnCaseEstimate, market: OwnCaseMarket): { origin: RowOrigin; field?: EstimateField }[] {
  if (!from.length) return [{ origin: "default" }];
  const found = from.map((f) => (isTyped(f) ? { origin: "typed" as const } : { origin: estimate[f] !== opening[f] ? ("estimate" as const) : openingOrigin(f, market), field: f }));
  return ORDER.flatMap((o) => found.find((x) => x.origin === o) ?? []);
}

const lower = (words: string) => words.replace(/^The /, "the ").replace(/^A /, "a ").replace(/^Your /, "your ");
const wordsOf = (origins: { origin: RowOrigin; field?: EstimateField }[]) =>
  origins
    .map(({ origin, field }, i) => {
      const words = (origin === "default" && field && DEFAULT_WORDS[field]) || ORIGIN_WORDS[origin];
      return i === 0 ? words : `then ${lower(words)}`;
    })
    .join("; ");

/**
 * The engine's value on the sheet in a sentence. A value at or below zero is no price a share can have: it reads 0 with
 * the words the form and the note use (own-case-words.ts), so the sheet and the form never disagree (F06). Pass the block
 * the rows valued (`valued`), so a debt moved to 0 on the sheet no longer blames lenders (L05).
 */
export function sheetValueLine(valuePerShare: number, block: ValuationBlock): string {
  if (!(valuePerShare > 0)) return `The engine's value with these rows: ${CURRENCY_STYLE[block.currency].symbol}0 a share. ${nothingLeftWords(block.debt)}`;
  return `The engine's value with these rows: ${priceText(valuePerShare, block)} a share.`;
}

/**
 * The Own Case's Full sheet on this Estimate with these rows changed, and the engine's value a share for it; or the sentence
 * the form shows when the figures cannot be valued. Moved marks a row whose figure is not the one the Learner gave.
 */
export function ownCaseSheet(inputs: OwnCaseInputs, estimate: OwnCaseEstimate, rows: RowSettings = NO_ROW_CHANGES, now: Date = new Date()): OwnCaseSheet {
  const built = ownCaseBlock(inputs, estimate, now);
  if (!built.ok) return built;
  const block = built.block;
  const valued = withRows(block, rows);
  const engineInputs = toEngineInputs(valued);
  const value = valueStory(engineInputs);
  if (!value.ok) return value;
  const opening = openingEstimate(inputs.industry, inputs.market);
  const marked = (input: SheetInput) => {
    const found = originsOf(FROM[input], estimate, opening, inputs.market);
    return { from: FROM[input], origins: found.map((o) => o.origin), originWords: wordsOf(found) };
  };
  const sheet: OwnCaseSheetRow[] = fullSheetRows(valued, engineInputs, toEngineInputs(block)).map(({ input, words, reading, years, moved, card }) => ({
    input,
    words,
    reading,
    ...(years ? { years } : {}),
    moved,
    card,
    ...marked(input),
  }));
  const price: OwnCaseSheetRow = {
    input: "price",
    words: "Share price on the report's date",
    reading: priceText(inputs.price, block),
    moved: false,
    card: {
      term: "Share price",
      pro: "The price one share last traded at, on the report's date",
      means: "What one share sold for on the day the report's figures became public; the Own Case's value is read beside it.",
      example: `${priceText(inputs.price, block)} for one share, on the day the report came out.`,
      emoji: "receipt",
    },
    ...marked("price"),
  };
  return { ok: true, block, valued, rows: [...sheet, price], valuePerShare: value.valuePerShare };
}
