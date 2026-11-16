import { describe, expect, it } from "vitest";
import { MARKET_READING_INPUTS, MARKET_READINGS, knownOn, marketReading, marketReadingErrors, preRevealReadingErrors, readingMonth, readingValueText, type MarketReadingInput } from "./readings";

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
    const riskFree = marketReading("us-risk-free-10y");
    expect(riskFree).toMatchObject({ market: "US", kind: "risk_free", value: 4.94, unit: "percent", date: "2026-10-30", credit: "U.S. Department of the Treasury" });
    expect(riskFree?.sourceUrl).toMatch(/^https:\/\/home\.treasury\.gov\//);
  });

  it("fails a risk-free reading with no date or no source, as any reading (#113)", () => {
    const riskFree = marketReading("us-risk-free-10y")!;
    expect(marketReadingErrors([{ ...riskFree, date: undefined }])).toEqual([expect.stringContaining('"us-risk-free-10y" needs date')]);
    expect(marketReadingErrors([{ ...riskFree, sourceUrl: undefined }])).toEqual([expect.stringContaining('"us-risk-free-10y" needs sourceUrl')]);
  });

  it("writes a reading's month and year, and its value in its unit", () => {
    expect(readingMonth("2026-01-05")).toBe("Jan 2026");
    expect(readingMonth("2007-12-31")).toBe("Dec 2007");
    expect(readingValueText(marketReading("in-auto-margin")!)).toBe("9.69%");
    expect(readingValueText(marketReading("in-auto-sales-to-capital")!)).toBe("1.03");
  });
});

// Owner decision on #105 (2026-11-16): before the Reveal, a Topic's Workbench shows only readings known on its Case's As-of
// date, from the Case's own market (GLOSSARY "As-of rule"); the course check runs preRevealReadingErrors on every Topic.
describe("the As-of rule for readings shown before the Reveal", () => {
  const amazon = (readings: unknown, currency = "USD") => ({
    id: "spine-test",
    cases: [{ id: "amazon-test", asOf: "2000-02-03", valuation: { currency } }],
    explore: { workbench: { case: "amazon-test", inputs: { readings } } },
  });

  it("holds the US Treasury bond rate at the end of 1999, 6.44% (histimpl.xls), dated before Amazon's As-of date", () => {
    const r = marketReading("us-risk-free-10y-1999")!;
    expect([r.market, r.kind, r.value, r.date, r.sourceUrl]).toEqual(["US", "risk_free", 6.44, "1999-12-31", "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/implpr.html"]);
    // L27: the link opens Damodaran's web page of the table; the .xls is named in the check note.
    expect(r.checkNote).toContain("histimpl.xls");
    expect(knownOn(r, { asOf: "2000-02-03", market: "US" })).toBe(true);
    expect(preRevealReadingErrors([amazon(["us-risk-free-10y-1999"])])).toEqual([]);
  });

  it("fails a reading dated after the Case's As-of date", () => {
    expect(preRevealReadingErrors([amazon(["us-implied-premium-2007"])])).toEqual([
      'Topic "spine-test" explore Workbench shows "us-implied-premium-2007" (2007-12-31) before the Reveal, after Case "amazon-test"\'s As-of date 2000-02-03',
    ]);
  });

  it("fails a reading from another market, even an older one", () => {
    expect(preRevealReadingErrors([amazon(["us-risk-free-10y-1999"], "INR")])).toEqual([expect.stringContaining('"us-risk-free-10y-1999" from US before the Reveal, but Case "amazon-test" is in IN')]);
    expect(preRevealReadingErrors([amazon(["in-food-margin"])])).toHaveLength(2);
  });

  it("fails readings that no Case dates, and an id that is no reading", () => {
    expect(preRevealReadingErrors([{ ...amazon(["us-risk-free-10y-1999"]), cases: [] }])).toEqual([expect.stringContaining("names none of the Topic's Cases")]);
    expect(preRevealReadingErrors([amazon(["no-such-reading"])])).toEqual([expect.stringContaining('"no-such-reading", which is not a Market reading')]);
  });

  it("leaves a Topic with no readings alone", () => {
    expect(preRevealReadingErrors([amazon(undefined), { id: "plain", cases: [] }])).toEqual([]);
  });
});
