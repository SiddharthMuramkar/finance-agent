import { describe, expect, it } from "vitest";
import { cashYear } from "./cash-year";
import { marginPath } from "./dcf-paths";

// One year of cash (spec 2026-11-12, B4, the Cash waterfall). Expected figures are rows of Appendix B.1, Damodaran's Amazon
// of February 2000 (dollars in millions), which the paper's table of cash flows also prints.

const amazonMargins = marginPath(-36.71, 10);

describe("one year of cash", () => {
  it("Amazon's year 1: revenue 2,792.5, operating income -373, no tax, reinvestment 558, free cash flow -931, losses 873", () => {
    const year = cashYear({ lastRevenue: 1117, growthPercent: 150, marginPercent: amazonMargins[0], taxPercent: 35, salesToCapital: 3, lossesCarried: 500 });
    if (!year.ok) throw new Error(year.error);
    expect(year.revenue).toBe(2792.5);
    expect(Math.round(year.operatingIncome)).toBe(-373);
    expect(year.tax).toBe(0);
    expect(Math.abs(year.reinvestment - 558)).toBeLessThanOrEqual(1);
    expect(Math.round(year.fcf)).toBe(-931);
    expect(Math.round(year.lossesAfter)).toBe(873);
    expect(year.operatingCosts).toBeCloseTo(year.revenue - year.operatingIncome, 9);
  });

  it("Amazon's year 4, after three years run one at a time: 14,661 of revenue, 1,038 of operating income, tax 167 once the 560 of losses are used, 1,629 reinvested, -758", () => {
    let lastRevenue = 1117;
    let lossesCarried = 500;
    for (const [i, growthPercent] of [150, 100, 75].entries()) {
      const before = cashYear({ lastRevenue, growthPercent, marginPercent: amazonMargins[i], taxPercent: 35, salesToCapital: 3, lossesCarried });
      if (!before.ok) throw new Error(before.error);
      [lastRevenue, lossesCarried] = [before.revenue, before.lossesAfter];
    }
    expect(Math.round(lossesCarried)).toBe(560);
    const year = cashYear({ lastRevenue, growthPercent: 50, marginPercent: amazonMargins[3], taxPercent: 35, salesToCapital: 3, lossesCarried });
    if (!year.ok) throw new Error(year.error);
    expect(Math.round(year.revenue)).toBe(14_661);
    expect(Math.round(year.operatingIncome)).toBe(1038);
    expect(Math.round(year.tax)).toBe(167);
    expect(Math.round(year.reinvestment)).toBe(1629);
    expect(Math.round(year.fcf)).toBe(-758);
    expect(year.lossesAfter).toBe(0);
  });

  it("with no growth nothing is reinvested, so the operating income after tax is the free cash flow", () => {
    const year = cashYear({ lastRevenue: 100, growthPercent: 0, marginPercent: 15, taxPercent: 25, salesToCapital: 2 });
    expect(year.ok && [year.reinvestment, year.fcf]).toEqual([0, 11.25]);
  });

  it("says in words why inputs cannot make a year", () => {
    expect(cashYear({ lastRevenue: 100, growthPercent: 10, marginPercent: 10, taxPercent: 25, salesToCapital: 0 })).toEqual({ ok: false, error: "Sales to capital must be above zero." });
    expect(cashYear({ lastRevenue: 0, growthPercent: 10, marginPercent: 10, taxPercent: 25, salesToCapital: 2 }).ok).toBe(false);
  });
});
