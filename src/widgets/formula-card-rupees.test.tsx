import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formulaById } from "@/finance/formulas";
import { FormulaFigure, type CardValue } from "./formula-card-view";
import { recipeById } from "./recipes";
import { readWidget } from "./widget-reading";

// A rupee Formula Card (ticket #247): ₹1,000 growing 10% a year for 3 years is ₹1,331, worked by hand.

const fixed = (values: Record<string, number>): Record<string, CardValue> =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, from: "fixed" as const }]));

describe("a rupee Formula Card", () => {
  it("shows the amount and the result in rupees, with Indian grouping, and never a dollar sign", () => {
    const html = renderToStaticMarkup(<FormulaFigure formula={formulaById("compound-growth")!} values={fixed({ amount: 100_000, ratePercent: 10, years: 3 })} />);
    expect(html).toContain("₹1,00,000");
    expect(html).toContain("₹1,33,100");
    expect(html).toContain("rupees");
    expect(html).not.toContain("$");
  });

  it("shows the CAGR card's levels as plain numbers and its answer as a percent", () => {
    const html = renderToStaticMarkup(<FormulaFigure formula={formulaById("cagr")!} values={fixed({ start: 1000, end: 1331, years: 3 })} />);
    expect(html).toContain("1,331");
    expect(html).toContain("10.00%");
    expect(html).not.toContain("$");
  });

  it("keeps the present value card in dollars", () => {
    const html = renderToStaticMarkup(<FormulaFigure formula={formulaById("present-value")!} values={fixed({ amount: 1000, ratePercent: 10, years: 5 })} />);
    expect(html).toContain("$620.92");
    expect(html).not.toContain("₹");
  });
});

describe("the formula recipe in rupees", () => {
  const built = recipeById("formula")!.build({
    title: "What ₹1,000 grows to",
    inputs: { formula: "compound-growth", slider: { symbol: "amount", label: "Amount you put in", min: 500, max: 5000, step: 500, start: 1000 }, held: { ratePercent: 10, years: 3 } },
    refs: { sourced: {} },
    facts: {},
  });

  it("puts a rupee amount on a rupee slider", () => {
    if (!built.ok) throw new Error(built.error);
    expect(built.code).toMatch(/Slider\("amount", "Amount you put in", 500, 5000, 500, \$amount, "inr"\)/);
    expect(built.code).not.toContain('"usd"');
  });

  it("is read to the Tutor in rupees", () => {
    if (!built.ok) throw new Error(built.error);
    const reading = readWidget(built.code, undefined, () => undefined)!;
    expect(reading.readouts).toEqual(["Compound growth of one amount: What it grows to (future value) ₹1,331"]);
    expect(reading.sliders[0].text).toContain("₹1,000");
  });
});
