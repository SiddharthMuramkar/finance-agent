import { describe, expect, it } from "vitest";
import { calculate } from "./calculators";
import { describeFormula } from "./formula-text";
import { formulaById, formulaCurrency } from "./formulas";

// The growth Formula Cards (ticket #247) and the currency a card works in. The expected figures are worked by
// hand, outside the code: ₹1,000 growing 10% a year is ₹1,100, then ₹1,210, then ₹1,331; and 1,000 becoming
// 1,331 in 3 years is a steady 10% a year, since 1.1 × 1.1 × 1.1 = 1.331.

const result = (id: string, values: Record<string, number>) => {
  const f = formulaById(id)!;
  const run = calculate(f.calculator, values, formulaCurrency(f));
  if (!run.ok) throw new Error(run.error);
  return run.results.find((r) => r.label === f.result.resultLabel)!;
};

describe("compound-growth", () => {
  const f = formulaById("compound-growth")!;

  it("works ₹1,000 at 10% for 3 years out to ₹1,331, with the future_value calculator", () => {
    expect(f.calculator).toBe("future_value");
    expect(f.result.resultLabel).toBe("Future value");
    expect(f.symbols.map((s) => [s.key, s.unit])).toEqual([
      ["amount", "inr"],
      ["ratePercent", "percent"],
      ["years", "years"],
    ]);
    expect(f.example).toEqual({ amount: 1000, ratePercent: 10, years: 3 });
    const r = result("compound-growth", f.example);
    expect(r.value).toBeCloseTo(1331, 9);
    expect(r.text).toBe("₹1,331");
  });

  it("writes the growth expression", () => {
    expect(f.expression).toEqual(["{result} = {amount} × (1 + {ratePercent}) ^ {years}"]);
  });

  it("is a rupee formula", () => {
    expect(formulaCurrency(f)).toBe("inr");
  });
});

describe("cagr", () => {
  const f = formulaById("cagr")!;

  it("finds a steady 10% a year from 1,000 to 1,331 in 3 years, with the cagr calculator", () => {
    expect(f.calculator).toBe("cagr");
    expect(f.result.resultLabel).toBe("CAGR");
    expect(f.symbols.map((s) => s.key)).toEqual(["start", "end", "years"]);
    expect(f.symbols.find((s) => s.key === "start")!.unit).toBe("value");
    expect(f.expression).toEqual(["{result} = ({end} ÷ {start}) ^ (1 ÷ {years}) − 1"]);
    const r = result("cagr", { start: 1000, end: 1331, years: 3 });
    expect(r.value).toBeCloseTo(10, 9);
    expect(r.text).toBe("10.00%");
  });
});

describe("the currency of a formula", () => {
  it("keeps present value's three cards in dollars", () => {
    for (const id of ["present-value", "annuity-present-value", "growing-annuity-present-value"]) {
      expect(formulaCurrency(formulaById(id)!), id).toBe("usd");
    }
  });

  it("says a rupee card's inputs and result in rupees, never dollars", () => {
    const text = describeFormula(formulaById("compound-growth")!, { amount: 1000, ratePercent: 10, years: 3 });
    expect(text).toContain("₹1,000");
    expect(text).toContain("₹1,331");
    expect(text).not.toContain("$");
  });

  it("says index levels as plain grouped numbers", () => {
    const text = describeFormula(formulaById("cagr")!, { start: 1000, end: 1331, years: 3 });
    expect(text).toContain("1,000");
    expect(text).toContain("1,331");
    expect(text).toContain("10.00%");
    expect(text).not.toContain("$");
    expect(text).not.toContain("₹");
  });

  it("still says present value in dollars", () => {
    expect(describeFormula(formulaById("present-value")!, { amount: 1000, ratePercent: 10, years: 5 })).toContain("$620.92");
  });
});
