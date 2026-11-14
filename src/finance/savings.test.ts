import { describe, expect, it } from "vitest";
import { fixedDeposit, ppfMaturity, recurringDeposit, sipMaturity } from "./savings";

// Cases marked "ported" come from github.com/sarveshtalele/personal-finance-mcp (MIT,
// tests/test_mutual_funds.py and tests/test_new_tools.py, read 2026-11-02). That project's tests mostly
// assert only "greater than zero", so the exact figures here are checked against published values.

describe("SIP (monthly, invested at the start of each month)", () => {
  it("ported: 10,000 a month at 12% for 10 years invests 12,00,000 and grows to 23,23,390.76 (checked: 10,000 x 230.0387 x 1.01)", () => {
    const sip = sipMaturity(10_000, 12, 10);
    expect(sip.invested).toBe(1_200_000);
    expect(sip.maturity).toBeCloseTo(2_323_390.76, 1);
    expect(sip.gain).toBeCloseTo(1_123_390.76, 1);
  });
});

describe("PPF (yearly deposit at the start of the year)", () => {
  it("ported: 1,50,000 a year at 7.1% for 15 years matures at 40,68,209 (checked: the figure PPF calculators publish, about 40.68 lakh)", () => {
    const ppf = ppfMaturity(150_000, 7.1, 15);
    expect(ppf.maturity).toBeCloseTo(4_068_209.22, 1);
    expect(ppf.invested).toBe(2_250_000);
    expect(ppf.interest).toBeCloseTo(1_818_209.22, 1);
  });
});

describe("fixed deposit", () => {
  it("ported: 1,00,000 at 7% for 5 years compounded quarterly is 1,41,477.82 (checked: 1.0175^20 = 1.414778)", () => {
    expect(fixedDeposit(100_000, 7, 5, "quarterly").maturity).toBeCloseTo(141_477.82, 2);
  });

  it("compounding yearly gives 1,00,000 x 1.07^5 = 1,40,255.17", () => {
    expect(fixedDeposit(100_000, 7, 5, "yearly").maturity).toBeCloseTo(140_255.17, 2);
  });
});

describe("recurring deposit (quarterly compounding)", () => {
  it("ported: 5,000 a month at 7% for 12 months matures at 62,310.66 (checked: bank formula R((1+i)^n - 1) / (1 - (1+i)^(-1/3)) with i = 1.75%, n = 4 quarters)", () => {
    const rd = recurringDeposit(5000, 7, 12);
    expect(rd.maturity).toBeCloseTo(62_310.66, 2);
    expect(rd.invested).toBe(60_000);
  });
});
