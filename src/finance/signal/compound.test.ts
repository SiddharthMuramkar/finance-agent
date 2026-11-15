import { describe, expect, it } from "vitest";
import { compoundChart, compoundReading, compoundYear } from "./compound";

// Expected values are the acceptance table in the Signal spec §6.4.4 (₹1,000 at 10% a year),
// whole rupees as the widget shows them.
const ACCEPTANCE = [
  { years: 1, balance: 1_100, growth: 100, added: 100, simple: 100, onGrowth: 0 },
  { years: 3, balance: 1_331, growth: 331, added: 121, simple: 300, onGrowth: 31 },
  { years: 8, balance: 2_144, growth: 1_144, added: 195, simple: 800, onGrowth: 344 },
  { years: 10, balance: 2_594, growth: 1_594, added: 236, simple: 1_000, onGrowth: 594 },
  { years: 15, balance: 4_177, growth: 3_177, added: 380, simple: 1_500, onGrowth: 1_677 },
  { years: 22, balance: 8_140, growth: 7_140, added: 740, simple: 2_200, onGrowth: 4_940 },
  { years: 30, balance: 17_449, growth: 16_449, added: 1_586, simple: 3_000, onGrowth: 13_449 },
];

describe("compounding ₹1,000 at 10%: the year model (spec §6.4.4)", () => {
  it.each(ACCEPTANCE)("after $years years the balance is ₹$balance", ({ years, balance }) => {
    expect(Math.round(compoundYear(years).balance)).toBe(balance);
  });

  it.each(ACCEPTANCE)("after $years years the growth is ₹$growth", ({ years, growth }) => {
    expect(Math.round(compoundYear(years).growth)).toBe(growth);
  });

  it.each(ACCEPTANCE)("year $years alone adds ₹$added", ({ years, added }) => {
    expect(Math.round(compoundYear(years).added)).toBe(added);
  });

  it.each(ACCEPTANCE)(
    "after $years years ₹$simple is earned on the ₹1,000 and ₹$onGrowth on earlier growth",
    ({ years, simple, onGrowth }) => {
      const year = compoundYear(years);
      expect(Math.round(year.simple)).toBe(simple);
      expect(Math.round(year.onGrowth)).toBe(onGrowth);
    },
  );

  it("splits the growth into two parts that add back to it, with no part below zero", () => {
    for (let t = 1; t <= 30; t++) {
      const { growth, simple, onGrowth } = compoundYear(t);
      expect(simple + onGrowth).toBeCloseTo(growth, 9);
      expect(onGrowth).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("compounding ₹1,000 at 10%: the chart (spec §6.4.1, §6.4.2)", () => {
  it("has one column for each year from 1 to 30, in order", () => {
    expect(compoundChart().columns.map((c) => c.year)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("scales to the year-30 balance, ₹17,449.40", () => {
    expect(compoundChart().max).toBeCloseTo(17_449.4, 2);
  });

  it("marks the doubling years 8, 15, 22 and 30 as 2×, 4×, 8× and 16×", () => {
    expect(compoundChart().doublings).toEqual([
      { year: 8, label: "2×" },
      { year: 15, label: "4×" },
      { year: 22, label: "8×" },
      { year: 30, label: "16×" },
    ]);
  });
});

describe("compounding ₹1,000 at 10%: the reading (spec §6.4.2, QA §13)", () => {
  it("QA 13: at 30 years reads ₹17,449, growth ₹16,449, and year 30 alone added ₹1,586", () => {
    const reading = compoundReading(30, false);
    expect(reading.balance).toBe("₹17,449");
    expect(reading.growth).toBe("₹16,449");
    expect(reading.added).toBe("₹1,586");
  });

  it("unsplit, the segmented bar is the ₹1,000 put in and one block of growth", () => {
    expect(compoundReading(30, false).segments).toEqual([
      { part: "putIn", label: "What you put in", value: 1000, text: "₹1,000" },
      { part: "growth", label: "Growth", value: expect.closeTo(16_449.4, 2), text: "₹16,449" },
    ]);
    expect(compoundReading(30, false).split).toBeUndefined();
  });

  it("QA 14: split at 30 years, the bar shows ₹3,000 on the ₹1,000 and ₹13,449 on earlier growth, in three keyed parts", () => {
    const reading = compoundReading(30, true);
    expect(reading.segments).toEqual([
      { part: "putIn", label: "What you put in", value: 1000, text: "₹1,000" },
      { part: "simple", label: "Earned on your ₹1,000", value: expect.closeTo(3000, 9), text: "₹3,000" },
      { part: "onGrowth", label: "Earned on earlier growth", value: expect.closeTo(13_449.4, 2), text: "₹13,449" },
    ]);
    expect(reading.split).toEqual({ simple: "₹3,000", onGrowth: "₹13,449" });
  });

  it.each(ACCEPTANCE)(
    "after $years years the split reading shows the §6.4.4 row in whole rupees",
    ({ years, balance, growth, added, simple, onGrowth }) => {
      const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
      expect(compoundReading(years, true)).toMatchObject({
        balance: rupees(balance),
        growth: rupees(growth),
        added: rupees(added),
        split: { simple: rupees(simple), onGrowth: rupees(onGrowth) },
      });
    },
  );

  it.each([
    [1, "1 year"],
    [3, "3 years"],
    [30, "30 years"],
  ])("names %i years as %s, as the slider output does", (years, text) => {
    expect(compoundReading(years, false).yearsText).toBe(text);
  });

  it.each([0, 31, 2.5, Number.NaN])("refuses %s years: the slider runs 1 to 30 in whole years", (years) => {
    expect(() => compoundReading(years, false)).toThrow(RangeError);
    expect(() => compoundYear(years)).toThrow(RangeError);
  });

  it("split mode does not change the balance, the growth or what the year added", () => {
    const { balance, growth, added } = compoundReading(30, true);
    expect({ balance, growth, added }).toEqual({ balance: "₹17,449", growth: "₹16,449", added: "₹1,586" });
  });
});
