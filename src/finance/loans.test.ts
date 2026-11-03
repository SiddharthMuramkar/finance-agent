import { describe, expect, it } from "vitest";
import { amortizationSchedule, emi } from "./loans";

// Cases marked "ported" come from github.com/sarveshtalele/personal-finance-mcp
// (MIT, tests/test_debt.py, read 2026-11-02) and were checked against a published value.

describe("EMI", () => {
  it("ported: 50,00,000 at 8.5% for 20 years is 43,391.16 a month (checked: bank EMI tables show about 43,391 per 50 lakh)", () => {
    expect(emi(5_000_000, 8.5, 20)).toBeCloseTo(43_391.16, 2);
  });

  it("1,00,000 at 12% for one year is 8,884.88 a month (the standard 12-month loan table figure)", () => {
    expect(emi(100_000, 12, 1)).toBeCloseTo(8884.88, 2);
  });

  it("ported: a zero-rate loan is the principal split evenly", () => {
    expect(emi(1_200_000, 0, 10)).toBe(10_000);
  });
});

describe("amortization schedule", () => {
  const schedule = amortizationSchedule(100_000, 12, 1);

  it("has one row a month, the first month's interest is 1% of the principal", () => {
    expect(schedule.rows).toHaveLength(12);
    expect(schedule.rows[0].month).toBe(1);
    expect(schedule.rows[0].interest).toBeCloseTo(1000, 2);
    expect(schedule.rows[0].principalPaid).toBeCloseTo(7884.88, 2);
  });

  it("ported: the balance falls every month and ends at zero", () => {
    const balances = schedule.rows.map((r) => r.balance);
    expect(balances.every((b, i) => i === 0 || b < balances[i - 1])).toBe(true);
    expect(balances.at(-1)).toBeCloseTo(0, 6);
  });

  it("total interest is 12 payments less the principal: 6,618.55 (checked: 12 x 8,884.88 - 1,00,000)", () => {
    expect(schedule.totalInterest).toBeCloseTo(6618.55, 1);
  });
});
