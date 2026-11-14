// The names of the formulas in the formula registry (`formulas.ts`). A separate file with no imports,
// so `scripts/check-course.mjs` (which runs the Course Map code under plain Node) can check a Topic's
// formula list against it.

export const FORMULA_IDS = ["present-value", "annuity-present-value", "growing-annuity-present-value", "compound-growth", "cagr"] as const;

export type FormulaId = (typeof FORMULA_IDS)[number];
