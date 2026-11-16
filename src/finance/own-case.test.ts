import { describe, expect, it } from "vitest";
import { valueCase } from "./valuation-case";
import { valuationCase } from "./valuation-cases";
import { INDIA_INDUSTRIES, US_INDUSTRIES, openingEstimate, ownCaseBlock, ownCaseIndustries, ownCaseMarket, ownCaseReadingIds, readingsAfterReport, valueOwnCase, type OwnCaseInputs } from "./own-case";

// Seam 3 (spec #68): an Own Case is the course's valuation input shape filled from about eight typed numbers, so the one
// engine values it with no new maths (ADR 0010). Coffee Day's IPO, as the course Case "coffee-day-rupee-valuation-2015"
// tells it, is the equal course Case: its prospectus figures typed in, and its story as the Estimate.

const COFFEE_DAY: OwnCaseInputs = {
  company: "Coffee Day Enterprises",
  market: "IN",
  reportDate: "2015-10-21",
  industry: "food",
  sales: 2479.36,
  operatingProfit: 109.59, // 4.42% of sales: the course Case's base-year margin (its year 1 is 9.71%, half way to 15%)
  taxPercent: 33.99,
  debt: 4998.4,
  cash: 3679.63,
  shares: 206_001_719, // a plain count, as the report prints it
  price: 328,
};

const COFFEE_DAY_STORY = {
  growthPercent: 15,
  growthAfterPercent: 5,
  targetMarginPercent: 15,
  salesToCapital: 1.3,
  costOfCapitalPercent: 11.8,
  costOfCapitalAfterPercent: 10.5,
  returnOnCapitalAfterPercent: 12,
};

describe("an Own Case values as the equal course Case", () => {
  it("Coffee Day's typed figures and story give the course Case's value a share", () => {
    const course = valuationCase("coffee-day-rupee-valuation-2015")!;
    const expected = valueCase(course);
    expect(expected.ok).toBe(true);
    const own = valueOwnCase(COFFEE_DAY, COFFEE_DAY_STORY);
    expect(own.ok).toBe(true);
    if (!own.ok || !expected.ok) return;
    // ₹89.32 a share, the figure the course Case records for its own story.
    expect(own.valuePerShare).toBeCloseTo(89.32, 2);
    // The course Case writes its margin path to four decimals, so the two agree to the paisa, not to the last digit.
    expect(own.valuePerShare).toBeCloseTo(expected.valuePerShare, 2);
  });

  it("the Own Case is dated at its report, with the price of that day, in rupees crore", () => {
    const built = ownCaseBlock(COFFEE_DAY, COFFEE_DAY_STORY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.block).toMatchObject({ currency: "INR", unit: "crores", price: { value: 328, date: "2015-10-21" }, illustration: true, reproduces: false });
    expect(built.block.shares).toBeCloseTo(20.6001719, 7);
  });

  it("an industry's opening Estimate takes its yardsticks", () => {
    const food = INDIA_INDUSTRIES.find((i) => i.id === "food")!;
    expect(openingEstimate("food")).toMatchObject({ targetMarginPercent: food.operatingMarginPercent, salesToCapital: food.salesToCapital, costOfCapitalPercent: food.costOfCapitalPercent });
    expect(valueOwnCase(COFFEE_DAY, openingEstimate("food")).ok).toBe(true);
  });
});

describe("bad inputs get a readable message, never a throw", () => {
  it.each([
    [{ shares: 0 }, "The share count must be above zero."],
    [{ shares: Number.NaN }, "The share count must be above zero."],
    [{ sales: 0 }, "Sales must be above zero."],
    [{ price: -1 }, "The share price must be above zero."],
    [{ taxPercent: 140 }, "The tax rate must be between 0% and 100%."],
    [{ debt: -5 }, "Debt cannot be below zero."],
    [{ cash: -5 }, "Cash cannot be below zero."],
    [{ reportDate: "21/10/2015" }, "Give the report's date as a day, month and year."],
    [{ company: " " }, "Name the company."],
  ] as const)("%o", (change, message) => {
    const result = valueOwnCase({ ...COFFEE_DAY, ...change }, COFFEE_DAY_STORY);
    expect(result).toEqual({ ok: false, error: message });
  });

  it("impossible growth: growth after year 10 at or above the cost of capital", () => {
    expect(valueOwnCase(COFFEE_DAY, { ...COFFEE_DAY_STORY, growthAfterPercent: 11 })).toEqual({
      ok: false,
      error: "Growth after year 10 must be below the year-10 cost of capital, or the value is infinite.",
    });
  });

  it("impossible growth: revenue shrinking by 100% or more", () => {
    expect(valueOwnCase(COFFEE_DAY, { ...COFFEE_DAY_STORY, growthPercent: -120 })).toEqual({ ok: false, error: "Revenue cannot shrink by 100% or more in a year." });
  });

  it("a report dated after today is refused: an Own Case looks back, never live", () => {
    const result = valueOwnCase({ ...COFFEE_DAY, reportDate: "2999-03-31" }, COFFEE_DAY_STORY, new Date("2026-11-16"));
    expect(result).toEqual({ ok: false, error: "The report's date must be in the past." });
  });
});

