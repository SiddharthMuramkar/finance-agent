import { describe, expect, it } from "vitest";
import { valuationCase } from "../finance/valuation-cases";
import { blockRangeInputs, rangeCheck, yardstickIndustries } from "./range-check";

// The range check (spec #68, ticket #109; user story 83): each Own Case input is compared with its industry's yardsticks
// from the Market readings, and an input far outside the usual range is named with the yardstick's date and source. It
// never calls a value right or wrong (spec voice rule 7). Seam 3: plain inputs in, flags out, no screen.

const food = { market: "IN" as const, industry: "Food Processing" };

describe("the range check on an Own Case's inputs", () => {
  it("names an input far outside its industry's range, and leaves one inside alone", () => {
    // Food Processing (India, Jan 2026): operating margin 7.26%, sales to capital 2.34, cost of capital 11.97%.
    const flags = rangeCheck({ marginPercent: 45, salesToCapital: 2.4, costOfCapitalPercent: 12 }, food);
    expect(flags.map((f) => f.input)).toEqual(["operating_margin"]);
    const [margin] = flags;
    expect(margin.side).toBe("above");
    expect(margin.value).toBe(45);
    expect(margin.sentence).toBe("Your operating margin of 45% is far above Food Processing's usual 3.63% to 14.52% in India.");
    expect(margin.yardstick.id).toBe("in-food-margin");
    expect(margin.yardstick.date).toBe("2026-01-05");
    expect(margin.yardstick.sourceUrl).toBe("https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginIndia.xls");
  });

  it("flags a value far below the range as well as one far above", () => {
    const flags = rangeCheck({ marginPercent: 7, salesToCapital: 0.5, costOfCapitalPercent: 20 }, food);
    expect(flags.map((f) => [f.input, f.side])).toEqual([
      ["sales_to_capital", "below"],
      ["cost_of_capital", "above"],
    ]);
    expect(flags[0].sentence).toBe("Your sales to capital of 0.50 is far below Food Processing's usual 1.17 to 4.68 in India.");
    expect(flags[1].sentence).toBe("Your cost of capital of 20% is far above Food Processing's usual 8.97% to 14.97% in India.");
  });

  it("never calls a value right or wrong, nor gives advice", () => {
    const flags = rangeCheck({ marginPercent: -30, salesToCapital: 40, costOfCapitalPercent: 2 }, food);
    expect(flags).toHaveLength(3);
    for (const f of flags) expect(f.sentence).not.toMatch(/\b(right|wrong|correct|incorrect|mistake|error|bad|good|buy|sell|cheap|dear|overvalued|undervalued|today|current)\b/i);
  });

  it("says nothing for an input left out, or an industry with no yardsticks", () => {
    expect(rangeCheck({}, food)).toEqual([]);
    expect(rangeCheck({ marginPercent: 90 }, { market: "IN", industry: "Shipbuilding" })).toEqual([]);
    expect(rangeCheck({ marginPercent: 90 }, { market: "US", industry: "Food Processing" })).toEqual([]);
  });

  it("takes the industry by its Market reading id too, as the Own Case form's industry pick names it", () => {
    const [flag] = rangeCheck({ marginPercent: 45 }, { market: "IN", industry: "food" });
    expect(flag.sentence).toBe("Your operating margin of 45% is far above Food Processing's usual 3.63% to 14.52% in India.");
  });

  it("lists the industries an Own Case can be compared with", () => {
    expect(yardstickIndustries("IN")).toEqual(["Auto & Truck", "Food Processing", "Software (System & Application)", "Total Market (without financials)"]);
  });
});

describe("the range check on engine inputs", () => {
  it("reads the margin, sales to capital and year-1 cost of capital from a valuation block", () => {
    // Coffee Day, 2019 (course Case): margin 10.055% in year 1, sales to capital 2, cost of capital 9.4% in year 1.
    expect(blockRangeInputs(valuationCase("coffee-day-distress-2019")!)).toEqual({ marginPercent: 10.055, salesToCapital: 2, costOfCapitalPercent: 9.4 });
    expect(rangeCheck(blockRangeInputs(valuationCase("coffee-day-distress-2019")!), food)).toEqual([]);
  });

  it("flags a valuation block's margin against its industry", () => {
    const block = valuationCase("coffee-day-distress-2019")!;
    const wild = { ...block, margin: { startPercent: 45, targetPercent: 45 } };
    expect(rangeCheck(blockRangeInputs(wild), food).map((f) => f.input)).toContain("operating_margin");
  });
});
