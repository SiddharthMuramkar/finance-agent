import { describe, expect, it } from "vitest";
import { WORKBENCH_BUDGET } from "../check";
import { multipleDecoderLevers, multipleDecoderModel, multipleDecoderReading, multipleDecoderShape, multipleDecoderTasks, multipleText, type MultipleDecoderData } from "./multiple-decoder-model";
import { multipleDecoderData } from "./registry";

// Multiple decoder (spec 2026-11-12, B4; Spine Topic 12: "A multiple hides a view on growth, risk and margins"). WeWork's $47bn
// round was 25.8 times its 2018 revenue (S-1); IWG traded at 1.56 times (its 2018 results); Damodaran held tax at 25%, sales
// to capital at 1.68 and growth after year 10 at 1.6%. With no growth at all, a business is worth what it keeps after tax
// divided by its cost of capital (a perpetuity): 20% kept, 25% tax and 10% cost of capital justify 0.2 × 0.75 / 0.1 = 1.5×.
// Each company carries an Icon and a short sourced fact (T33, F6): at 30 June 2019 WeWork had 604,000 workstations and IWG
// 602,535, two near-equal desk piles priced 26× against 1.6×.

const source = { title: "A Topic's source", url: "https://example.com/multiples" };
const data: MultipleDecoderData = {
  subject: { name: "WeWork", multiple: 25.8, source, icon: "office-building", note: "604,000 desks" },
  peers: [{ name: "IWG", multiple: 1.56, source, icon: "cityscape", note: "602,535 desks" }],
  assumptions: { taxPercent: 25, salesToCapital: 1.68, growthAfterPercent: 1.6 },
  opening: { growth: 60, risk: 7.97, margin: 12.5 },
};

