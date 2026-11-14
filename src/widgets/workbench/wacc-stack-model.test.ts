import { describe, expect, it } from "vitest";
import { valuationCase } from "@/finance/valuation-cases";
import { WORKBENCH_BUDGET } from "../check";
import { waccStackData } from "./registry";
import { waccStackLevers, waccStackModel, waccStackReading, waccStackShape, waccStackTasks, type StackSettings, type WaccStackData } from "./wacc-stack-model";

// Cost of capital stack (spec 2026-11-12, B4; Spine Topic 7: "The rate matters less than growth and margins"). Damodaran's
// Amazon of February 2000: a 6.5% risk-free rate, a 4% premium for shares, relative risk 1.60, 1.2% of debt at 8% with no
// tax to save. His cost of equity is 12.90% and his cost of capital in year 1 12.84% (Appendix B.1).

const source = { title: "Damodaran, Can Amazon.com be valued?", url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf" };
const figures = { riskFree: 6.5, equityPremium: 4, relativeRisk: 1.6, debtShare: 1.2, costOfDebt: 8, taxRate: 0 };
const block = valuationCase("amazon-dcf-2000")!;
const data: WaccStackData = { inputs: figures, source, block };
const atCase: StackSettings = { riskFree: 6.5, premium: 4, relativeRisk: 1.6, debtShare: 1.2 };

describe("Cost of capital stack on Amazon (B4)", () => {
  it('builds "The cost of capital is 12.84%" from a 12.90% cost of equity, in three layers', () => {
    const model = waccStackModel(data, atCase);
    expect(`${model.headline.before}${model.headline.key}`).toBe("The cost of capital is 12.84%");
    expect(model.numbers[0]).toEqual({ label: "Cost of equity", text: "12.9%" });
    expect(model.layers.map((l) => [l.label, l.text])).toEqual([
      ["Risk-free rate", "+6.5%"],
      ["Premium for this risk", "+6.4%"],
      ["Debt in the mix", "−0.06%"],
      ["Cost of capital", "12.84%"],
    ]);
  });

  it("shows the value a share at that rate: $35 at 12.84%, and between B.2's $31.51 (14%) and $26.07 (16%) at relative risk 2.0", () => {
    expect(waccStackModel(data, atCase).numbers[1]).toEqual({ label: "Value a share at this rate", text: "$35" });
    const riskier = waccStackModel(data, { ...atCase, relativeRisk: 2 });
    expect(riskier.total).toBeCloseTo(6.5 + 2 * 4 - 0.012 * (14.5 - 8), 6);
    const value = Number(riskier.numbers[1].text.replace("$", ""));
    expect(value).toBeLessThan(31.51);
    expect(value).toBeGreaterThan(26.07);
  });

  it("without a Valuation Case, shows the after-tax cost of debt instead", () => {
    expect(waccStackModel({ inputs: figures, source }, atCase).numbers[1]).toEqual({ label: "After-tax cost of debt", text: "8%" });
  });

  it("opens each lever at the Case's figure, Amazon's 1.2% of debt a stop off the 1% steps", () => {
    const levers = waccStackLevers(data);
    expect(levers.map((l) => [l.id, l.min, l.max, l.step, l.opening])).toEqual([
      ["riskFree", 0, 11, 0.25, 6.5],
      ["premium", 2, 8, 0.25, 4],
      ["relativeRisk", 0.5, 2.5, 0.05, 1.6],
      ["debtShare", 0, 60, 1, 1.2],
    ]);
    expect(levers[3].stops).toEqual([1.2, 30]);
    expect(levers[2].reading(1.6)).toBe("1.60");
    expect(levers[2].spoken(1.6)).toBe("1.6 times the average share's risk");
  });

  it("asks for two settings it can reach, and ticks each there", () => {
    expect(waccStackTasks(data)).toEqual(["Raise relative risk to 2.0. How far does the rate move?", "Set the share of debt to 30%"]);
    expect(waccStackModel(data, { ...atCase, relativeRisk: 2 }).conditions).toEqual([true, false]);
    expect(waccStackModel(data, { ...atCase, debtShare: 30 }).conditions).toEqual([false, true]);
  });

  it("refuses figures that cannot make a rate, and figures without a source", () => {
    expect(waccStackData({ figures: { ...figures, debtShare: 120 }, source })).toMatchObject({ problem: expect.stringMatching(/^figures: debtShare/) });
    expect(waccStackData({ figures, source: { title: "x" } })).toMatchObject({ problem: expect.stringMatching(/^source:/) });
  });

  it("keeps within the Workbench budget (B2): four levers at rest", () => {
    const shape = waccStackShape(data);
    expect(shape.controls).toBe(WORKBENCH_BUDGET.controls);
    expect(shape.more).toBe(0);
    expect(shape.numbers).toBeLessThanOrEqual(WORKBENCH_BUDGET.numbers);
    expect(shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
  });

  it("tells the Tutor the rate, its layers and the Case's cost of debt with its source", () => {
    const { readouts } = waccStackReading(data, atCase);
    expect(readouts).toEqual([
      "Cost of capital: 12.84%",
      "Cost of equity: 12.9%",
      "Value a share at this rate: $35",
      "Layers: Risk-free rate +6.5%, Premium for this risk +6.4%, Debt in the mix −0.06%",
      "Cost of debt 8% before tax, tax rate 0% (sourced: Damodaran, Can Amazon.com be valued?)",
    ]);
  });
});
