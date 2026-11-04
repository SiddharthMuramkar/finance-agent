import type { Currency } from "./calculators";
import type { FormulaId } from "./formula-ids";

// The formula registry: every named formula a Formula Card can show (ADR 0002). Each entry points at a
// tested Finance Calculation, so the symbols' plain-word names and every result come from code and the
// Tutor never types a formula. Adding a formula means writing and testing its calculator first.

/** "inr" is rupees (₹, Indian grouping); "value" is a plain level such as an index, never money. */
export type SymbolUnit = "percent" | "years" | "usd" | "inr" | "count" | "value";

export type FormulaSymbol = {
  /** The calculator's input name; also the key a Formula Card's maps use. */
  key: string;
  /** The letter or short mark the formula is written with, e.g. "r". */
  mark: string;
  /** Plain words for the Learner, e.g. "Yearly discount rate". */
  name: string;
  unit: SymbolUnit;
};

/** A value the calculator works out, as against one the Learner or Case Data supplies. */
export type FormulaOutput = {
  /** What an expression line writes it as, e.g. "first". */
  key: string;
  mark: string;
  name: string;
  unit: SymbolUnit;
  /** The label of the calculator result that holds this value. */
  resultLabel: string;
};

export type Formula = {
  id: FormulaId;
  title: string;
  /** The ID of the Finance Calculation that works the formula out. */
  calculator: string;
  /** The symbols the Learner (or Case Data) supplies, in the order the card lists them. */
  symbols: FormulaSymbol[];
  /** What the calculator works out last; the card shows it as the answer. Its key is always "result". */
  result: FormulaOutput;
  /** Values worked out on the way, shown beside the symbols but never supplied. */
  derived: FormulaOutput[];
  /** The formula as lines of text; `{key}` stands for a symbol, a derived value or `{result}`. */
  expression: string[];
  /** A working set of inputs: the tests run the calculator with it. */
  example: Record<string, number>;
};

const PV_RESULT: FormulaOutput = { key: "result", mark: "PV", name: "Worth today (present value)", unit: "usd", resultLabel: "Present value" };

export const FORMULAS: Formula[] = [
  {
    id: "present-value",
    title: "Present value of one future payment",
    calculator: "present_value",
    symbols: [
      { key: "amount", mark: "FV", name: "Amount you receive later", unit: "usd" },
      { key: "ratePercent", mark: "r", name: "Yearly discount rate", unit: "percent" },
      { key: "years", mark: "n", name: "Years until the payment arrives", unit: "years" },
    ],
    result: PV_RESULT,
    derived: [],
    expression: ["{result} = {amount} ÷ (1 + {ratePercent}) ^ {years}"],
    example: { amount: 1000, ratePercent: 10, years: 5 },
  },
  {
    id: "annuity-present-value",
    title: "Present value of equal yearly payments",
    calculator: "annuity_present_value",
    symbols: [
      { key: "payment", mark: "P", name: "Each yearly payment", unit: "usd" },
      { key: "ratePercent", mark: "r", name: "Yearly discount rate", unit: "percent" },
      { key: "years", mark: "n", name: "Number of yearly payments", unit: "years" },
    ],
    result: PV_RESULT,
    derived: [],
    expression: ["{result} = {payment} × (1 − (1 + {ratePercent}) ^ −{years}) ÷ {ratePercent}"],
    example: { payment: 1000, ratePercent: 8, years: 10 },
  },
  {
    id: "growing-annuity-present-value",
    title: "Present value of growing yearly payments",
    calculator: "growing_annuity_present_value",
    symbols: [
      { key: "total", mark: "S", name: "Advertised total of all payments", unit: "usd" },
      { key: "payments", mark: "n", name: "Number of yearly payments, the first paid now", unit: "count" },
      { key: "growthPercent", mark: "g", name: "How much each payment grows on the one before", unit: "percent" },
      { key: "ratePercent", mark: "r", name: "Yearly discount rate", unit: "percent" },
    ],
    result: PV_RESULT,
    derived: [{ key: "first", mark: "C", name: "First payment, paid now", unit: "usd", resultLabel: "First payment" }],
    expression: [
      "{first} = {total} ÷ the sum of (1 + {growthPercent}) ^ t, for t = 0 to {payments} − 1",
      "{result} = the sum of {first} × (1 + {growthPercent}) ^ t ÷ (1 + {ratePercent}) ^ t, for t = 0 to {payments} − 1",
    ],
    example: { total: 3310, payments: 3, growthPercent: 10, ratePercent: 10 },
  },
  {
    id: "compound-growth",
    title: "Compound growth of one amount",
    calculator: "future_value",
    symbols: [
      { key: "amount", mark: "A", name: "Amount you start with", unit: "inr" },
      { key: "ratePercent", mark: "g", name: "Yearly growth rate", unit: "percent" },
      { key: "years", mark: "n", name: "Number of years it grows", unit: "years" },
    ],
    result: { key: "result", mark: "FV", name: "What it grows to (future value)", unit: "inr", resultLabel: "Future value" },
    derived: [],
    expression: ["{result} = {amount} × (1 + {ratePercent}) ^ {years}"],
    example: { amount: 1000, ratePercent: 10, years: 3 },
  },
  {
    id: "cagr",
    title: "Compound annual growth rate (CAGR)",
    calculator: "cagr",
    symbols: [
      { key: "start", mark: "S", name: "Level at the start", unit: "value" },
      { key: "end", mark: "E", name: "Level at the end", unit: "value" },
      { key: "years", mark: "n", name: "Years between the two", unit: "years" },
    ],
    result: { key: "result", mark: "CAGR", name: "Steady yearly growth rate", unit: "percent", resultLabel: "CAGR" },
    derived: [],
    expression: ["{result} = ({end} ÷ {start}) ^ (1 ÷ {years}) − 1"],
    example: { start: 1000, end: 1331, years: 3 },
  },
];

/** The currency a formula's money is in: rupees when any of its values is in rupees, else dollars. */
export function formulaCurrency(f: Formula): Currency {
  return [...f.symbols, ...f.derived, f.result].some((s) => s.unit === "inr") ? "inr" : "usd";
}

export function formulaById(id: string): Formula | undefined {
  return FORMULAS.find((f) => f.id === id);
}

/** One line for the Tutor: a formula and the keys its Formula Card takes. */
export function formulaGuide(f: Formula): string {
  const keys = f.symbols.map((s) => `${s.key} (${s.name}, ${s.unit})`).join("; ");
  return `"${f.id}" (${f.title}). Keys: ${keys}.`;
}
