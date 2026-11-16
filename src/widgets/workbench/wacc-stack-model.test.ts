import { describe, expect, it } from "vitest";
import { valuationCase } from "@/finance/valuation-cases";
import { WORKBENCH_BUDGET } from "../check";
import { waccStackData } from "./registry";
import {
  WHOLE_RATE_LABEL,
  waccStackLevers,
  waccStackModel,
  waccStackReading,
  waccStackShape,
  waccStackTasks,
  type StackSettings,
  type WaccStackData,
} from "./wacc-stack-model";

// Cost of capital stack (spec 2026-11-12, B4; Spine Topic 7: "The rate matters less than growth and margins"). Damodaran's
// Amazon of February 2000: a 6.5% risk-free rate, a 4% premium for shares, relative risk 1.60, 1.2% of debt at 8% with no
// tax to save. His cost of equity is 12.90% and his cost of capital in year 1 12.84% (Appendix B.1).

const source = {
  title: "Damodaran, Can Amazon.com be valued?",
  url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf",
};
const figures = {
  riskFree: 6.5,
  equityPremium: 4,
  relativeRisk: 1.6,
  debtShare: 1.2,
  costOfDebt: 8,
  taxRate: 0,
};
const block = valuationCase("amazon-dcf-2000")!;
const data: WaccStackData = { inputs: figures, source, block };
const atCase: StackSettings = {
  riskFree: 6.5,
  premium: 4,
  relativeRisk: 1.6,
  debtShare: 1.2,
};

describe("Cost of capital stack on Amazon (B4)", () => {
  it('builds "The cost of capital is 12.84%" from a 12.90% cost of equity, in three layers', () => {
    const model = waccStackModel(data, atCase);
    expect(`${model.headline.before}${model.headline.key}`).toBe(
      "The cost of capital is 12.84%",
    );
    expect(model.numbers[0]).toEqual({
      label: "Cost of equity",
      text: "12.9%",
    });
    expect(model.layers.map((l) => [l.label, l.text])).toEqual([
      ["Risk-free rate", "+6.5%"],
      ["Premium for this risk", "+6.4%"],
      ["Debt in the mix", "−0.06%"],
      ["Cost of capital", "12.84%"],
    ]);
  });

  it("shows the value a share at that rate: $35 at 12.84%, and between B.2's $31.51 (14%) and $26.07 (16%) at relative risk 2.0", () => {
    expect(waccStackModel(data, atCase).numbers[1]).toEqual({
      label: "Value a share at this rate",
      text: "$35",
    });
    const riskier = waccStackModel(data, { ...atCase, relativeRisk: 2 });
    expect(riskier.total).toBeCloseTo(6.5 + 2 * 4 - 0.012 * (14.5 - 8), 6);
    const value = Number(riskier.numbers[1].text.replace("$", ""));
    expect(value).toBeLessThan(31.51);
    expect(value).toBeGreaterThan(26.07);
  });

  it("without a Valuation Case, shows the after-tax cost of debt instead", () => {
    expect(
      waccStackModel({ inputs: figures, source }, atCase).numbers[1],
    ).toEqual({ label: "After-tax cost of debt", text: "8%" });
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
    expect(waccStackTasks(data)).toEqual([
      "Raise relative risk to 2.0. Does the rate move a lot or a little?",
      "Set the share of debt to 30%",
    ]);
    expect(
      waccStackModel(data, { ...atCase, relativeRisk: 2 }).conditions,
    ).toEqual([true, false]);
    expect(
      waccStackModel(data, { ...atCase, debtShare: 30 }).conditions,
    ).toEqual([false, true]);
  });

  it("refuses figures that cannot make a rate, and figures without a source", () => {
    expect(
      waccStackData({ figures: { ...figures, debtShare: 120 }, source }),
    ).toMatchObject({ problem: expect.stringMatching(/^figures: debtShare/) });
    expect(waccStackData({ figures, source: { title: "x" } })).toMatchObject({
      problem: expect.stringMatching(/^source:/),
    });
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
      "Who puts in the money: Shareholders: 98.8%, want 12.9%; Lenders: 1.2%, cost 8%",
      "Cost of debt 8% before tax, tax rate 0% (sourced: Damodaran, Can Amazon.com be valued?)",
    ]);
  });

  it("shows who puts in the money, shareholders and lenders, each with its Icon, and moves with the share of debt (Spine critics #91)", () => {
    expect(waccStackModel(data, atCase).funders).toEqual([
      {
        id: "shareholders",
        icon: "person",
        text: "Shareholders: 98.8%, want 12.9%",
      },
      { id: "lenders", icon: "bank", text: "Lenders: 1.2%, cost 8%" },
    ]);
    expect(
      waccStackModel(data, { ...atCase, debtShare: 30 }).funders.map(
        (f) => f.text,
      ),
    ).toEqual(["Shareholders: 70%, want 15.53%", "Lenders: 30%, cost 8%"]);
  });

  // Review 3, M03: relative risk is the Case's beta at the Case's own share of debt, so another share re-levers it. With no
  // tax to save (Amazon's years one to three), more debt makes the money dearer, not cheaper: 13.27% at 30%, 12.82% at none.
  it("re-levers relative risk when the share of debt moves, so more debt with no tax to save raises the rate", () => {
    const at = (debtShare: number) =>
      waccStackModel(data, { ...atCase, debtShare }).headline.key;
    expect([at(0), at(1.2), at(15), at(30)]).toEqual([
      "12.82%",
      "12.84%",
      "13.05%",
      "13.27%",
    ]);
    expect(
      waccStackReading(data, { ...atCase, debtShare: 30 }).readouts,
    ).toContain(
      "Relative risk with this much debt: 2.26 (1.60 at 1.2% of debt; more debt makes the shares riskier)",
    );
    expect(waccStackReading(data, atCase).readouts.join("\n")).not.toMatch(
      /Relative risk with this much debt/,
    );
  });

  it("moves the rate with the premium for shares", () => {
    expect(
      waccStackModel(data, { ...atCase, premium: 5 }).numbers[0],
    ).toEqual({ label: "Cost of equity", text: "14.5%" });
  });
});