describe("Multiple decoder (B4)", () => {
  it("justifies a perpetuity's 1.5× sales with no growth, 20% kept, 25% tax and a 10% cost of capital", () => {
    const flat = { ...data, assumptions: { taxPercent: 25, salesToCapital: 1.68, growthAfterPercent: 0 } };
    const model = multipleDecoderModel(flat, { growth: 0, risk: 10, margin: 20 });
    expect(model.multiple).toBeCloseTo(1.5, 6);
    expect(`${model.headline.before}${model.headline.key}${model.headline.after}`).toBe("Your settings justify 1.5× sales");
  });

  it("shows what the company and its first peer trade at beside it, and marks all three on one scale", () => {
    const model = multipleDecoderModel(data, data.opening);
    expect(model.numbers).toEqual([
      { label: "WeWork trades at", text: "26×" },
      { label: "IWG trades at", text: "1.6×" },
    ]);
    expect(model.marks.map((m) => [m.label, m.yours])).toEqual([
      ["Yours", true],
      ["WeWork", false],
      ["IWG", false],
    ]);
  });

  it("justifies more with more growth, less risk or a wider margin", () => {
    const at = (s: Partial<typeof data.opening>) => multipleDecoderModel(data, { ...data.opening, ...s }).multiple!;
    const base = at({});
    expect(at({ growth: 70 })).toBeGreaterThan(base);
    expect(at({ risk: 7 })).toBeGreaterThan(base);
    expect(at({ margin: 15 })).toBeGreaterThan(base);
  });

  it("writes a multiple as the Widget shows it, and none below zero", () => {
    expect([multipleText(25.8), multipleText(1.56), multipleText(-3), multipleText(0)]).toEqual(["26×", "1.6×", "0×", "0×"]);
    const model = multipleDecoderModel(data, { ...data.opening, margin: 0 });
    expect(`${model.headline.key}${model.headline.after}`).toBe("0×: growth that costs more than it earns");
  });

  it("asks to justify each traded multiple the levers can reach, and ticks within a tenth of it", () => {
    expect(multipleDecoderTasks(data)).toEqual(["Find settings that justify WeWork's 26×", "Find settings that justify IWG's 1.6×"]);
    // A multiple no setting reaches is not asked for (B7).
    expect(multipleDecoderTasks({ ...data, subject: { ...data.subject, multiple: 5_000 } })).toEqual(["Find settings that justify IWG's 1.6×"]);
    const near = (target: number) => {
      const levers = multipleDecoderLevers(data);
      const margin = levers[2];
      for (let m = margin.min; m <= margin.max; m += margin.step) {
        const model = multipleDecoderModel(data, { ...data.opening, growth: 10, margin: m });
        if (model.multiple !== null && Math.abs(model.multiple - target) <= 0.1 * target) return model;
      }
      return null;
    };
    expect(near(1.56)?.conditions).toEqual([false, true]);
  });

  it("keeps the cost of capital at least a point above growth after year 10, so the engine always has a value", () => {
    const [, risk] = multipleDecoderLevers(data);
    expect(risk.min).toBeGreaterThanOrEqual(data.assumptions.growthAfterPercent + 1);
    expect(multipleDecoderData({ ...data, assumptions: { ...data.assumptions, growthAfterPercent: 9 }, opening: { ...data.opening, risk: 8 } })).toMatchObject({
      problem: expect.stringMatching(/growth after year 10 must be below the opening cost of capital/),
    });
  });

  it("gives each company's mark the Topic file's Icon and short fact, and the Learner's own mark neither (T33, F6)", () => {
    const model = multipleDecoderModel(data, data.opening);
    expect(model.marks.map((m) => [m.label, m.icon, m.note])).toEqual([
      ["Yours", undefined, undefined],
      ["WeWork", "office-building", "604,000 desks"],
      ["IWG", "cityscape", "602,535 desks"],
    ]);
    // Both are optional: a Topic file that gives neither draws the scale it drew before.
    const bare = multipleDecoderModel({ ...data, subject: { name: "WeWork", multiple: 25.8, source }, peers: [{ name: "IWG", multiple: 1.56, source }] }, data.opening);
    expect(bare.marks.every((m) => m.icon === undefined && m.note === undefined)).toBe(true);
  });

  it("refuses a picture that is not an Icon name, and a fact too long to stand on a row", () => {
    expect(multipleDecoderData({ ...data, subject: { ...data.subject, icon: "pizza-slice" } })).toMatchObject({ problem: expect.stringMatching(/is not an Icon name/) });
    expect(multipleDecoderData({ ...data, subject: { ...data.subject, note: "604,000 desks in 528 locations" } })).toMatchObject({ problem: expect.stringMatching(/subject\.note/) });
  });

  it("keeps within the Workbench budget (B2), counting each fact as words of the one visual, not as a number at rest", () => {
    const shape = multipleDecoderShape(data);
    expect(shape.controls).toBe(3);
    expect(shape.visuals).toBe(1);
    expect(shape.numbers).toBeLessThanOrEqual(WORKBENCH_BUDGET.numbers);
    expect(shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
    expect(shape.tasks).toBeLessThanOrEqual(WORKBENCH_BUDGET.tasks);
    // The two facts are four of those words; without them the Workbench is the 20 words it was before.
    const bare = multipleDecoderShape({ ...data, subject: { name: "WeWork", multiple: 25.8, source }, peers: [{ name: "IWG", multiple: 1.56, source }] });
    expect([bare.words, shape.words]).toEqual([20, 24]);
    expect(bare.numbers).toBe(shape.numbers);
  });

  it("tells the Tutor the multiple justified, each traded one with its source, and what it holds still", () => {
    const { readouts } = multipleDecoderReading(data, data.opening);
    expect(readouts[0]).toMatch(/^Justified multiple of revenue: \d+(\.\d)?×$/);
    expect(readouts.slice(1)).toEqual([
      "WeWork trades at 26× revenue (sourced: A Topic's source)",
      "IWG trades at 1.6× revenue (sourced: A Topic's source)",
      "Holding tax at 25%, 1.68 of sales for each unit invested and growth after year 10 at 1.6%",
    ]);
  });
});
