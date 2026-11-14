import { describe, expect, it } from "vitest";
import { growthScaledTo, marginPath, matureRateScaled, riskScaled } from "./dcf-paths";

// Amazon's paths are Damodaran's (HighGrow.pdf, February 2000) as spec 2026-11-12, Appendix B.1 gives them.
const amazonGrowth = [1.5, 1, 0.75, 0.5, 0.3, 0.252, 0.204, 0.156, 0.108, 0.06];
const amazonCostOfCapital = [0.1284, 0.1284, 0.1284, 0.1283, 0.1281, 0.1213, 0.1162, 0.1108, 0.1049, 0.0961];
const year10 = (base: number, growth: number[]) => growth.reduce((revenue, g) => revenue * (1 + g), base);

describe("margin path", () => {
  it("closes half the gap each year: Amazon's -36.71% heading for 10% is -13.355% in year 1 and 9.95% in year 10 (Appendix B.1)", () => {
    const path = marginPath(-0.3671, 0.1);
    expect(path).toHaveLength(10);
    expect(path[0]).toBeCloseTo(-0.13355, 10);
    expect(path[9]).toBeCloseTo(0.1 - 0.4671 / 1024, 10);
    expect((path[9] * 100).toFixed(2)).toBe("9.95");
  });

  it("takes the number of years, and stays put when it starts on its target", () => {
    expect(marginPath(0, 0.08, 3)).toEqual([0.04, 0.06, 0.07]);
    expect(marginPath(0.1, 0.1)).toEqual(Array(10).fill(0.1));
  });
});

describe("growth path scaled to a year-10 revenue", () => {
  it("gives back Amazon's own path for its own year-10 revenue of 39,006", () => {
    const own = year10(1117, amazonGrowth);
    growthScaledTo(1117, amazonGrowth, own)!.forEach((g, i) => expect(g).toBeCloseTo(amazonGrowth[i], 12));
  });

  it("reaches $60bn by multiplying every year's rate by one factor, so the path keeps its shape", () => {
    const scaled = growthScaledTo(1117, amazonGrowth, 60_000)!;
    expect(year10(1117, scaled)).toBeCloseTo(60_000, 6);
    const factor = scaled[0] / amazonGrowth[0];
    expect(factor).toBeGreaterThan(1);
    scaled.forEach((g, i) => expect(g).toBeCloseTo(factor * amazonGrowth[i], 12));
  });

  it("shrinks the rates for a smaller company, down to below the base year's revenue", () => {
    expect(year10(1117, growthScaledTo(1117, amazonGrowth, 10_000)!)).toBeCloseTo(10_000, 6);
    const shrinking = growthScaledTo(1117, amazonGrowth, 1000)!;
    expect(shrinking[0]).toBeLessThan(0);
    expect(year10(1117, shrinking)).toBeCloseTo(1000, 6);
  });

  it("falls 10% a year to 34.87 from 100; reaching 50 instead needs a factor of (1 - 0.5^0.1) / 0.1 = 0.6697 (by hand)", () => {
    const scaled = growthScaledTo(100, Array(10).fill(-0.1), 50)!;
    expect(scaled[0] / -0.1).toBeCloseTo((1 - 0.5 ** 0.1) / 0.1, 10);
  });

  it("stays on the Case's side of the peak: 100 x (1 + k)(1 - k/2) is 105 at k = 0.1127 and k = 0.8873, and the Case (k = 1) is nearer 0.8873", () => {
    const growth = [1, -0.5, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(growthScaledTo(100, growth, 105)![0]).toBeCloseTo((1 + Math.sqrt(0.6)) / 2, 10);
    // The peak is 112.5, at k = 0.5: no factor reaches more.
    expect(growthScaledTo(100, growth, 112.6)).toBeNull();
  });

  it("gives null when nothing can reach the target: a target of zero, or a path with no growth to scale", () => {
    expect(growthScaledTo(1117, amazonGrowth, 0)).toBeNull();
    expect(growthScaledTo(100, Array(10).fill(0), 200)).toBeNull();
    expect(growthScaledTo(100, Array(10).fill(0), 100)).toEqual(Array(10).fill(0));
  });
});

describe("risk lever", () => {
  it("moves year 1 to the lever and keeps year 10 at 9.61%, scaling the gaps by (lever - 9.61) / (12.84 - 9.61) (Appendix B.2)", () => {
    const at10 = riskScaled(amazonCostOfCapital, 0.1);
    expect(at10[0]).toBeCloseTo(0.1, 12);
    expect(at10[9]).toBe(0.0961);
    // Year 6: 9.61% + (12.13% - 9.61%) x 0.39 / 3.23 = 9.9143%.
    expect(at10[5]).toBeCloseTo(0.0961 + 0.0252 * (0.39 / 3.23), 12);
  });

  it("leaves the Case alone at its own 12.84%", () => {
    riskScaled(amazonCostOfCapital, 0.1284).forEach((c, i) => expect(c).toBeCloseTo(amazonCostOfCapital[i], 12));
  });

  it("moves years 1 to 9 of a flat path to the lever, since there is no gap to scale", () => {
    expect(riskScaled(Array(10).fill(0.1), 0.12)).toEqual([...Array(9).fill(0.12), 0.1]);
  });
});

describe("cost of capital after year 10 (the Terminal seesaw, spec B4)", () => {
  it("moves year 10 to the lever and keeps year 1 at 12.84%, scaling each year's gap to it by (lever - 12.84) / (9.61 - 12.84)", () => {
    const at1061 = matureRateScaled(amazonCostOfCapital, 0.1061);
    expect(at1061[0]).toBe(0.1284);
    expect(at1061[9]).toBeCloseTo(0.1061, 12);
    // Year 6: 12.84% - (12.84% - 12.13%) x 2.23 / 3.23 = 12.3498%.
    expect(at1061[5]).toBeCloseTo(0.1284 - 0.0071 * (2.23 / 3.23), 12);
  });

  it("leaves the Case alone at its own 9.61%", () => {
    matureRateScaled(amazonCostOfCapital, 0.0961).forEach((c, i) => expect(c).toBeCloseTo(amazonCostOfCapital[i], 12));
  });

  it("moves only year 10 of a flat path", () => {
    expect(matureRateScaled(Array(10).fill(0.1), 0.08)).toEqual([...Array(9).fill(0.1), 0.08]);
  });
});
