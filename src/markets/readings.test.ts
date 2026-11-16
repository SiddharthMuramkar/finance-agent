import { describe, expect, it } from "vitest";
import { MARKET_READING_INPUTS, MARKET_READINGS, marketReading, marketReadingErrors, readingMonth, readingValueText, type MarketReadingInput } from "./readings";

// Market readings (spec #68, ticket #105): each is stored like Case Data (a value, the date it was measured, its source,
// its credit and a link), and the course check (Seam 2) holds every one to that. Premium readings are solved with the
// course's own implied-premium maths (Seam 3) and held to the figure their source printed.

const yardstick: MarketReadingInput = {
  id: "in-test-margin",
  label: "Operating margin, test makers (India)",
  market: "IN",
  kind: "operating_margin",
  industry: "Test makers",
  value: 9.69,
  unit: "percent",
  date: "2026-01-05",
  source: "Damodaran Online, Operating and Net Margins by Industry (India)",
  sourceUrl: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginIndia.xls",
  credit: "Aswath Damodaran, NYU Stern",
  checkedOn: "2026-11-16",
  checkNote: "Read from the sheet's row.",
};

describe("the course check on Market readings", () => {
  it("passes every reading in the first set", () => {
    expect(marketReadingErrors(MARKET_READING_INPUTS)).toEqual([]);
    expect(MARKET_READINGS).toHaveLength(MARKET_READING_INPUTS.length);
  });

  it("fails a reading with no date", () => {
    expect(marketReadingErrors([{ ...yardstick, date: undefined }])).toEqual([expect.stringContaining('"in-test-margin" needs date')]);
  });

  it("fails a reading with no source, and one with no working link", () => {
    expect(marketReadingErrors([{ ...yardstick, source: undefined }])).toEqual([expect.stringContaining('"in-test-margin" needs source')]);
    expect(marketReadingErrors([{ ...yardstick, sourceUrl: "not a link" }])).toEqual([expect.stringContaining('"in-test-margin" needs sourceUrl')]);
  });

  it("fails a reading whose words call it today's or current", () => {
    expect(marketReadingErrors([{ ...yardstick, label: "Current operating margin, test makers" }])).toEqual([
      expect.stringContaining('"in-test-margin" calls itself "Current"'),
    ]);
    expect(marketReadingErrors([{ ...yardstick, checkNote: "The margin today." }])).toEqual([expect.stringContaining('calls itself "today"')]);
  });

  it("fails two readings with one id", () => {
    expect(marketReadingErrors([yardstick, yardstick])).toEqual(['Market reading "in-test-margin" is listed twice']);
  });

  it("fails a premium reading whose inputs do not give the premium it states", () => {
    const premium = MARKET_READINGS.find((r) => r.kind === "implied_premium")!;
    expect(marketReadingErrors([{ ...premium, value: premium.value + 0.5 }])).toEqual([expect.stringContaining("its inputs give")]);
  });
});

describe("the first set of Market readings", () => {
  it("holds the implied premium for end-2007, end-2008 and end-2019: 4.37%, 6.43% and 5.20% (Damodaran, histimpl.xls)", () => {
    const premiums = MARKET_READINGS.filter((r) => r.kind === "implied_premium").map((r) => [r.date, r.value]);
    expect(premiums).toEqual([
      ["2007-12-31", 4.37],
      ["2008-12-31", 6.43],
      ["2019-12-31", 5.2],
    ]);
  });

  it("holds India's yardsticks by industry: margin, sales for each rupee invested and the cost of capital", () => {
    const auto = ["operating_margin", "sales_to_capital", "cost_of_capital"].map((kind) => MARKET_READINGS.find((r) => r.market === "IN" && r.industry === "Auto & Truck" && r.kind === kind)?.value);
    expect(auto).toEqual([9.69, 1.03, 13.9]);
  });

  it("holds the US yardsticks by industry, each dated at the January 2026 update and linked to Damodaran's US sheets (#113)", () => {
    const us = MARKET_READINGS.filter((r) => r.market === "US" && r.kind !== "implied_premium" && r.kind !== "risk_free");
    const software = ["operating_margin", "sales_to_capital", "cost_of_capital"].map((kind) => us.find((r) => r.industry === "Software (System & Application)" && r.kind === kind)?.value);
    expect(software).toEqual([32.98, 1.54, 9.34]);
    expect(marketReading("us-food-cost-of-capital")?.value).toBe(5.79);
    expect(us).toHaveLength(12);
    for (const r of us) {
      expect(r.date).toBe("2026-01-05");
      expect(r.sourceUrl).toMatch(/^https:\/\/pages\.stern\.nyu\.edu\/~adamodar\/pc\/datasets\/(margin|capex|wacc)\.xls$/);
      expect(r.credit).toBe("Aswath Damodaran, NYU Stern");
    }
  });

  it("holds the US risk-free reading: the 10-year Treasury yield of 4.94% on 30 Oct 2026, credited to the US Treasury (#113)", () => {
    const riskFree = marketReading("us-treasury-10y");
    expect(riskFree).toMatchObject({ market: "US", kind: "risk_free", value: 4.94, unit: "percent", date: "2026-10-30", credit: "U.S. Department of the Treasury" });
    expect(riskFree?.sourceUrl).toMatch(/^https:\/\/home\.treasury\.gov\//);
  });

  it("fails a risk-free reading with no date or no source, as any reading (#113)", () => {
    const riskFree = marketReading("us-treasury-10y")!;
    expect(marketReadingErrors([{ ...riskFree, date: undefined }])).toEqual([expect.stringContaining('"us-treasury-10y" needs date')]);
    expect(marketReadingErrors([{ ...riskFree, sourceUrl: undefined }])).toEqual([expect.stringContaining('"us-treasury-10y" needs sourceUrl')]);
  });

  it("writes a reading's month and year, and its value in its unit", () => {
    expect(readingMonth("2026-01-05")).toBe("Jan 2026");
    expect(readingMonth("2007-12-31")).toBe("Dec 2007");
    expect(readingValueText(marketReading("in-auto-margin")!)).toBe("9.69%");
    expect(readingValueText(marketReading("in-auto-sales-to-capital")!)).toBe("1.03");
  });
});
