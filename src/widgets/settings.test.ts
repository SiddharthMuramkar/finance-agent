import { describe, expect, it } from "vitest";
import { applySettings, cleanSettings, declaredSettings, settingsFrom } from "./settings";

const code = `root = Widget("Cash now or later", [rate, years])
$rate = 5
$years = 30
rate = Slider("rate", "Rate", 0, 10, 0.25, $rate, "percent")
years = Slider("years", "Years", 1, 40, 1, $years, "years")`;

describe("a Widget's settings", () => {
  it("are the numeric $variables its code declares", () => {
    expect(declaredSettings(code)).toEqual({ $rate: 5, $years: 30 });
  });

  it("are read from a Renderer snapshot as numbers only", () => {
    expect(settingsFrom({ $rate: 7.5, $name: "x", rate: { value: 3 }, $bad: Number.NaN })).toEqual({ $rate: 7.5 });
  });

  it("are cut down to what the code declares, so the browser cannot add anything", () => {
    expect(cleanSettings(code, { $rate: 8, $other: 1, $years: "9", constructor: 4 })).toEqual({ $rate: 8 });
    expect(cleanSettings(code, null)).toEqual({});
    expect(cleanSettings(code, [1, 2])).toEqual({});
  });

  it("reopen by replacing the starting numbers, leaving everything else as it was", () => {
    const reopened = applySettings(code, { $rate: 8, $years: 12.5, $unknown: 3 });
    expect(reopened).toContain("$rate = 8\n");
    expect(reopened).toContain("$years = 12.5\n");
    expect(reopened).toContain('rate = Slider("rate", "Rate", 0, 10, 0.25, $rate, "percent")');
    expect(declaredSettings(reopened)).toEqual({ $rate: 8, $years: 12.5 });
    expect(applySettings(code, null)).toBe(code);
    expect(applySettings(code, {})).toBe(code);
  });
});
