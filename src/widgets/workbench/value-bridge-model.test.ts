import { describe, expect, it } from "vitest";
import { valuationCase } from "@/finance/valuation-cases";
import { WORKBENCH_BUDGET } from "../check";
import { valueBridgeData } from "./registry";
import { valueBridgeLevers, valueBridgeModel, valueBridgeReading, valueBridgeShape, valueBridgeTasks, type BridgeSettings } from "./value-bridge-model";

// Value bridge (spec 2026-11-12, B4; Spine Topic 9): Damodaran's Amazon, February 2000. The expected figures are Appendix B.1's
// bridge: business value 15,157, before options 14,834, after options 11,942, 340.79 million shares, $35.04 a share.

const block = valuationCase("amazon-dcf-2000")!;
const data = { block };
const atCase: BridgeSettings = { cash: 26, debt: 349, options: 2_892 };

describe("Value bridge on Amazon (B4, Appendix B.1)", () => {
  it("steps the $15.2bn business down through cash, debt and options to $11.9bn and $35 a share", () => {
    const model = valueBridgeModel(data, atCase);
    expect(model.steps.map((s) => s.id)).toEqual(["business", "cash", "debt", "options", "shareholders"]);
    expect(model.steps[0].value).toBeCloseTo(15_157, -1);
    expect(model.steps[4].value).toBeCloseTo(11_942, -1);
    expect(model.value).toBeGreaterThan(34.95);
    expect(model.value).toBeLessThan(35.15);
    expect(model.headline).toEqual({ before: "Each share is worth ", key: "$35", after: "" });
    expect(model.numbers).toEqual([
      { label: "Business value", text: "$15.2bn" },
      { label: "Left for shareholders", text: "$11.9bn" },
    ]);
  });

  it("gives a share the options' $2.9bn when they are set to nothing: 14,834 / 340.79 = $43.53", () => {
    const model = valueBridgeModel(data, { ...atCase, options: 0 });
    expect(model.value).toBeCloseTo(14_834 / 340.79, 1);
    expect(model.headline.key).toBe("$44");
    expect(model.conditions[1]).toBe(true);
  });

  it("leaves the business value where it is whatever the claims: they are paid from it, they do not make it", () => {
    const business = (s: BridgeSettings) => valueBridgeModel(data, s).steps[0].value;
    expect(business({ cash: 0, debt: 20_000, options: 0 })).toBe(business(atCase));
  });

  it("says lenders and option holders take everything when nothing is left, never a negative price", () => {
    const model = valueBridgeModel(data, { ...atCase, debt: 13_000 });
    expect(model.nothingLeft).toBe(true);
    expect(`${model.headline.key}${model.headline.after}`).toBe("$0: lenders and option holders take everything");
    expect(model.numbers[1].text).toBe("$0");
    expect(model.conditions[0]).toBe(true);
  });

  it("opens each claim at the Case's figure on a $0 to $20bn track in $0.2bn steps, options stopping at $0", () => {
    const levers = valueBridgeLevers(data);
    expect(levers.map((l) => [l.id, l.label, l.min, l.max, l.step, l.opening])).toEqual([
      ["cash", "Cash", 0, 20_000, 200, 26],
      ["debt", "Debt", 0, 20_000, 200, 349],
      ["options", "Options", 0, 20_000, 200, 2_892],
    ]);
    expect(levers[2].chips).toEqual([0]);
    expect(levers[2].stops).toEqual([0, 2_892]);
    expect(levers[0].reading(26)).toBe("$26m");
    expect(levers[2].spoken(2_892)).toBe("2.9 billion dollars");
  });

  it("asks for two things the levers can reach on this Case", () => {
    expect(valueBridgeTasks(data)).toEqual(["Raise debt until shareholders get nothing", "Set the options to $0. What does a share gain?"]);
    const debt = valueBridgeLevers(data)[1];
    expect(valueBridgeModel(data, { ...atCase, debt: debt.max }).conditions[0]).toBe(true);
  });

  it("keeps within the Workbench budget (B2)", () => {
    const shape = valueBridgeShape(data);
    expect(shape.controls).toBeLessThanOrEqual(WORKBENCH_BUDGET.controls);
    expect(shape.numbers).toBeLessThanOrEqual(WORKBENCH_BUDGET.numbers);
    expect(shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
    expect(shape.tasks).toBeLessThanOrEqual(WORKBENCH_BUDGET.tasks);
  });

  it("tells the Tutor each claim, the value and both numbers", () => {
    expect(valueBridgeReading(data, atCase)).toEqual({
      sliders: [
        { label: "Cash", text: "$26m" },
        { label: "Debt", text: "$349m" },
        { label: "Options", text: "$2.9bn" },
      ],
      readouts: ["Value: $35 a share", "Business value: $15.2bn", "Left for shareholders: $11.9bn"],
    });
  });
});

describe("Value bridge with leases counted as debt (C4, Spine Topic 9: lenders, landlords and option holders)", () => {
  const leases = { amount: 1_000, label: "operating leases", source: { title: "A Topic's source", url: "https://example.com/leases" } };

  it("adds the leases to debt, says so under the lever, and names landlords among those paid first", () => {
    const found = valueBridgeData({ caseId: "amazon-dcf-2000", leases });
    if (!("data" in found)) throw new Error(found.problem);
    const [, debt] = valueBridgeLevers(found.data);
    expect(debt.label).toBe("Debt and leases");
    expect(debt.opening).toBe(349 + 1_000);
    expect(debt.caption).toBe("Includes operating leases: $1bn");
    const model = valueBridgeModel(found.data, { ...atCase, debt: 14_000 });
    expect(`${model.headline.key}${model.headline.after}`).toBe("$0: lenders, landlords and option holders take everything");
    expect(valueBridgeTasks(found.data)[0]).toBe("Raise debt and leases until shareholders get nothing");
  });

  it("refuses leases without a source, and a Case that has no valuation block", () => {
    expect(valueBridgeData({ caseId: "amazon-dcf-2000", leases: { amount: 1_000, label: "leases" } })).toMatchObject({ problem: expect.stringMatching(/^leases: source/) });
    expect(valueBridgeData({ caseId: "tesla-2020" })).toMatchObject({ problem: expect.stringMatching(/"tesla-2020" is not a Valuation Case/) });
  });
});
