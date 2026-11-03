import { describe, expect, it } from "vitest";
import {
  annuityFutureValue,
  annuityPresentValue,
  compoundAmount,
  effectiveAnnualRate,
  inflationAdjusted,
  internalRateOfReturn,
  netPresentValue,
  nominalRate,
  perpetuityValue,
  realRate,
  ruleOf72,
} from "./tvm";

// Time value of money. Cases marked "ported" come from the MIT-licensed test suite of
// github.com/sarveshtalele/personal-finance-mcp (tests/test_tvm.py, file read 2026-11-02);
// each was then checked against a published or hand-worked value, named beside it.
// Rates are yearly percentages.

describe("compound amount (future value of a lump sum)", () => {
  it("ported: 1,00,000 at 10% for 5 years is 1,61,051 (checked: 1.1^5 = 1.61051, the standard compound-interest table)", () => {
    expect(compoundAmount(100_000, 10, 5, 1)).toBeCloseTo(161_051, 2);
  });

  it("ported: monthly compounding at 12% for 10 years is 3,30,038.69 (checked: 1.01^120 = 3.300387 in the 1% interest table)", () => {
    expect(compoundAmount(100_000, 12, 10, 12)).toBeCloseTo(330_038.69, 2);
  });

  it("ported: continuous compounding gives P e^(rt) (checked: e^0.5 = 1.648721)", () => {
    expect(compoundAmount(100_000, 10, 5, "continuous")).toBeCloseTo(164_872.13, 2);
  });
});

describe("annuities", () => {
  it("future value of 10,000 a month for 10 years at 12%: 23,00,386.9 paid at month end, 23,23,390.76 at month start (checked: the SIP factor (1.01^120-1)/0.01 = 230.0387)", () => {
    expect(annuityFutureValue(10_000, 12, 120, 12, "end")).toBeCloseTo(2_300_386.9, 1);
    expect(annuityFutureValue(10_000, 12, 120, 12, "start")).toBeCloseTo(2_323_390.76, 1);
  });

  it("present value of 1,000 a year for 10 years at 8%, paid at year end, is 6,710.08 (checked: annuity factor 6.7101 in the standard table)", () => {
    expect(annuityPresentValue(1000, 8, 10, 1, "end")).toBeCloseTo(6710.08, 2);
  });

  it("present value of the same annuity paid at the start is the end value times 1.08", () => {
    expect(annuityPresentValue(1000, 8, 10, 1, "start")).toBeCloseTo(7246.89, 2);
  });

  it("a zero rate just adds the payments up", () => {
    expect(annuityFutureValue(1000, 0, 12, 12, "end")).toBe(12_000);
    expect(annuityPresentValue(1000, 0, 12, 12, "end")).toBe(12_000);
  });
});

describe("perpetuities", () => {
  it("ported: 10,000 a year forever at 10% is worth 1,00,000", () => {
    expect(perpetuityValue(10_000, 10)).toBe(100_000);
  });

  it("ported: growing at 3% it is worth 10,000 / (0.10 - 0.03) = 1,42,857.14", () => {
    expect(perpetuityValue(10_000, 10, 3)).toBeCloseTo(142_857.14, 2);
  });

  it("ported: refuses growth at or above the discount rate", () => {
    expect(() => perpetuityValue(10_000, 5, 10)).toThrow(/growth/i);
    expect(() => perpetuityValue(10_000, 5, 5)).toThrow(/growth/i);
  });
});

describe("rates", () => {
  it("ported: 12% nominal compounded monthly is 12.6825% effective (checked: 1.01^12 - 1 = 0.126825, the textbook figure)", () => {
    expect(effectiveAnnualRate(12, 12)).toBeCloseTo(12.6825, 4);
  });

  it("the nominal rate for 12.6825% effective, monthly, is 12%", () => {
    expect(nominalRate(12.682503, 12)).toBeCloseTo(12, 4);
  });

  it("annual compounding leaves the rate as it is", () => {
    expect(effectiveAnnualRate(10, 1)).toBeCloseTo(10, 10);
  });

  it("ported: 12% nominal with 6% inflation is a 5.6604% real return (checked: Fisher, 1.12/1.06 - 1)", () => {
    expect(realRate(12, 6)).toBeCloseTo(5.6604, 4);
  });

  it("ported: 1,00,000 today costs 1,79,084.77 in 10 years at 6% inflation (checked: 1.06^10 = 1.790848)", () => {
    expect(inflationAdjusted(100_000, 6, 10)).toBeCloseTo(179_084.77, 2);
  });

  it("ported: the rule of 72 gives 6 years at 12% and 9 years at 8%", () => {
    expect(ruleOf72(12)).toBe(6);
    expect(ruleOf72(8)).toBe(9);
  });
});

describe("net present value and internal rate of return", () => {
  it("NPV counts the first cash flow as today: -1,000 now then 500, 400, 300, 200 at 10% is 147.12 (worked by hand: 454.55 + 330.58 + 225.39 + 136.60 - 1,000)", () => {
    expect(netPresentValue(10, [-1000, 500, 400, 300, 200])).toBeCloseTo(147.12, 2);
  });

  it("IRR of -70,000 then 12,000, 15,000, 18,000, 21,000, 26,000 is 8.66% (Microsoft Excel IRR documentation example)", () => {
    expect(internalRateOfReturn([-70_000, 12_000, 15_000, 18_000, 21_000, 26_000])).toBeCloseTo(8.66, 2);
  });

  it("discounting at the IRR makes the NPV zero", () => {
    const flows = [-1000, 500, 400, 300, 200];
    expect(netPresentValue(internalRateOfReturn(flows), flows)).toBeCloseTo(0, 6);
  });

  it("IRR needs both an outflow and an inflow", () => {
    expect(() => internalRateOfReturn([100, 200])).toThrow();
  });
});
