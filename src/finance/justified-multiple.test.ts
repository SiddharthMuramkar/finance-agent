import { describe, expect, it } from "vitest";
import { fadingGrowth, justifiedMultiple, type JustifiedMultipleInputs } from "./justified-multiple";

// The multiple a view on growth, risk and margin justifies (spec 2026-11-12, B4, the Multiple decoder). With no growth the
// business is a level perpetuity, so its value to sales is margin x (1 - tax) / cost of capital, a sum anyone can check.

const steady: JustifiedMultipleInputs = { growthPercent: 0, costOfCapitalPercent: 10, marginPercent: 20, taxPercent: 25, salesToCapital: 2, growthAfterPercent: 0 };
const multiple = (inputs: JustifiedMultipleInputs) => {
  const result = justifiedMultiple(inputs);
  if (!result.ok) throw new Error(result.error);
  return result.multiple;
};

describe("justified multiple", () => {
  it("with no growth, 20% kept at 25% tax and a 10% cost of capital justify 1.5 times sales", () => {
    expect(multiple(steady)).toBeCloseTo(1.5, 9);
  });

  it("grows for five years at the lever, then fades in a straight line to growth after year 10", () => {
    fadingGrowth(0.3, 0.03).forEach((g, i) => expect(g).toBeCloseTo([0.3, 0.3, 0.3, 0.3, 0.3, 0.246, 0.192, 0.138, 0.084, 0.03][i], 12));
  });

  it("rises with margin and growth that earns more than it costs, and falls with risk", () => {
    const base = { ...steady, growthPercent: 20, growthAfterPercent: 3 };
    expect(multiple({ ...base, marginPercent: 25 })).toBeGreaterThan(multiple(base));
    expect(multiple({ ...base, growthPercent: 30 })).toBeGreaterThan(multiple(base));
    expect(multiple({ ...base, costOfCapitalPercent: 12 })).toBeLessThan(multiple(base));
  });

  it("falls with growth when new capital earns less than it costs: 2% kept on $1 of sales a dollar", () => {
    const poor = { ...steady, marginPercent: 2, salesToCapital: 1, growthAfterPercent: 2 };
    expect(multiple({ ...poor, growthPercent: 30 })).toBeLessThan(multiple({ ...poor, growthPercent: 5 }));
  });

  it("refuses growth after year 10 at or above the cost of capital, in words", () => {
    expect(justifiedMultiple({ ...steady, growthAfterPercent: 10 })).toEqual({
      ok: false,
      error: "Growth after year 10 must be below the year-10 cost of capital, or the value is infinite.",
    });
  });
});
