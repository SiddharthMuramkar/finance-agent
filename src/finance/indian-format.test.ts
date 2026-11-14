import { describe, expect, it } from "vitest";
import { formatInr, formatInrWords } from "./indian-format";

// Expected strings are the Indian digit grouping (last three digits, then pairs) and the
// lakh (1,00,000) and crore (1,00,00,000) units as written in Indian newspapers and by RBI.
describe("Indian formats: grouping in rupees", () => {
  it.each([
    [0, "₹0"],
    [999, "₹999"],
    [1000, "₹1,000"],
    [99_999, "₹99,999"],
    [100_000, "₹1,00,000"],
    [1_234_567, "₹12,34,567"],
    [10_000_000, "₹1,00,00,000"],
    [1_234_567_890, "₹1,23,45,67,890"],
    [4_339_116.5, "₹43,39,116.50"],
  ])("%s is %s", (amount, text) => {
    expect(formatInr(amount)).toBe(text);
  });

  it("puts the minus sign before the rupee sign", () => {
    expect(formatInr(-1_234_567)).toBe("-₹12,34,567");
  });

  it("shows no fraction for a whole amount and at most two digits otherwise", () => {
    expect(formatInr(12.345)).toBe("₹12.35");
    expect(formatInr(12)).toBe("₹12");
  });
});

describe("Indian formats: lakh and crore words", () => {
  it.each([
    [85_000, "₹85,000"],
    [99_999, "₹99,999"],
    [100_000, "₹1 lakh"],
    [235_000, "₹2.35 lakh"],
    [4_068_209, "₹40.68 lakh"],
    [10_000_000, "₹1 crore"],
    [15_000_000, "₹1.5 crore"],
    [1_234_567_890, "₹123.46 crore"],
    [250_000_000_000, "₹25,000 crore"],
  ])("%s is %s", (amount, text) => {
    expect(formatInrWords(amount)).toBe(text);
  });

  it("rolls 99.999 lakh up to a crore instead of printing 100 lakh", () => {
    expect(formatInrWords(9_999_999)).toBe("₹1 crore");
  });

  it("handles negatives", () => {
    expect(formatInrWords(-15_000_000)).toBe("-₹1.5 crore");
  });
});
