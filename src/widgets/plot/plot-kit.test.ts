import { describe, expect, it } from "vitest";
import { domainOf, growSeen } from "./domain";
import { formatAxis, formatValue } from "./format";
import { bandScale, dateMs, linearScale, logScale, logTicks, niceTicks, timeMarks, timeScale } from "./scales";

describe("niceTicks", () => {
  it("steps by 1, 2, 2.5 or 5 times a power of ten, covering the data", () => {
    expect(niceTicks(0, 765_697, 5)).toEqual([0, 200_000, 400_000, 600_000, 800_000]);
    expect(niceTicks(0, 95_220_000, 5)).toEqual([0, 25_000_000, 50_000_000, 75_000_000, 100_000_000]);
    expect(niceTicks(3.33, 3.38, 5)).toEqual([3.32, 3.34, 3.36, 3.38]);
    for (const [lo, hi] of [[0, 7], [0, 13], [-10, 30], [100, 4467], [0.001, 0.0093]]) {
      const ticks = niceTicks(lo, hi, 5);
      const step = ticks[1] - ticks[0];
      expect(ticks[0]).toBeLessThanOrEqual(lo);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(hi);
      expect(Math.round(1e6 * (step / Math.pow(10, Math.floor(Math.log10(step)))))).toSatisfy((m: number) => [1e6, 2e6, 2.5e6, 5e6].includes(m));
    }
  });

  it("makes a range round a single value", () => {
    const ticks = niceTicks(5, 5, 5);
    expect(ticks[0]).toBeLessThan(5);
    expect(ticks.at(-1)!).toBeGreaterThan(5);
    expect(niceTicks(0, 0, 3).length).toBeGreaterThan(1);
  });

  it("puts a log axis on powers of ten across many decades, and 1, 2, 5 across few", () => {
    expect(logTicks(100, 4467)).toEqual([100, 200, 500, 1000, 2000, 5000]);
    expect(logTicks(1, 1_000_000)).toEqual([1, 10, 100, 1000, 10_000, 100_000, 1_000_000]);
  });
});

describe("scales", () => {
  it("maps linearly, and back", () => {
    const s = linearScale(0, 100, 180, 0);
    expect(s(0)).toBe(180);
    expect(s(100)).toBe(0);
    expect(s.invert(90)).toBe(50);
    expect(linearScale(5, 5, 0, 10)(5)).toBe(5);
  });

  it("maps a log scale so that equal ratios are equal distances", () => {
    const s = logScale(1, 1000, 0, 300);
    expect(s(10)).toBeCloseTo(100);
    expect(s(100)).toBeCloseTo(200);
    expect(() => logScale(0, 10, 0, 1)).toThrow();
  });

  it("maps a time scale by the date", () => {
    const t = timeScale(dateMs("1979-04-03"), dateMs("1992-03-31"), 10, 590);
    expect(t(dateMs("1979-04-03"))).toBe(10);
    expect(t(dateMs("1992-03-31"))).toBe(590);
    expect(dateMs("1992")).toBe(Date.UTC(1992, 0, 1));
    expect(dateMs("soon")).toBeNaN();
  });

  it("caps a band's width and keeps it centred in its slot", () => {
    const band = bandScale(2, 0, 600, 0.2, 48);
    expect(band.bandwidth).toBe(48);
    expect(band.center(0)).toBe(150);
    expect(band.start(0)).toBe(126);
    expect(bandScale(30, 0, 600, 0.2, 48).bandwidth).toBeCloseTo(16);
    expect(band.nearest(449)).toBe(1);
  });

  it("labels a long span by month at its ends with round years between, and a short span by its dates", () => {
    const long = timeMarks(dateMs("1979-04-03"), dateMs("1992-03-31"), "a", "b");
    expect(long.map((m) => m.text)).toEqual(["Apr 1979", "1985", "Mar 1992"]);
    const short = timeMarks(dateMs("2018-10-22"), dateMs("2018-10-24"), "2018-10-22", "2018-10-24");
    expect(short.map((m) => m.text)).toEqual(["2018-10-22", "2018-10-24"]);
  });
});

describe("formatAxis and formatValue", () => {
  it("writes rupees in lakh and crore, never K or M", () => {
    expect(formatAxis(800_000, "inr")).toBe("₹8 L");
    expect(formatAxis(120_000_000, "inr")).toBe("₹12 Cr");
    expect(formatAxis(12_000_000, "inr")).toBe("₹1.2 Cr");
    expect(formatAxis(0, "inr")).toBe("₹0");
    expect(formatAxis(40_000, "inr")).toBe("₹40,000");
    for (const v of [0, 50_000, 200_000, 1_000_000, 50_000_000, 2_000_000_000]) expect(formatAxis(v, "inr")).not.toMatch(/[KM]\b/);
    expect(formatValue(4000, "inr")).toBe("₹4,000");
    expect(formatValue(765_697, "rupees")).toBe("₹7,65,697");
  });

  it("writes dollars, percents and plain numbers", () => {
    expect(formatAxis(50_000_000, "usd")).toBe("$50 m");
    expect(formatAxis(1_500_000_000, "usd")).toBe("$1.5 bn");
    expect(formatAxis(3, "percent")).toBe("3 %");
    expect(formatValue(3.38, "percent")).toBe("3.38 %");
    expect(formatValue(1234.5)).toBe("1,234.5");
    expect(formatAxis(2193)).toBe("2,193");
  });
});

describe("the sticky domain", () => {
  it("only grows while the key stays, and starts over when it changes", () => {
    let seen = growSeen(null, "a", [100], true);
    expect(domainOf(seen).max).toBe(100);
    seen = growSeen(seen, "a", [50], true);
    expect(domainOf(seen).max).toBe(100);
    seen = growSeen(seen, "a", [180], true);
    expect(domainOf(seen).max).toBeGreaterThanOrEqual(180);
    seen = growSeen(seen, "b", [50], true);
    expect(domainOf(seen).max).toBeLessThan(100);
  });

  it("widens to the author's yMin and yMax", () => {
    const d = domainOf(growSeen(null, 0, [3, 4], true), { yMin: -10, yMax: 30 });
    expect(d.min).toBeLessThanOrEqual(-10);
    expect(d.max).toBeGreaterThanOrEqual(30);
  });

  it("can leave zero out for a line", () => {
    expect(domainOf(growSeen(null, 0, [3300, 4467], false)).min).toBeGreaterThan(0);
  });
});
