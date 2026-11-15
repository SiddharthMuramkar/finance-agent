import { describe, expect, it } from "vitest";
import { px, topRoundedBar } from "./parts";

// A chart's SVG is drawn on the server and drawn again in the browser to hydrate it, and the two must write every attribute
// alike. Node and Chrome can differ in the last digit of Math.pow, which the jackpot's and compounding's bars are built on
// (a hydration error on /examples/mega-millions-2018: 91.48770483227977 against 91.48770483227976), so every coordinate is
// written at 2 decimals.
describe("chart coordinates", () => {
  it("are rounded to 2 decimals", () => {
    expect(px(91.48770483227977)).toBe(91.49);
    expect(px(91.48770483227976)).toBe(91.49);
    expect(px(-0.004)).toBe(-0);
    expect(px(12)).toBe(12);
  });

  it("make a bar's path read the same for values that differ only in the last digit", () => {
    const server = topRoundedBar(339.5466666666667, 88.48770483227977, 10, 83.51229516772023);
    const browser = topRoundedBar(339.5466666666667, 88.48770483227976, 10, 83.51229516772024);
    expect(server).toBe(browser);
    expect(server).toBe("M339.55,172V91.49Q339.55,88.49 342.55,88.49H346.55Q349.55,88.49 349.55,91.49V172Z");
  });
});
