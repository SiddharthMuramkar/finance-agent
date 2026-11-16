import { describe, expect, it } from "vitest";
import { MARKET_READINGS, marketReading, marketReadingErrors } from "./readings";
import { EUROPE_READINGS } from "./readings-europe";

// Europe's Market readings (spec #68, ticket #115): every yardstick and the risk-free reading dated and sourced, held by
// the course check (Seam 2). Expected values are the cells read from Damodaran's Europe sheets and the Bundesbank series
// on 2026-11-16, rounded to two decimals.

describe("Europe's Market readings", () => {
  it("pass the course check: each one dated, sourced, credited and linked", () => {
    expect(EUROPE_READINGS).toHaveLength(13);
    expect(marketReadingErrors(EUROPE_READINGS)).toEqual([]);
    const europe = MARKET_READINGS.filter((r) => r.market === "EU");
    expect(europe).toHaveLength(13);
    for (const r of europe) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(r.credit.length).toBeGreaterThan(3);
    }
  });

  it("give the food processors' yardsticks in euros and the Bund's 10-year yield on 30 Oct 2026", () => {
    expect(marketReading("eu-food-margin")).toMatchObject({ value: 9.37, unit: "percent", date: "2026-01-05", industry: "Food Processing" });
    expect(marketReading("eu-food-sales-to-capital")).toMatchObject({ value: 1.88, unit: "times" });
    expect(marketReading("eu-food-cost-of-capital")).toMatchObject({ value: 4.77, sourceUrl: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccEurope.xls" });
    expect(marketReading("eu-risk-free-10y")).toMatchObject({ kind: "risk_free", value: 3.4, date: "2026-10-30", credit: "Deutsche Bundesbank" });
  });

  it("the course check fails a risk-free reading with no date or no source", () => {
    const bund = EUROPE_READINGS.find((r) => r.id === "eu-risk-free-10y")!;
    expect(marketReadingErrors([{ ...bund, date: undefined }])).toEqual([expect.stringContaining('Market reading "eu-risk-free-10y" needs date')]);
    expect(marketReadingErrors([{ ...bund, source: undefined }])).toEqual([expect.stringContaining('Market reading "eu-risk-free-10y" needs source')]);
  });
});
