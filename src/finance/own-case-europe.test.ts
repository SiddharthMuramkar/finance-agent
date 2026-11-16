import { describe, expect, it } from "vitest";
import { valueCase } from "./valuation-case";
import { openingEstimate, ownCaseBlock, ownCaseIndustries, ownCaseMarket, valueOwnCase, type OwnCaseInputs } from "./own-case";

// Seam 3 (spec #68, ticket #115): a European Own Case is the course's valuation input shape in euro millions, opening at
// Europe's industry yardsticks (Damodaran's Europe sheets, January 2026, cost of capital in euros) with growth after year
// 10 at the dated risk-free reading (the Bundesbank's 10-year German federal yield-curve rate, 3.40% on 30 Oct 2026).
// Danone's 2025 figures, as a Learner copies them: Consolidated financial statements 2025 (income statement, balance
// sheet, Notes 9.1, 11.5 and 14.3). Dated when they were public (F07, G33), not at the year end: the 2025 Universal
// Registration Document was filed with the AMF on 4 March 2026 (press release cpdanone040326.pdf below), and Euronext
// Paris closed BN at €70.94 that day (Yahoo Finance BN.PA daily history, read 2026-11-16).
//   https://www.danone.com/content/dam/corp/global/danonecom/investors/fr-all-publications/2026/pressreleases/cpdanone040326.pdf
//   https://www.danone.com/content/dam/corp/global/danonecom/investors/en-consolidated-accounts/2025-/Danoneconsoliatedfinancialstatementsandnotes2025.pdf
//   https://www.danone.com/content/dam/corp/global/danonecom/investors/en-all-publications/2026/registrationdocuments/urd2025.pdf

const DANONE: OwnCaseInputs = {
  company: "Danone",
  market: "EU",
  reportDate: "2026-03-04",
  industry: "food",
  sales: 27_283, // "SALES", € millions
  operatingProfit: 2_940, // "OPERATING INCOME" (after other operating income and expense)
  taxPercent: 25.83, // Note 9.1: the country tax rate in France
  debt: 14_419, // "Financing", non-current 9,761 + current 4,658 (lease liabilities inside, Note 11.6)
  cash: 6_553, // Note 11.5: total cash and cash equivalents
  shares: 640_172_858, // Note 14.3: outstanding (issued less treasury) at 31 Dec 2025
  price: 70.94,
};

describe("an Own Case in Europe", () => {
  it("opens at Europe's food yardsticks, in euros, with growth after year 10 at the Bundesbank's 10-year 3.40%", () => {
    expect(ownCaseMarket("EU")).toMatchObject({ name: "Europe", currency: "EUR", unit: "millions" });
    expect(ownCaseMarket("EU").riskFree).toMatchObject({ id: "eu-risk-free-10y", value: 3.4, date: "2026-10-30" });
    expect(ownCaseIndustries("EU").map((i) => i.id)).toEqual(["auto", "food", "software", "market"]);
    expect(openingEstimate("food", "EU")).toEqual({
      growthPercent: 10,
      growthAfterPercent: 3.4,
      targetMarginPercent: 9.37,
      salesToCapital: 1.88,
      costOfCapitalPercent: 4.77,
      costOfCapitalAfterPercent: 4.77,
      returnOnCapitalAfterPercent: 4.77,
    });
  });

  it("values Danone in euro millions with the course's one engine", () => {
    const built = ownCaseBlock(DANONE, openingEstimate("food", "EU"), new Date("2026-11-16"));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.block).toMatchObject({ currency: "EUR", unit: "millions", baseRevenue: 27_283, shares: 640.172858, price: { value: 70.94, date: "2026-03-04" }, illustration: true, reproduces: false });
    const own = valueOwnCase(DANONE, openingEstimate("food", "EU"), new Date("2026-11-16"));
    const course = valueCase(built.block);
    expect(own.ok && course.ok).toBe(true);
    if (own.ok && course.ok) {
      expect(own.valuePerShare).toBeCloseTo(course.valuePerShare, 6);
      expect(own.valuePerShare).toBeGreaterThan(0);
    }
  });

  it("with no report link, credits each of Europe's yardstick sheets, one for each yardstick (G21)", () => {
    const built = ownCaseBlock(DANONE, openingEstimate("food", "EU"), new Date("2026-11-16"));
    expect(built.ok && built.block.sources.map((s) => s.url)).toEqual([
      "https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginEurope.xls",
      "https://pages.stern.nyu.edu/~adamodar/pc/datasets/capexEurope.xls",
      "https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccEurope.xls",
    ]);
  });
});