// The US (#113): a US Own Case is copied from a Form 10-K, in US$ millions, with the share count as the cover prints it.
// Apple's 10-K for the year to 27 Sep 2025 (https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm).
const APPLE: OwnCaseInputs = {
  company: "Apple Inc.",
  market: "US",
  reportDate: "2025-09-27",
  industry: "market",
  sales: 416_161,
  operatingProfit: 133_050,
  taxPercent: 21,
  debt: 98_657, // commercial paper 7,979 + term debt 12,350 + 78,328
  cash: 35_934,
  shares: 14_776_353_000,
  price: 255.46,
};

describe("a US Own Case (#113)", () => {
  it("is in US dollars millions, its share count in millions, dated at the 10-K with that day's price", () => {
    const built = ownCaseBlock(APPLE, openingEstimate("market", "US"));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.block).toMatchObject({ currency: "USD", unit: "millions", price: { value: 255.46, date: "2025-09-27" }, illustration: true, reproduces: false });
    expect(built.block.shares).toBeCloseTo(14_776.353, 6);
  });

  it("counts money in millions, not crores: Coffee Day's figures typed as US$ millions value at a tenth of ₹89.32", () => {
    const own = valueOwnCase({ ...COFFEE_DAY, market: "US" }, COFFEE_DAY_STORY);
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.valuePerShare).toBeCloseTo(8.932, 3);
  });

  it("opens its Estimate at the US yardsticks, not India's", () => {
    const software = US_INDUSTRIES.find((i) => i.id === "software")!;
    expect(software).toMatchObject({ operatingMarginPercent: 32.98, salesToCapital: 1.54, costOfCapitalPercent: 9.34 });
    expect(openingEstimate("software", "US")).toMatchObject({ targetMarginPercent: 32.98, salesToCapital: 1.54, costOfCapitalPercent: 9.34 });
    expect(ownCaseIndustries("US").map((i) => i.id)).toEqual(["auto", "food", "software", "market"]);
    expect(valueOwnCase(APPLE, openingEstimate("market", "US")).ok).toBe(true);
  });

  it("opens with growth after year 10 at the US risk-free reading (4.94%, Oct 2026), and shows the industry's dated yardsticks", () => {
    expect(ownCaseMarket("US").riskFree).toMatchObject({ id: "us-risk-free-10y", value: 4.94, date: "2026-10-30" });
    expect(openingEstimate("food", "US").growthAfterPercent).toBe(4.94);
    expect(ownCaseReadingIds("US", "food")).toEqual(["us-food-margin", "us-food-sales-to-capital", "us-food-cost-of-capital"]);
  });

  it("India's opening Estimate stays as it was", () => {
    expect(openingEstimate("food")).toEqual(openingEstimate("food", "IN"));
    expect(openingEstimate("food", "IN").growthAfterPercent).toBe(5);
  });
});

// G17: the course has one reading of each kind (yardsticks of 5 Jan 2026, risk-free readings of 30 Oct 2026), so an Own
// Case dated before them opens at figures nobody knew on its report's date. They are listed so the form can say so.
describe("readings dated after the Own Case's report", () => {
  const ids = (market: Parameters<typeof readingsAfterReport>[0], date: string) => readingsAfterReport(market, "food", date).map((r) => r.id);

  it("lists every opening reading dated after the report, the risk-free reading first", () => {
    expect(ids("IN", "2015-10-21")).toEqual(["in-food-margin", "in-food-sales-to-capital", "in-food-cost-of-capital"]);
    expect(ids("US", "2025-10-31")).toEqual(["us-risk-free-10y", "us-food-margin", "us-food-sales-to-capital", "us-food-cost-of-capital"]);
    for (const r of readingsAfterReport("EU", "food", "2026-03-04")) expect(r.date > "2026-03-04", r.id).toBe(true);
  });

  it("leaves out a reading dated on or before the report", () => {
    expect(ids("JP", "2026-06-19")).toEqual(["jp-risk-free-10y"]);
    expect(ids("US", "2026-10-30")).toEqual([]);
    expect(ids("KR", "2026-11-02")).toEqual([]);
  });

  it("is empty until the report's date is a day", () => {
    expect(ids("US", "")).toEqual([]);
    expect(ids("US", "2025-13-40")).toEqual([]);
  });
});
