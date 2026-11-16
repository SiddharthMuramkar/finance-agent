import { describe, expect, it } from "vitest";
import { openingEstimate, valueOwnCase, type OwnCaseInputs } from "@/finance/own-case";
import { ownCaseNote } from "./own-cases";

// The one-page note of a European Own Case (spec #68, ticket #115): what was typed, in euros, the Estimate and the
// engine's value beside the price (a price of €10 or more reads whole, as every Case's does). Danone's 2025 figures (see src/finance/own-case-europe.test.ts for their places).

const DANONE: OwnCaseInputs = {
  company: "Danone",
  market: "EU",
  reportDate: "2025-12-31",
  industry: "food",
  sales: 27_283,
  operatingProfit: 2_940,
  taxPercent: 25.83,
  debt: 14_419,
  cash: 6_553,
  shares: 640_172_858,
  price: 76.78,
};

describe("a European Own Case's note", () => {
  it("names Europe, counts the money in euros and dates the price at the report", () => {
    const estimate = openingEstimate("food", "EU");
    const value = valueOwnCase(DANONE, estimate, new Date("2026-11-16"));
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    const note = ownCaseNote(DANONE, estimate, value).split("\n");
    expect(note[0]).toBe("Danone, Europe. Annual report of 31 Dec 2025. Industry: Food processors.");
    expect(note[1]).toContain("sales €27.3bn");
    expect(note[1]).toContain("640,172,858 shares, price €77 on 31 Dec 2025.");
    expect(note[2]).toContain("fading to 3.4%");
    expect(note[2]).toContain("€1.88 of sales for each €1 invested; cost of capital 4.77%.");
    expect(note[3]).toBe("Employee stock options are not entered: the engine counts none.");
    expect(note[4]).toMatch(/^The engine's value: €[\d,.]+ a share, beside a price of €77 on 31 Dec 2025\.$/);
  });
});
