import { describe, expect, it } from "vitest";
import { rateChange, rateChangeReadouts } from "./rate-change";

describe("one rate change said three ways", () => {
  it("gives points, basis points and the percent change of the old rate, without float noise", () => {
    expect(rateChange(6, 6.4)).toEqual({ points: 0.4, basisPoints: 40, percentChange: 6.67 });
    expect(rateChange(0.5, 0.9)).toEqual({ points: 0.4, basisPoints: 40, percentChange: 80 });
    expect(rateChange(8, 7.1)).toEqual({ points: -0.9, basisPoints: -90, percentChange: -11.25 });
    expect(rateChange(3, 3.25)).toEqual({ points: 0.25, basisPoints: 25, percentChange: 8.33 });
    expect(rateChange(0.3, 0.1 + 0.2)).toEqual({ points: 0, basisPoints: 0, percentChange: 0 });
  });

  it("has no percent change from a 0% rate", () => {
    expect(rateChange(0, 1)).toEqual({ points: 1, basisPoints: 100, percentChange: null });
    expect(rateChangeReadouts(0, 1).at(-1)).toBe("As a percent change of the old rate: none, because the old rate is 0%");
  });

  it("words the readouts as Percent's Widget does", () => {
    expect(rateChangeReadouts(5, 5.2)).toEqual(["In percentage points: 0.2 points", "In basis points: 20 bp", "As a percent change of the old rate: 4%"]);
  });
});
