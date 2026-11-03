import { calculate, formatMoney } from "./calculators";
import { splitMarkers, type Segment } from "./formula-markers";
import { formulaById, type Formula, type FormulaSymbol } from "./formulas";

// What the Tutor is sent in place of a formula marker: the formula's plain-word name, each input in
// words and the result worked out by the tested calculator. Never the raw marker, never typed symbols.

function inputText(s: FormulaSymbol, value: number): string {
  const shown =
    s.unit === "percent" ? `${value}%` : s.unit === "years" ? `${value} ${value === 1 ? "year" : "years"}` : s.unit === "usd" ? formatMoney(value, "usd") : String(value);
  return `${s.name} ${shown}`;
}

/** One marker in words, e.g. "Present value of one future payment, worked out by code: Amount … gives Worth today … $1,000.00". */
export function describeFormula(formula: Formula, values: Record<string, number>): string {
  const run = calculate(formula.calculator, values, "usd");
  const inputs = formula.symbols.map((s) => inputText(s, values[s.key])).join("; ");
  if (!run.ok) return `(${formula.title}, with ${inputs}: it could not be worked out, so give no figure for it)`;
  const outputs = [...formula.derived, formula.result].map((o) => `${o.name} ${run.results.find((r) => r.label === o.resultLabel)?.text ?? "unknown"}`).join("; ");
  return `(${formula.title}, worked out by code: ${inputs}, which gives ${outputs})`;
}

function segmentText(s: Segment): string {
  if (s.kind === "text") return s.text;
  if (s.kind === "bad") return "(a formula that could not be worked out)";
  const formula = formulaById(s.formulaId);
  return formula ? describeFormula(formula, s.values) : "(a formula that could not be worked out)";
}

/** Topic text with every formula marker replaced by plain words and the computed result. */
export function plainFormulaText(text: string): string {
  return text.includes("{{formula:") ? splitMarkers(text).map(segmentText).join("") : text;
}
