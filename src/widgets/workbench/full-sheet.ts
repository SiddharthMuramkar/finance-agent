import type { DcfInputs } from "@/finance/dcf-engine";
import { inputsFor, toEngineInputs, type ValuationBlock } from "@/finance/valuation-case";
import { clean, floorTo, niceUp, oneFigure, roundTo } from "./bench";
import type { ValueLeversMode } from "./data-schemas";
import { currencySign, leversFor, moneyText, type LeverSettings, type LeverSpec } from "./value-levers-model";

// The Full sheet (spec #68, "Valuation, Full sheet"; glossary "Full sheet"): every input of the valuation on screen, in
// plain words, behind Go deeper under the Levers. Its rows are exactly the inputs the one valuation engine values for the
// Lever settings shown (ADR 0010), so the sheet and the headline can never disagree. Read-only: nothing here sets a figure.

/** One input of the valuation, as the Full sheet shows it. */
export type FullSheetRow = {
  /** The engine input the row shows. */
  input: keyof DcfInputs;
  /** What it is, in plain words: "Revenue growth, year by year". */
  words: string;
  /** Its figure: "35%", "$500m", "150% in year 1, down to 6% in year 10". */
  reading: string;
  /** Each year's figure, for a figure that changes year by year. */
  years?: string[];
  /** The engine's own figure, as the engine takes it (rates as fractions). */
  value: DcfInputs[keyof DcfInputs];
};

export type FullSheet = { ok: true; rows: FullSheetRow[] } | { ok: false; error: string };

const UNIT_WORD: Record<ValuationBlock["unit"], string> = { millions: "million", crores: "crore", billions: "billion" };

const percent = (fraction: number) => `${roundTo(fraction * 100, 2)}%`;

/** A path of ten yearly figures: "8% every year", or its first and last year. */
function pathReading(years: string[], first: number, last: number): string {
  if (years.every((y) => y === years[0])) return `${years[0]} every year`;
  const way = last < first ? "down to" : last > first ? "up to" : "back to";
  return `${years[0]} in year 1, ${way} ${years[years.length - 1]} in year 10`;
}

function pathRow(input: keyof DcfInputs, words: string, path: readonly number[], text: (v: number) => string): FullSheetRow {
  const years = path.map(text);
  return { input, words, reading: pathReading(years, path[0], path[path.length - 1]), years, value: path };
}

/** The Full sheet's rows for these engine inputs, in the order a valuation is told: the business, then what it is owed and owns. */
export function fullSheetRows(block: ValuationBlock, inputs: DcfInputs): FullSheetRow[] {
  const sign = currencySign(block);
  const money = (v: number) => moneyText(v, block);
  const sales = (v: number) => `${sign}${roundTo(v, 2)}`;
  const row = (input: keyof DcfInputs, words: string, reading: string): FullSheetRow => ({ input, words, reading, value: inputs[input] });
  const rows: FullSheetRow[] = [
    row("baseRevenue", "Revenue in the year before year 1", money(inputs.baseRevenue)),
    pathRow("growth", "Revenue growth, year by year", inputs.growth, percent),
    pathRow("margin", "Operating margin, year by year", inputs.margin, percent),
    row("marginAfter", "Operating margin after year 10", percent(inputs.marginAfter)),
    row("taxRate", inputs.taxRateByYear ? "Tax rate after year 10" : "Tax rate", percent(inputs.taxRate)),
    ...(inputs.taxRateByYear ? [pathRow("taxRateByYear", "Tax rate, year by year", inputs.taxRateByYear, percent)] : []),
    row("lossesCarried", "Past losses that cut future tax", money(inputs.lossesCarried)),
    row(
      "salesToCapital",
      inputs.salesToCapitalByYear ? `Sales for each ${sign} invested, in a year that sets none` : `Sales for each ${sign} invested`,
      `${sales(inputs.salesToCapital)} of sales for each ${sign}1 invested`,
    ),
    ...(inputs.salesToCapitalByYear ? [pathRow("salesToCapitalByYear", `Sales for each ${sign} invested, year by year`, inputs.salesToCapitalByYear, sales)] : []),
    pathRow("costOfCapital", "Cost of capital, year by year", inputs.costOfCapital, percent),
    row("growthAfter", "Growth after year 10, for ever", percent(inputs.growthAfter)),
    row("returnOnCapitalAfter", "Return on new investment after year 10", percent(inputs.returnOnCapitalAfter)),
    row("cash", "Cash the company holds", money(inputs.cash)),
    row("debt", "Debt the company owes", money(inputs.debt)),
    row("options", "Employee options, owed to their holders", money(inputs.options)),
    row("shares", "Shares the value is split over", block.per === "company" ? "Valued as one whole company" : `${roundTo(inputs.shares, 2).toLocaleString("en-US")} ${UNIT_WORD[block.unit]}`),
  ];
  // Always a row, as the Levers always offer it: a story with no chance of failure leaves the engine's input out.
  if (inputs.failure) {
    const { chance, recovered = 0, recoveredShare } = inputs.failure;
    const back = recoveredShare !== undefined ? `${percent(recoveredShare)} of its value is recovered` : recovered > 0 ? `${money(recovered)} is recovered` : "nothing is recovered";
    rows.push(row("failure", "Chance the business fails", `${percent(chance)}; if it fails, ${back}`));
  } else rows.push(row("failure", "Chance the business fails", "0%: none in this story"));
  return rows;
}

