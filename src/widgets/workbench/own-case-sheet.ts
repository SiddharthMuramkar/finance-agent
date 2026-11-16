import { valueStory } from "@/finance/dcf-engine";
import { openingEstimate, ownCaseBlock, type OwnCaseEstimate, type OwnCaseInputs } from "@/finance/own-case";
import { toEngineInputs, type ValuationBlock } from "@/finance/valuation-case";
import { fullSheetRows, NO_ROW_CHANGES, withRows, type FullSheetRow, type RowSettings } from "./full-sheet";
import { priceText } from "./value-levers-model";

// An Own Case on the Full sheet (spec #68, ticket #111): every input of the Learner's Own Case, each marked with where it
// came from: a figure they typed from the annual report, the industry's yardstick (a dated Market reading), a default the
// opening Estimate assumes, or an Estimate figure they set themselves. The rows are the engine's inputs (full-sheet.ts),
// plus the share price they typed, which the engine does not value but the Own Case is read beside. Changing a row
// (#104's sliders) revalues the Own Case through the one engine (ADR 0010).

/** Where an Own Case figure came from. */
export type RowOrigin = "typed" | "yardstick" | "default" | "estimate";

/** The figures a Learner types into the Own Case form (the industry is a tap, the company and date are its name and As-of). */
export const OWN_CASE_TYPED = ["sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"] as const satisfies readonly (keyof OwnCaseInputs)[];
type Typed = (typeof OWN_CASE_TYPED)[number];
type EstimateField = keyof OwnCaseEstimate;

/** What an opening Estimate figure is when the Learner has not set it: the industry's yardstick, or the course's default. */
const ESTIMATE_OPENING: Record<EstimateField, "yardstick" | "default"> = {
  growthPercent: "default",
  growthAfterPercent: "default",
  targetMarginPercent: "yardstick",
  salesToCapital: "yardstick",
  costOfCapitalPercent: "yardstick",
  costOfCapitalAfterPercent: "yardstick",
  returnOnCapitalAfterPercent: "yardstick",
};

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
  default: "A default",
  estimate: "Your Estimate",
};

/** One Own Case row: a Full sheet row, or the typed share price, with where its figures came from. */
export type OwnCaseSheetRow = Omit<FullSheetRow, "input" | "value"> & {
  input: SheetInput;
  /** The Own Case figures the row is built from. */
  from: readonly (Typed | EstimateField)[];
  /** Where they came from, typed first: a margin path starts at the typed margin and heads for the yardstick. */
  origins: RowOrigin[];
  /** The same in words: "You typed it", "You typed it; then the industry's yardstick". */
  originWords: string;
};

export type OwnCaseSheet =
  | { ok: true; block: ValuationBlock; valued: ValuationBlock; rows: OwnCaseSheetRow[]; valuePerShare: number }
  | { ok: false; error: string };

const ORDER: RowOrigin[] = ["typed", "estimate", "yardstick", "default"];

function originsOf(from: readonly (Typed | EstimateField)[], estimate: OwnCaseEstimate, opening: OwnCaseEstimate): RowOrigin[] {
  if (!from.length) return ["default"];
  const found = new Set<RowOrigin>(
    from.map((f) => ((OWN_CASE_TYPED as readonly string[]).includes(f) ? "typed" : estimate[f as EstimateField] !== opening[f as EstimateField] ? "estimate" : ESTIMATE_OPENING[f as EstimateField])),
  );
  return ORDER.filter((o) => found.has(o));
}

const wordsOf = (origins: RowOrigin[]) => origins.map((o, i) => (i === 0 ? ORIGIN_WORDS[o] : `then ${ORIGIN_WORDS[o].replace(/^The /, "the ").replace(/^A /, "a ").replace(/^Your /, "your ")}`)).join("; ");

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
  const opening = openingEstimate(inputs.industry);
  const marked = (input: SheetInput) => {
    const origins = originsOf(FROM[input], estimate, opening);
    return { from: FROM[input], origins, originWords: wordsOf(origins) };
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
      means: "What one share sold for on the day the report closes; the Own Case's value is read beside it.",
      example: `₹${inputs.price} for one share, on the day the report closes.`,
      emoji: "receipt",
    },
    ...marked("price"),
  };
  return { ok: true, block, valued, rows: [...sheet, price], valuePerShare: value.valuePerShare };
}
