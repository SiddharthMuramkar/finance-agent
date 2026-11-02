import { describe, expect, it } from "vitest";
import {
  bondDuration,
  bondPrice,
  cagr,
  currentYield,
  dcfValuation,
  dividendYield,
  gordonGrowth,
  twoStageDdm,
  yieldToMaturity,
} from "./valuation";

// Cases marked "ported" come from github.com/sarveshtalele/personal-finance-mcp (MIT,
// tests/test_bonds.py and tests/test_stocks.py, read 2026-11-02), then checked against a
// textbook value or worked by hand, as named beside each.

describe("bonds", () => {
  it("a 1,000 bond, 8% coupon paid twice a year, 5 years, at a 10% yield costs 922.78 (the standard textbook bond-pricing example)", () => {
    expect(bondPrice(1000, 8, 10, 5, 2)).toBeCloseTo(922.78, 2);
  });

  it("ported: it sells at par when the coupon equals the yield, above par when the coupon is higher", () => {
    expect(bondPrice(1000, 8, 8, 5, 2)).toBeCloseTo(1000, 6);
    expect(bondPrice(1000, 10, 8, 5, 2)).toBeGreaterThan(1000);
  });

  it("a zero-coupon bond is face / (1 + y/2)^(2 x years): 1,000 at 6% for 10 years is 553.68", () => {
    expect(bondPrice(1000, 0, 6, 10, 2)).toBeCloseTo(553.68, 2);
  });

  it("ported: current yield is the yearly coupon over the price, 80 / 950 = 8.4211%", () => {
    expect(currentYield(80, 950)).toBeCloseTo(8.4211, 4);
  });

  it("ported: the yield to maturity of the 922.78 bond is 10%", () => {
    expect(yieldToMaturity(1000, 8, 922.78, 5, 2)).toBeCloseTo(10, 3);
  });

  it("ported: the yield to maturity is below the coupon for a bond above par", () => {
    expect(yieldToMaturity(1000, 10, 1081.11, 5, 2)).toBeLessThan(10);
  });

  it("Macaulay duration of a par bond is (1+y)/y x (1 - (1+y)^-n) periods: 8.4356 half-years, 4.2178 years, for 8% coupon, 5 years, semi-annual; modified is that over 1.04 half-years", () => {
    const d = bondDuration(1000, 8, 8, 5, 2);
    expect(d.macaulay).toBeCloseTo(4.2178, 3);
    expect(d.modified).toBeCloseTo(4.2178 / 1.04, 3);
  });
});

describe("dividend discount models", () => {
  it("ported: D0 = 5, growth 8%, required return 15%: 5 x 1.08 / 0.07 = 77.14", () => {
    expect(gordonGrowth(5, 8, 15)).toBeCloseTo(77.14, 2);
  });

  it("ported: refuses growth at or above the required return", () => {
    expect(() => gordonGrowth(5, 15, 10)).toThrow(/growth/i);
  });

  it("two stages: D0 = 1, 10% growth for 2 years, then 5% forever, 15% required, is worth 11.478 (by hand: 1.1/1.15 + (1.21 + 12.705)/1.15^2)", () => {
    expect(twoStageDdm(1, 10, 2, 5, 15)).toBeCloseTo(11.478, 3);
  });

  it("dividend yield is dividend over price: 10 on 200 is 5%", () => {
    expect(dividendYield(10, 200)).toBe(5);
  });
});

describe("discounted cash flow", () => {
  it("free cash flows 100 then 120 at 10%, terminal growth 2%: enterprise value 1,454.55 (by hand: (100 x 1.1 + 120 + 1,530) / 1.21)", () => {
    expect(dcfValuation({ cashFlows: [100, 120], ratePercent: 10, terminalGrowthPercent: 2 }).enterpriseValue).toBeCloseTo(1454.55, 2);
  });

  it("subtracts net debt and divides by shares: (1,454.55 - 500) / 10 = 95.45 a share", () => {
    const v = dcfValuation({ cashFlows: [100, 120], ratePercent: 10, terminalGrowthPercent: 2, netDebt: 500, shares: 10 });
    expect(v.equityValue).toBeCloseTo(954.55, 2);
    expect(v.perShare).toBeCloseTo(95.45, 2);
  });

  it("ported: refuses a terminal growth rate at or above the discount rate", () => {
    expect(() => dcfValuation({ cashFlows: [100], ratePercent: 3, terminalGrowthPercent: 5 })).toThrow(/growth/i);
  });
});

describe("growth", () => {
  it("CAGR of money that doubles in 5 years is 14.87% (checked: 2^0.2 = 1.1487)", () => {
    expect(cagr(100, 200, 5)).toBeCloseTo(14.87, 2);
  });
});
