import { describe, expect, it } from "vitest";
import { valuationCase, valuationCaseIds } from "@/finance/valuation-cases";
import { WORKBENCH_BUDGET } from "../check";
import { terminalSeesawLevers, terminalSeesawModel, terminalSeesawReading, terminalSeesawShape, terminalSeesawTasks } from "./terminal-seesaw-model";

// Terminal seesaw (spec 2026-11-12, B4; Spine Topic 8: "More than all of the value sat after year 10"). The expected figures
// are Appendix B.1's: terminal value 52,112, discounted cash flows of years 1 to 10 -1,767, discounted terminal value 16,924,
// 112% of the business from the terminal value.

const block = valuationCase("amazon-dcf-2000")!;
const data = { block };
const atCase = { growthAfter: 6, costAfter: 9.61 };

describe("Terminal seesaw on Amazon (B4, Appendix B.1)", () => {
  // Spine critics round 1 on #95 (beginner persona, widget fit): "holds 112% of the value" puzzled a beginner, a part bigger
  // than the whole, so when years 1 to 10 lose value the headline says it in money and words, and the losing side says so.
  it("opens in money, not a share above 100%: after year 10 is worth more than the whole value, because years 1 to 10 lose", () => {
    const model = terminalSeesawModel(data, atCase);
    expect(`${model.headline.before}${model.headline.key}${model.headline.after}`).toBe(
      "After year 10 is worth $16.9bn today, more than the whole value, because years 1 to 10 lose $1.8bn",
    );
    expect(model.headline.key).toBe("$16.9bn");
    expect(model.share).toBeCloseTo(1.12, 2);
    expect(model.numbers).toEqual([
      { label: "Terminal value at year 10", text: "$52.1bn" },
      { label: "Value a share", text: "$35" },
    ]);
    expect(model.sides![0].value).toBeCloseTo(-1_767, -1);
    expect(model.sides![1].value).toBeCloseTo(16_924, -1);
    expect(model.sides!.map((s) => s.text)).toEqual(["-$1.8bn", "$16.9bn"]);
    expect(model.sides!.map((s) => s.label)).toEqual(["Years 1 to 10, a loss", "After year 10"]);
    expect(model.tilt).toBeGreaterThan(0);
  });

  it("can never put growth after year 10 at or above the cost of capital after year 10 (B4's guard)", () => {
    const [growth, cost] = terminalSeesawLevers(data);
    expect(growth.max).toBeLessThan(cost.min);
    expect([growth.min, growth.max, growth.step, growth.opening]).toEqual([0, 7, 0.25, 6]);
    expect([cost.min, cost.max, cost.step, cost.opening]).toEqual([8, 14, 0.25, 9.61]);
    // At the nearest the sliders allow, it still has a value.
    expect(terminalSeesawModel(data, { growthAfter: growth.max, costAfter: cost.min }).share).not.toBeNull();
  });

  it("says in words, not NaN, why settings past that guard cannot be valued", () => {
    const model = terminalSeesawModel(data, { growthAfter: 10, costAfter: 9.61 });
    expect(model.share).toBeNull();
    expect(`${model.headline.before}${model.headline.after}`).toBe("These settings cannot be valued: Growth after year 10 must be below the year-10 cost of capital, or the value is infinite.");
    expect(JSON.stringify(model)).not.toMatch(/NaN|Infinity/);
    expect(terminalSeesawReading(data, { growthAfter: 10, costAfter: 9.61 }).readouts[0]).toMatch(/^Cannot be valued: Growth after year 10 must be below/);
  });

  it("asks for half the Case's growth, and to bring growth within a point of the cost of capital, both reachable", () => {
    expect(terminalSeesawTasks(data)).toEqual(["Set growth after year 10 to 3%. How much value goes?", "Bring growth within 1 point of the cost of capital"]);
    expect(terminalSeesawLevers(data)[0].chips).toEqual([3]);
    expect(terminalSeesawModel(data, { growthAfter: 3, costAfter: 9.61 }).conditions).toEqual([true, false]);
    expect(terminalSeesawModel(data, { growthAfter: 7, costAfter: 8 }).conditions).toEqual([false, true]);
  });

  it("shrinks the terminal value as growth after year 10 falls: at 3% it is 52,112 x (0.85 / 0.7) x (3.61 / 6.61)", () => {
    // Rule 7 of B1: year 11's cash flow keeps 1 - g / 20% of its profit and is divided by the cost of capital less g.
    const lower = terminalSeesawModel(data, { growthAfter: 3, costAfter: 9.61 });
    const expected = ((52_112 * (1 - 0.03 / 0.2)) / (1 - 0.06 / 0.2)) * (3.61 / 6.61) * (1.03 / 1.06);
    expect(Number(lower.numbers[0].text.replace(/[$bn]/g, "")) * 1_000).toBeCloseTo(expected, -2);
  });

  it("keeps within the Workbench budget (B2)", () => {
    const shape = terminalSeesawShape(data);
    expect(shape.controls).toBe(2);
    expect(shape.numbers).toBeLessThanOrEqual(WORKBENCH_BUDGET.numbers);
    expect(shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
  });

  it("tells the Tutor both settings, the share after year 10, the terminal value and both sides", () => {
    expect(terminalSeesawReading(data, atCase)).toEqual({
      sliders: [
        { label: "Growth after year 10", text: "6%" },
        { label: "Cost of capital after year 10", text: "9.61%" },
      ],
      readouts: [
        "Share of the value from after year 10: 112%",
        "Terminal value at year 10: $52.1bn",
        "Value a share: $35",
        "Years 1 to 10, a loss, in today's money: -$1.8bn",
        "After year 10, in today's money: $16.9bn",
      ],
    });
  });
});

describe("Terminal seesaw when years 1 to 10 add value", () => {
  it('keeps the share headline, "After year 10 holds N% of the value", when the forecast years are worth something', () => {
    const mature = valuationCaseIds()
      .map((id) => valuationCase(id)!)
      .map((b) => ({ b, levers: terminalSeesawLevers({ block: b }) }))
      .map(({ b, levers }) => ({ b, model: terminalSeesawModel({ block: b }, { growthAfter: levers[0].opening, costAfter: levers[1].opening }) }))
      .find(({ model }) => model.sides && model.sides[0].value > 0 && model.share! < 1);
    expect(mature).toBeDefined();
    const { model } = mature!;
    expect(`${model.headline.before}${model.headline.key}${model.headline.after}`).toMatch(/^After year 10 holds \d+% of the value$/);
    expect(model.sides![0].label).toBe("Years 1 to 10");
  });
});
