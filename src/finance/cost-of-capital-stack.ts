// The cost of capital built up in layers (spec 2026-11-12, B4: the Cost of capital stack Widget, Spine Topic 7). Rates are
// percents, the house convention; relative risk (beta) is a plain number. The rule is the one Damodaran's Amazon valuation
// uses: shareholders want the risk-free rate plus the premium for shares times the company's relative risk, lenders want
// the cost of debt less the tax it saves, and the cost of capital mixes the two by the share of each in the funding.
//
// This module imports nothing (no "@/" paths), so plain Node can run it too.

export type CostOfCapitalInputs = {
  /** The risk-free rate, in percent: a government bond's yield. */
  riskFree: number;
  /** The premium for shares, in percent: what investors want above the risk-free rate for holding the average share. */
  equityPremium: number;
  /** Relative risk (beta): how much the company's shares move with the market. 1 is the average share. */
  relativeRisk: number;
  /** The share of debt in the funding, at market values, in percent. */
  debtShare: number;
  /** The cost of debt before tax, in percent. */
  costOfDebt: number;
  /** The tax rate interest saves, in percent: 0 while losses mean there is no tax to save. */
  taxRate: number;
};

/** The three layers, bottom up: they add up to the cost of capital. */
export type CostOfCapitalLayer = {
  id: "riskFree" | "premium" | "debt";
  /** In percentage points; the debt layer is below zero when debt costs less than shares, as it usually does. */
  value: number;
};

export type CostOfCapitalStack = {
  layers: CostOfCapitalLayer[];
  /** The risk-free rate plus the premium for this company's risk: the first two layers. */
  costOfEquity: number;
  /** The cost of debt less the tax it saves. */
  afterTaxCostOfDebt: number;
  /** The cost of capital: all three layers. */
  total: number;
};

/** A plain sentence when these inputs cannot make a cost of capital, or null when they can. */
export function costOfCapitalProblem(inputs: CostOfCapitalInputs): string | null {
  if (!Object.values(inputs).every(Number.isFinite)) return "Every input must be a number.";
  if (inputs.debtShare < 0 || inputs.debtShare > 100) return "The share of debt must be between 0% and 100%.";
  if (inputs.taxRate < 0 || inputs.taxRate > 100) return "The tax rate must be between 0% and 100%.";
  if (inputs.relativeRisk < 0) return "Relative risk cannot be negative.";
  return null;
}

/**
 * Relative risk (beta) at another share of debt, re-levered as Damodaran does (Boston Chicken in the same HighGrow.pdf: the
 * restaurant industry's beta with no debt, levered to the firm's own debt to equity). A beta measured at one mix holds that
 * mix's debt, so it is first taken back to no debt, then levered to the new mix:
 * beta with debt = beta with no debt x (1 + (1 - tax rate) x debt / equity).
 * More debt makes the shares riskier, so shareholders require more; with no tax to save, the blend barely moves.
 * Debt shares are in percent, of the money at market values; a share of 100% has no equity left to lever, so it is NaN.
 */
export function releveredRisk(relativeRisk: number, fromDebtShare: number, toDebtShare: number, taxRate: number): number {
  const lever = (debtShare: number) =>
    debtShare >= 100 ? Number.NaN : 1 + (1 - taxRate / 100) * (debtShare / (100 - debtShare));
  return (relativeRisk / lever(fromDebtShare)) * lever(toDebtShare);
}

/**
 * The cost of capital in three layers: the risk-free rate; the premium for this company's risk (relative risk times the
 * premium for shares), which together are the cost of equity; and the debt in the mix, the share of debt times the gap
 * between debt's after-tax cost and the cost of equity. Damodaran's Amazon of February 2000: 6.5% plus 1.60 × 4% is a cost
 * of equity of 12.90%, and 1.2% of debt at 8% with no tax to save takes it to 12.84%.
 */
export function costOfCapitalStack(inputs: CostOfCapitalInputs): CostOfCapitalStack {
  const costOfEquity = inputs.riskFree + inputs.relativeRisk * inputs.equityPremium;
  const afterTaxCostOfDebt = inputs.costOfDebt * (1 - inputs.taxRate / 100);
  const debtWeight = inputs.debtShare / 100;
  const layers: CostOfCapitalLayer[] = [
    { id: "riskFree", value: inputs.riskFree },
    { id: "premium", value: inputs.relativeRisk * inputs.equityPremium },
    { id: "debt", value: debtWeight * (afterTaxCostOfDebt - costOfEquity) },
  ];
  return { layers, costOfEquity, afterTaxCostOfDebt, total: costOfEquity * (1 - debtWeight) + afterTaxCostOfDebt * debtWeight };
}
