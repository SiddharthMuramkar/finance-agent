import { describe, expect, it } from "vitest";
import { calculate, calculateParts, CALCULATORS, PARTS_CALCULATOR_IDS } from "./calculators";

// The parts split MoneyStack draws (sip, emi, future_value and the deposits): each part comes from the calculator's own numbers.

describe("calculateParts", () => {
  it("splits a SIP into the money put in and its gain, which add up to the maturity value", () => {
    const parts = calculateParts("sip", { monthly: 1000, ratePercent: 10, years: 20 });
    const maturity = calculate("sip", { monthly: 1000, ratePercent: 10, years: 20 });
    if (!parts.ok || !maturity.ok) throw new Error("expected both to run");
    expect(parts.parts.map((p) => [p.label, p.tone])).toEqual([
      ["Total invested", "neutral"],
      ["Gain", "you"],
    ]);
    expect(parts.parts[0].value).toBe(240_000);
    expect(parts.total).toBeCloseTo(maturity.results[0].value, 4);
  });

  it("splits an EMI loan into principal and the interest on top, which add up to the total repaid", () => {
    const parts = calculateParts("emi", { principal: 5_000_000, ratePercent: 8.5, years: 20 });
    const loan = calculate("emi", { principal: 5_000_000, ratePercent: 8.5, years: 20 });
    if (!parts.ok || !loan.ok) throw new Error("expected both to run");
    expect(parts.parts[0]).toMatchObject({ label: "Principal", value: 5_000_000, tone: "neutral" });
    expect(parts.parts[1]).toMatchObject({ label: "Total interest", tone: "src" });
    expect(parts.total).toBeCloseTo(loan.results.find((r) => r.label === "Total repaid")!.value, 4);
  });

  it("splits a lump sum's future value into the amount and its growth", () => {
    const parts = calculateParts("future_value", { amount: 100_000, ratePercent: 10, years: 5 });
    if (!parts.ok) throw new Error("expected it to run");
    expect(parts.parts.map((p) => p.label)).toEqual(["Amount", "Growth"]);
    expect(parts.total).toBeCloseTo(161_051, 0);
  });

  it("splits the deposit calculators into invested money and interest", () => {
    for (const id of ["fixed_deposit", "recurring_deposit", "ppf"]) {
      const example = CALCULATORS.find((c) => c.id === id)!.example;
      const parts = calculateParts(id, example);
      expect(parts.ok, id).toBe(true);
      if (parts.ok) expect(parts.parts.map((p) => p.label)).toEqual(["Invested", "Interest"]);
    }
  });

  it("names exactly the calculators it can split, and says so for any other", () => {
    expect([...PARTS_CALCULATOR_IDS].sort()).toEqual(["emi", "fixed_deposit", "future_value", "ppf", "recurring_deposit", "sip"]);
    expect(calculateParts("cagr", { start: 1, end: 2, years: 1 }).ok).toBe(false);
  });

  it("returns an error, not an exception, for bad inputs", () => {
    expect(calculateParts("sip", { monthly: -5 }).ok).toBe(false);
  });

  it("reuses the existing cagr calculator for the Predict example (100 to 4285 over 13 years is about 33.5%)", () => {
    const r = calculate("cagr", { start: 100, end: 4285, years: 13 });
    if (!r.ok) throw new Error("expected it to run");
    expect(r.results[0].value).toBeCloseTo(33.5, 0);
  });
});
