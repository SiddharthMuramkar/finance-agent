import { describe, expect, it } from "vitest";
import { hasRawFormula, rawFormulaHits } from "./raw-formula";

describe("raw-formula detector", () => {
  it.each([
    "PV = amount / (1 + r)^n",
    "The price is V_n = V_0 x (1 + g)^n.",
    "PV = 1,100 / (1 + 0.10)^1 = 1,000.",
    "Divide: 1,210 / 1.21 = 1,000.",
    "The factor (1 + r) grows each year.",
    "Divide by 1.10 ^ 2 to discount.",
    "It compounds as 1.05² over two years.",
    "Net margin = net income / revenue",
    "Take 5,000 × 0.9 to get the answer.",
    "WACC = (E/V) x Re + (D/V) x Rd x (1 - T)",
    "The value is amount / (rate - growth).",
    "The sum is Σ of each payment.",
  ])("flags the typed formula %j", (text) => {
    expect(hasRawFormula(text)).toBe(true);
  });

  it.each([
    "A P/E of 15 means investors pay fifteen times earnings.",
    "A 50/50 split between stocks and bonds.",
    "The draw was on 23 October 2018, and the window ran to 2019-04-21 (4/21/2019).",
    "The cash option was $877.8 million, about 57% of the $1.537 billion headline.",
    "A flat fee of ₹2,50,000 and a loan of Rs 1,20,00,000 crore-scale at 8.5% a year.",
    "Debt/equity and price/book are ratios, written without spaces.",
    "Rates went from 5% to 7%, up 2 percentage points; 30 payments over 29 years.",
    "Waiting one year at 10% means dividing by 1.10 once.",
    "Read it at https://example.com/page?year=2018&rate=5 for the details.",
    "Revenue was at least 5 and at most 10, i.e. a >= 5 test in prose is not a formula.",
  ])("leaves %j alone", (text) => {
    expect(rawFormulaHits(text)).toEqual([]);
  });

  it("ignores formula markers, code fences (widgets and sources) and links", () => {
    expect(hasRawFormula("For example, {{formula:present-value amount=1000 ratePercent=10 years=5}} It falls with the rate.")).toBe(false);
    expect(hasRawFormula('Here you go.\n```openui-lang\nroot = Widget("x", [a])\n$rate = 3\n```')).toBe(false);
    expect(hasRawFormula('Answer.\n```sources\n[{"n":1,"title":"a = b"}]\n```')).toBe(false);
  });

  it("says which sign it found and quotes where", () => {
    const hits = rawFormulaHits("so PV = amount / (1 + r)^n holds");
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.some((h) => h.startsWith("an equals sign") && h.includes("PV = amount"))).toBe(true);
  });
});
