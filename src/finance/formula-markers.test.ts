import { describe, expect, it } from "vitest";
import { hasMarkers, markerProblems, splitMarkers } from "./formula-markers";
import { plainFormulaText } from "./formula-text";

const PV = "{{formula:present-value amount=1100 ratePercent=10 years=1}}";

describe("formula markers", () => {
  it("splits text into words and markers", () => {
    const parts = splitMarkers(`Waiting one year. ${PV} Done.`);
    expect(parts.map((p) => p.kind)).toEqual(["text", "formula", "text"]);
    expect(parts[1]).toMatchObject({ kind: "formula", formulaId: "present-value", values: { amount: 1100, ratePercent: 10, years: 1 } });
    expect(hasMarkers(PV)).toBe(true);
    expect(hasMarkers("no marker")).toBe(false);
  });

  it("names what is wrong with a marker", () => {
    expect(markerProblems(PV, ["present-value"])).toEqual([]);
    expect(markerProblems("{{formula:wacc amount=1}}")[0]).toContain('unknown formula "wacc"');
    expect(markerProblems(PV, ["annuity-present-value"])[0]).toContain("not in this Topic's formulas list");
    expect(markerProblems("{{formula:present-value amount=1 ratePercent=2}}")[0]).toContain("missing years");
    expect(markerProblems("{{formula:present-value amount=1 ratePercent=2 years=3 extra=4}}")[0]).toContain("not a key: extra");
    expect(markerProblems("{{formula:present-value amount=x ratePercent=2 years=3}}")[0]).toContain("not key=number");
    expect(markerProblems("{{formula:present-value amount=1 amount=2 ratePercent=2 years=3}}")[0]).toContain("given twice");
    expect(markerProblems("{{formula:present-value amount=1").join()).toContain("not closed");
  });
});

describe("a marker in words for the Tutor", () => {
  it("gives the formula's name, each input in plain words and the result from the calculator", () => {
    const text = plainFormulaText(`Waiting one year. ${PV} Done.`);
    expect(text).not.toContain("{{");
    expect(text).not.toContain("amount=");
    expect(text).toContain("Present value of one future payment, worked out by code");
    expect(text).toContain("Amount you receive later $1,100.00");
    expect(text).toContain("Yearly discount rate 10%");
    expect(text).toContain("Years until the payment arrives 1 year");
    expect(text).toContain("Worth today (present value) $1,000.00");
  });

  it("includes the values worked out on the way", () => {
    const text = plainFormulaText("{{formula:growing-annuity-present-value total=3310 payments=3 growthPercent=10 ratePercent=10}}");
    expect(text).toContain("First payment, paid now $1,000.00");
    expect(text).toContain("Worth today (present value) $3,000.00");
  });

  it("leaves text without markers untouched and never prints a broken marker raw", () => {
    expect(plainFormulaText("Plain words.")).toBe("Plain words.");
    const broken = plainFormulaText("See {{formula:nope a=1}} here.");
    expect(broken).not.toContain("{{");
    expect(broken).toContain("could not be worked out");
  });
});
