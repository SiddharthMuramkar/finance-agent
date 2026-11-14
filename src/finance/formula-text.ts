import { calculate, formatMoney } from "./calculators";
import { splitMarkers, type Segment } from "./formula-markers";
import { formulaById, formulaCurrency, type Formula, type FormulaSymbol, type SymbolUnit } from "./formulas";

// What the Tutor is sent in place of a formula marker: the formula's plain-word name, each input in
// words and the result worked out by the tested calculator. Never the raw marker, never typed symbols.
// Money is in the formula's own currency (formulaCurrency): a rupee card never says "$".

/** One symbol's value as the Learner reads it: 10%, 3 years, $1,000.00, ₹1,000, or a grouped level 1,331. */
export function formatSymbolValue(value: number, unit: SymbolUnit): string {
  if (unit === "percent") return `${value}%`;
  if (unit === "years") return `${value} ${value === 1 ? "year" : "years"}`;
  if (unit === "usd" || unit === "inr") return formatMoney(value, unit);
  if (unit === "value") return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(value);
}

function inputText(s: FormulaSymbol, value: number): string {
  return `${s.name} ${formatSymbolValue(value, s.unit)}`;
}

/** One marker in words, e.g. "Present value of one future payment, worked out by code: Amount … gives Worth today … $1,000.00". */
export function describeFormula(formula: Formula, values: Record<string, number>): string {
  const run = calculate(formula.calculator, values, formulaCurrency(formula));
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