// Spine critics round 1 on #91: the risk Topic leads with the cost of equity and the story's betas, and the cost-of-capital
// Topic leads with the share of debt, so each Workbench shows its own Topic's one idea.
describe("Cost of capital stack, led by the Topic's story (#91)", () => {
  const marks = [
    { relativeRisk: 2.29, label: "his measure" },
    { relativeRisk: 1, label: "a retailer" },
  ];
  const equity: WaccStackData = { ...data, story: { lead: "equity", marks } };
  const mature = {
    riskFree: 6.5,
    equityPremium: 4,
    relativeRisk: 1,
    debtShare: 15,
    costOfDebt: 7,
    taxRate: 35,
  };
  const debt: WaccStackData = {
    inputs: mature,
    source,
    story: { lead: "debt" },
  };
  const atMature: StackSettings = {
    riskFree: 6.5,
    premium: 4,
    relativeRisk: 1,
    debtShare: 15,
  };

  it("leads the risk Topic's headline with the cost of equity, the whole rate beside it in plain words", () => {
    const model = waccStackModel(equity, atCase);
    expect(`${model.headline.before}${model.headline.key}`).toBe(
      "The cost of equity is 12.9%",
    );
    // Spine critics round 2 on #91: "cost of capital" is the next Topic's term, so the risk Topic names the whole rate plainly.
    expect(model.numbers[0]).toEqual({
      label: WHOLE_RATE_LABEL,
      text: "12.84%",
    });
    expect(WHOLE_RATE_LABEL).toBe("Whole rate, with debt");
    expect(model.layers.at(-1)?.label).toBe("Whole rate");
    expect(JSON.stringify(waccStackReading(equity, atCase))).not.toMatch(
      /cost of capital/i,
    );
    expect(waccStackModel(data, atCase).layers.at(-1)?.label).toBe(
      "Cost of capital",
    );
    expect(waccStackReading(equity, atCase).readouts[0]).toBe(
      "Cost of equity: 12.9%",
    );
  });

  it("shows the price beside the value a share, so the gap to the price reads at a glance (Spine critics round 1 on #91)", () => {
    expect(waccStackModel(equity, atCase).numbers.slice(1)).toEqual([
      { label: "Value a share at this rate", text: "$35" },
      { label: "Price on 3 Feb 2000", text: "$84" },
    ]);
    // Only the risk Topic's story asks about the price; the plain stack keeps its two numbers.
    expect(waccStackModel(data, atCase).numbers).toHaveLength(2);
  });

  it("puts the story's betas on relative risk as labelled chips the slider lands on, 2.29 off the 0.05 steps", () => {
    const risk = waccStackLevers(equity).find((l) => l.id === "relativeRisk")!;
    expect(risk.chips).toEqual([1, 2.29]);
    expect(risk.stops).toEqual([1, 1.6, 2.29]);
    expect(risk.chips.map((v) => risk.chipLabel?.(v))).toEqual([
      "1.00, a retailer",
      "2.29, his measure",
    ]);
  });

  it("asks the risk Topic's Things to try as directions, at the story's betas, and ticks each there", () => {
    expect(waccStackTasks(equity)).toEqual([
      "Move relative risk to 2.29, his measure. Does the value move a lot or a little?",
      "Now move it to 1.00, a retailer",
    ]);
    expect(
      waccStackModel(equity, { ...atCase, relativeRisk: 2.29 }).conditions,
    ).toEqual([true, false]);
    expect(
      waccStackModel(equity, { ...atCase, relativeRisk: 1 }).conditions,
    ).toEqual([false, true]);
  });

  it("puts the share of debt first in the cost-of-capital Topic, with a No debt chip", () => {
    const levers = waccStackLevers(debt);
    expect(levers.map((l) => l.id)).toEqual([
      "debtShare",
      "riskFree",
      "premium",
      "relativeRisk",
    ]);
    expect(levers[0].chips).toEqual([0]);
    expect(levers[0].chipLabel?.(0)).toBe("No debt");
  });

  it("asks the cost-of-capital Topic's Things to try about debt, as directions, and ticks them in order", () => {
    expect(waccStackTasks(debt)).toEqual([
      "Set the share of debt to none. Does the cost of capital move a lot or a little?",
      "Set it back to 15%",
    ]);
    expect(
      waccStackModel(debt, { ...atMature, debtShare: 0 }).conditions,
    ).toEqual([true, false]);
    expect(waccStackModel(debt, atMature).conditions).toEqual([false, true]);
    const model = waccStackModel(debt, atMature);
    expect(`${model.headline.before}${model.headline.key}`).toBe(
      "The cost of capital is 9.61%",
    );
  });

  it("at No debt shows the cost of equity with the beta taken back to no debt, not his 10.50% (review 3, M03)", () => {
    const none = waccStackModel(debt, { ...atMature, debtShare: 0 });
    expect(none.headline.key).toBe("10.09%");
    expect(none.funders.map((f) => f.text)).toEqual([
      "Shareholders: 100%, want 10.09%",
      "Lenders: 0%, cost 4.55%",
    ]);
  });

  it("keeps within the Workbench budget either way", () => {
    for (const d of [equity, debt]) {
      const shape = waccStackShape(d);
      expect(shape.controls).toBe(WORKBENCH_BUDGET.controls);
      expect(shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
    }
  });

  it("reads the story from the Widget's props, and refuses a lead it does not know", () => {
    expect(
      waccStackData({ figures, source, story: { lead: "equity", marks } }),
    ).toMatchObject({ data: { story: { lead: "equity", marks } } });
    expect(
      waccStackData({ figures, source, story: { lead: "sideways" } }),
    ).toMatchObject({ problem: expect.stringMatching(/^story:/) });
    // The recipe's code carries the story inside the figures, so the part's signature stays as it was.
    expect(
      waccStackData({
        figures: { ...figures, story: { lead: "debt" } },
        source,
      }),
    ).toMatchObject({ data: { inputs: figures, story: { lead: "debt" } } });
  });
});