/** The Full sheet for the Lever settings shown: the engine's inputs for them, row by row, or why they cannot be valued. */
export function fullSheet(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode?: ValueLeversMode, market = 0): FullSheet {
  const made = inputsFor(block, leversFor(block, specs, settings, mode, market));
  return made.ok ? { ok: true, rows: fullSheetRows(block, made.inputs) } : made;
}

// ——— Changing a row (#104) ———
// A row the Levers do not set has its own slider, never a typed number (ADR 0020). Its setting is the change from the
// Case's own figure, in the Case's units (percent points, or money in its unit), so 0 is the Case's figure: a Session saved
// before rows could change, or a Case chip switching company, draws the Case as it is. The changed figures go into the
// block the engine values, so the headline, the Full sheet and the Tutor all read the one engine's value (ADR 0010).

/** The rows a Learner can change on the Full sheet. The paths, margin after year 10, sales to capital and the chance of
 * failure follow the Levers; revenue before year 1 and the share count are the Case's facts. */
export const ROW_IDS = ["taxRate", "lossesCarried", "growthAfter", "returnOnCapitalAfter", "cash", "debt", "options"] as const;
export type RowId = (typeof ROW_IDS)[number];

/** Each row's change from the Case's figure, in the Case's units; 0 is the Case's own. */
export type RowSettings = Record<RowId, number>;

/** The $variable that keeps each row's change in the Widget's state; the ValueLevers part's prop of the same name. */
export const ROW_VARIABLES: Record<RowId, string> = {
  taxRate: "taxRow",
  lossesCarried: "lossesRow",
  growthAfter: "growthAfterRow",
  returnOnCapitalAfter: "returnAfterRow",
  cash: "cashRow",
  debt: "debtRow",
  options: "optionsRow",
};

/** The block field each row changes. */
const FIELD: Record<RowId, "taxPercent" | "lossesCarried" | "growthAfterPercent" | "returnOnCapitalAfterPercent" | "cash" | "debt" | "options"> = {
  taxRate: "taxPercent",
  lossesCarried: "lossesCarried",
  growthAfter: "growthAfterPercent",
  returnOnCapitalAfter: "returnOnCapitalAfterPercent",
  cash: "cash",
  debt: "debt",
  options: "options",
};

/** A row's slider: its words (the Full sheet row's), its range in the Case's units, and the Case's own figure. */
export type RowSpec = { id: RowId; label: string; min: number; max: number; step: number; opening: number; reading: (figure: number) => string };

export const NO_ROW_CHANGES: RowSettings = Object.fromEntries(ROW_IDS.map((id) => [id, 0])) as RowSettings;

/** The sliders of the rows a Learner can change, for this Case. Every figure on them can be valued by the engine. */
export function rowSpecs(block: ValuationBlock): RowSpec[] {
  const words = Object.fromEntries(fullSheetRows(block, toEngineInputs(block)).map((r) => [r.input, r.words]));
  const money = (id: RowId, scale: number): RowSpec => {
    const opening = block[FIELD[id]];
    const max = niceUp(Math.max(opening * 2, scale));
    return { id, label: words[id], min: 0, max, step: oneFigure(max / 40), opening, reading: (n) => moneyText(n, block) };
  };
  const rate = (id: RowId, min: number, max: number, step: number): RowSpec => {
    const opening = block[FIELD[id]];
    return { id, label: words[id], min: Math.min(min, opening), max: Math.max(max, opening), step, opening, reading: (n) => `${roundTo(n, 2)}%` };
  };
  // Growth after year 10 stays half a point under the year-10 cost of capital, or the value would be infinite (the engine refuses it).
  const lastRate = block.costOfCapitalPercent[block.costOfCapitalPercent.length - 1];
  return [
    rate("taxRate", 0, 50, 1),
    money("lossesCarried", block.baseRevenue),
    rate("growthAfter", 0, floorTo(lastRate - 0.5, 0.25), 0.25),
    rate("returnOnCapitalAfter", 1, 40, 1),
    money("cash", block.baseRevenue / 2),
    money("debt", block.baseRevenue / 2),
    money("options", block.baseRevenue / 2),
  ];
}

/** The row changes from Widget state numbers (keyed by ROW_VARIABLES): each a finite number held to its slider, else none. */
export function rowsFrom(values: Record<string, unknown>, block: ValuationBlock): RowSettings {
  return Object.fromEntries(
    rowSpecs(block).map((s) => {
      const v = values[ROW_VARIABLES[s.id]];
      return [s.id, typeof v === "number" && Number.isFinite(v) ? clean(Math.min(s.max, Math.max(s.min, s.opening + v)) - s.opening) : 0];
    }),
  ) as RowSettings;
}

/** The rows changed from the Case's figures. */
export const changedRows = (rows: Partial<RowSettings>): RowId[] => ROW_IDS.filter((id) => (rows[id] ?? 0) !== 0);

/** The Case with the rows changed, for the engine to value; the very same block when no row is changed. */
export function withRows(block: ValuationBlock, rows: Partial<RowSettings>): ValuationBlock {
  const changed = changedRows(rows);
  if (!changed.length) return block;
  return { ...block, ...Object.fromEntries(changed.map((id) => [FIELD[id], clean(block[FIELD[id]] + rows[id]!)])) };
}

/** What the Tutor is told of the rows changed: each with its figure now and the Case's own. */
export function changedRowReadouts(block: ValuationBlock, rows: Partial<RowSettings>): string[] {
  const specs = rowSpecs(block);
  return changedRows(rows).map((id) => {
    const spec = specs.find((s) => s.id === id)!;
    return `Full sheet row changed: ${spec.label}, ${spec.reading(clean(spec.opening + rows[id]!))} (the Case's ${spec.reading(spec.opening)})`;
  });
}
