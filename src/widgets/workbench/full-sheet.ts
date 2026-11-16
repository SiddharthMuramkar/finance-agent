import type { DcfInputs } from "@/finance/dcf-engine";
import { inputsFor, type ValuationBlock } from "@/finance/valuation-case";
import { near, roundTo } from "./bench";
import { FULL_SHEET_WORDS, withMoney, type LingoWords } from "./full-sheet-words";
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
  /** The Levers moved it: its figure is not the Case's own (#103). */
  moved: boolean;
  /** The Lingo card the row opens inline: what its term means, in plain words (#103). */
  card: LingoWords;
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

/** The same figure: numbers equal to rounding, paths year by year, a chance of failure field by field. */
function sameFigure(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return near(a, b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameFigure(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameFigure((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

/**
 * The Full sheet's rows for these engine inputs, in the order a valuation is told: the business, then what it is owed and
 * owns. A row is marked moved when its figure is not the one in `opening`, the inputs of the Case's own story.
 */
export function fullSheetRows(block: ValuationBlock, inputs: DcfInputs, opening: DcfInputs = inputs): FullSheetRow[] {
  const sign = currencySign(block);
  const money = (v: number) => moneyText(v, block);
  const sales = (v: number) => `${sign}${roundTo(v, 2)}`;
  // Its name and Lingo card, in the Case's currency; `besidePath` when a year-by-year path of the same figure sits below it.
  const named = (input: keyof DcfInputs, besidePath = false) => {
    const { words, besidePath: other, card } = FULL_SHEET_WORDS[input];
    return { words: withMoney(besidePath && other ? other : words, sign), card: { ...card, term: withMoney(card.term, sign) } };
  };
  const row = (input: keyof DcfInputs, reading: string, besidePath = false): FullSheetRow => ({ input, ...named(input, besidePath), reading, value: inputs[input], moved: false });
  const pathRow = (input: keyof DcfInputs, path: readonly number[], text: (v: number) => string): FullSheetRow => {
    const years = path.map(text);
    return { input, ...named(input), reading: pathReading(years, path[0], path[path.length - 1]), years, value: path, moved: false };
  };
  const rows: FullSheetRow[] = [
    row("baseRevenue", money(inputs.baseRevenue)),
    pathRow("growth", inputs.growth, percent),
    pathRow("margin", inputs.margin, percent),
    row("marginAfter", percent(inputs.marginAfter)),
    row("taxRate", percent(inputs.taxRate), !!inputs.taxRateByYear),
    ...(inputs.taxRateByYear ? [pathRow("taxRateByYear", inputs.taxRateByYear, percent)] : []),
    row("lossesCarried", money(inputs.lossesCarried)),
    row("salesToCapital", `${sales(inputs.salesToCapital)} of sales for each ${sign}1 invested`, !!inputs.salesToCapitalByYear),
    ...(inputs.salesToCapitalByYear ? [pathRow("salesToCapitalByYear", inputs.salesToCapitalByYear, sales)] : []),
    pathRow("costOfCapital", inputs.costOfCapital, percent),
    row("growthAfter", percent(inputs.growthAfter)),
    row("returnOnCapitalAfter", percent(inputs.returnOnCapitalAfter)),
    row("cash", money(inputs.cash)),
    row("debt", money(inputs.debt)),
    row("options", money(inputs.options)),
    row("shares", block.per === "company" ? "Valued as one whole company" : `${roundTo(inputs.shares, 2).toLocaleString("en-US")} ${UNIT_WORD[block.unit]}`),
  ];
  // Always a row, as the Levers always offer it: a story with no chance of failure leaves the engine's input out.
  if (inputs.failure) {
    const { chance, recovered = 0, recoveredShare } = inputs.failure;
    const back = recoveredShare !== undefined ? `${percent(recoveredShare)} of its value is recovered` : recovered > 0 ? `${money(recovered)} is recovered` : "nothing is recovered";
    rows.push(row("failure", `${percent(chance)}; if it fails, ${back}`));
  } else rows.push(row("failure", "0%: none in this story"));
  return rows.map((r) => ({ ...r, moved: !sameFigure(r.value, opening[r.input]) }));
}

/**
 * The Full sheet for the Lever settings shown: the engine's inputs for them, row by row, or why they cannot be valued. The
 * rows the Levers moved off the Case's own story are marked (#103); with no Lever moved the inputs are the Case's own.
 */
export function fullSheet(block: ValuationBlock, specs: readonly LeverSpec[], settings: LeverSettings, mode?: ValueLeversMode, market = 0): FullSheet {
  const made = inputsFor(block, leversFor(block, specs, settings, mode, market));
  if (!made.ok) return made;
  const own = inputsFor(block, {});
  return { ok: true, rows: fullSheetRows(block, made.inputs, own.ok ? own.inputs : made.inputs) };
}
