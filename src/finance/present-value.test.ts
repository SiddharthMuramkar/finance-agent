import { describe, expect, it } from "vitest";
import { formatMillions } from "@/widgets/case-data-view";
import { annuityBreakEven, annuitySchedule, presentValue } from "./present-value";

describe("Finance Calculations: present value", () => {
  it("discounts one future amount (worked example: $1,000 in 5 years at 10% is $620.92)", () => {
    expect(presentValue(1000, 10, 5)).toBeCloseTo(620.92, 2);
  });

  it("values a level annuity due (worked example: $1,000 a year for 10 years at 8%, first payment now, is $7,246.89)", () => {
    const schedule = annuitySchedule({ total: 10_000, payments: 10, growthPercent: 0, ratePercent: 8 });
    expect(schedule.rows).toHaveLength(10);
    expect(schedule.rows[0]).toEqual({ year: 0, payment: 1000, presentValue: 1000 });
    expect(schedule.presentValue).toBeCloseTo(7246.89, 2);
  });

  it("splits an advertised total into 30 payments growing 5% a year, like the 2018 Mega Millions annuity", () => {
    const schedule = annuitySchedule({ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 0 });
    // First payment = total × g / ((1 + g)^n − 1), a geometric series: about $23.13 million.
    expect(schedule.rows[0].payment / 1e6).toBeCloseTo(23.134, 2);
    expect(schedule.rows[29].payment / 1e6).toBeCloseTo(23.134 * 1.05 ** 29, 1);
    expect(schedule.presentValue).toBeCloseTo(1_537_000_000, 0);
  });

  it("is worth less the higher the rate", () => {
    const at = (r: number) => annuitySchedule({ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: r }).presentValue;
    expect(at(3)).toBeLessThan(at(1));
    expect(at(6)).toBeLessThan(at(3));
  });

  // The owner's Part 5 figures for the 2018 Mega Millions annuity against its $877.8 million cash option.
  const jackpot = { total: 1_537_000_000, payments: 30, growthPercent: 5 };
  const worth = (ratePercent: number) => formatMillions(annuitySchedule({ ...jackpot, ratePercent }).presentValue);

  it("is worth $894.9M at 3.25%, $884.1M at 3.33%, $861.7M at 3.5% and $382.9M at 10%", () => {
    expect(worth(3.25)).toBe("$894.9M");
    expect(worth(3.33)).toBe("$884.1M");
    expect(worth(3.5)).toBe("$861.7M");
    expect(worth(10)).toBe("$382.9M");
  });

  it("equals the $877.8M cash option at a break-even rate of about 3.38%", () => {
    expect(annuityBreakEven(jackpot, 877_800_000)!.toFixed(2)).toBe("3.38");
    expect(annuityBreakEven(jackpot, 877_784_124)!.toFixed(2)).toBe("3.38");
  });

  // Spec 2026-11-12, Appendix B.4: the jackpot Explorable, in millions, against the $877.78M cash option.
  describe("Appendix B.4: the jackpot Explorable", () => {
    const inMillions = { total: 1537, payments: 30, growthPercent: 5 };
    const cash = 877.78;
    const worthToday = (ratePercent: number) => annuitySchedule({ ...inMillions, ratePercent }).presentValue;

    it("pays $23.13M first and $95.22M last", () => {
      const { rows } = annuitySchedule({ ...inMillions, ratePercent: 0 });
      expect(rows[0].payment.toFixed(2)).toBe("23.13");
      expect(rows[29].payment.toFixed(2)).toBe("95.22");
    });

    it("is worth $1,537.0M at 0%, $931.4M at 2.99%, $694.0M at 5% and $382.9M at 10%", () => {
      expect([0, 2.99, 5, 10].map((rate) => worthToday(rate).toFixed(1))).toEqual(["1537.0", "931.4", "694.0", "382.9"]);
    });

    it("against the cash option, $877.8M once rounded: +$659.2M, +$53.6M, -$183.8M, -$494.9M (the table subtracts the rounded figures)", () => {
      const against = (rate: number) => (Number(worthToday(rate).toFixed(1)) - Number(cash.toFixed(1))).toFixed(1);
      expect([0, 2.99, 5, 10].map(against)).toEqual(["659.2", "53.6", "-183.8", "-494.9"]);
    });

    it("matches the cash at a break-even of 3.38%, which is 3.377% unrounded (at a flat 3.38% it is $877.4M)", () => {
      const breakEven = annuityBreakEven(inMillions, cash)!;
      expect(breakEven.toFixed(2)).toBe("3.38");
      expect(worthToday(breakEven).toFixed(1)).toBe("877.8");
      expect(worthToday(3.38).toFixed(1)).toBe("877.4");
    });
  });

  it("has no break-even when the cash is more than the payments add up to, or nothing", () => {
    expect(annuityBreakEven(jackpot, 2_000_000_000)).toBeNull();
    expect(annuityBreakEven(jackpot, 0)).toBeNull();
  });
});
