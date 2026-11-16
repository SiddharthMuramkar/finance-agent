import { describe, expect, it } from "vitest";
import { costOfCapitalProblem, costOfCapitalStack, releveredRisk, type CostOfCapitalInputs } from "./cost-of-capital-stack";

// The cost of capital in layers (spec 2026-11-12, B4). Expected figures are Damodaran's own, from the cost of capital table
// of his Amazon valuation (HighGrow.pdf, February 2000), as the risk-capm Topic's Case quotes it: "6.5% + 1.60 x 4%".

/** Amazon in years 1 to 3: a 6.5% Treasury, beta 1.60, a 4% premium, 1.2% debt at 8% with no tax to save. */
const amazonYear1: CostOfCapitalInputs = { riskFree: 6.5, equityPremium: 4, relativeRisk: 1.6, debtShare: 1.2, costOfDebt: 8, taxRate: 0 };

describe("cost of capital stack", () => {
  it("gives Amazon's year-1 cost of equity of 12.90% and cost of capital of 12.84%", () => {
    const stack = costOfCapitalStack(amazonYear1);
    expect(stack.costOfEquity.toFixed(2)).toBe("12.90");
    expect(stack.afterTaxCostOfDebt.toFixed(2)).toBe("8.00");
    expect(stack.total.toFixed(2)).toBe("12.84");
  });

  it("gives Amazon's stable-growth 10.50% cost of equity, 4.55% after-tax cost of debt and 9.61% cost of capital", () => {
    const stack = costOfCapitalStack({ riskFree: 6.5, equityPremium: 4, relativeRisk: 1, debtShare: 15, costOfDebt: 7, taxRate: 35 });
    expect(stack.costOfEquity.toFixed(2)).toBe("10.50");
    expect(stack.afterTaxCostOfDebt.toFixed(2)).toBe("4.55");
    expect(stack.total.toFixed(2)).toBe("9.61");
  });

  it("builds it in three layers that add up to it: risk-free 6.5, premium 6.4, and the cheaper debt below zero", () => {
    const stack = costOfCapitalStack(amazonYear1);
    expect(stack.layers.map((l) => l.id)).toEqual(["riskFree", "premium", "debt"]);
    expect(stack.layers[0].value).toBe(6.5);
    expect(stack.layers[1].value).toBeCloseTo(6.4, 12);
    expect(stack.layers[2].value).toBeLessThan(0);
    expect(stack.layers.reduce((sum, l) => sum + l.value, 0)).toBeCloseTo(stack.total, 12);
  });

  it("with no debt the cost of capital is the cost of equity", () => {
    const stack = costOfCapitalStack({ ...amazonYear1, debtShare: 0 });
    expect(stack.total).toBeCloseTo(stack.costOfEquity, 12);
    expect(stack.layers[2].value).toBeCloseTo(0, 12);
  });

  it("re-levers a beta as Damodaran does: Boston Chicken's 0.82 with no debt is 3.46 at 83.18% debt and a 35% tax rate", () => {
    // HighGrow.pdf, Illustration 3: "the beta of the stock, estimated using the unlevered beta of 0.82 for the restaurant
    // industry and the current market debt to equity ratio has risen to 3.46" (debt to capital 83.18%, tax rate 35%).
    expect(releveredRisk(0.82, 0, 83.18, 35).toFixed(2)).toBe("3.46");
    expect(releveredRisk(1.6, 1.2, 1.2, 0)).toBeCloseTo(1.6, 12);
    expect(releveredRisk(1, 15, 15, 35)).toBeCloseTo(1, 12);
    expect(releveredRisk(1.6, 1.2, 100, 0)).toBeNaN();
  });

  it("with no tax to save, more debt does not make Amazon's money cheaper (review 3, M03)", () => {
    const at = (debtShare: number) =>
      costOfCapitalStack({ ...amazonYear1, debtShare, relativeRisk: releveredRisk(1.6, 1.2, debtShare, 0) }).total.toFixed(2);
    expect([at(0), at(15), at(30)]).toEqual(["12.82", "13.05", "13.27"]);
    expect(releveredRisk(1.6, 1.2, 30, 0).toFixed(2)).toBe("2.26");
  });

  it("says in words why inputs cannot make a rate", () => {
    expect(costOfCapitalProblem(amazonYear1)).toBeNull();
    expect(costOfCapitalProblem({ ...amazonYear1, debtShare: 120 })).toBe("The share of debt must be between 0% and 100%.");
    expect(costOfCapitalProblem({ ...amazonYear1, riskFree: Number.NaN })).toBe("Every input must be a number.");
  });
});
