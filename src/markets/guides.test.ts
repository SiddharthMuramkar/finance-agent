import { describe, expect, it } from "vitest";
import { GUIDE_FIELDS, GUIDE_LINE_INPUTS, annualReportGuide, guideErrors, type GuideLineInput } from "./guides";

// The annual-report guide (spec #68, ticket #108): beside each Own Case field, where the number sits in a market's annual
// report, with a source link and a Lingo card, so a Learner can find it alone. The course check (Seam 2) holds every
// guide line to a source.

const line: GuideLineInput = {
  market: "IN",
  field: "sales",
  where: "Statement of Profit and Loss, first line: Revenue from operations, this year's column.",
  source: "Companies Act, 2013, Schedule III, Division II",
  sourceUrl: "https://www.mca.gov.in/content/dam/mca/pdf/CompaniesAct2013.pdf",
  lingo: {
    term: "Revenue from operations",
    means: "Money from selling the company's goods or services in the year, before any costs.",
    pro: "revenue from operations is the top line",
    example: "A biscuit maker's revenue is its biscuit sales, not its deposit interest.",
    emoji: "receipt",
  },
};

describe("the course check on the annual-report guide", () => {
  it("passes India's guide, which gives every Own Case field a guide line, a source link and a Lingo card", () => {
    expect(guideErrors(GUIDE_LINE_INPUTS)).toEqual([]);
    const india = annualReportGuide("IN");
    expect(Object.keys(india).sort()).toEqual([...GUIDE_FIELDS].sort());
    for (const field of GUIDE_FIELDS) {
      expect(india[field].where.length).toBeGreaterThan(10);
      expect(india[field].sourceUrl).toMatch(/^https:\/\//);
      expect(india[field].lingo.term.length).toBeGreaterThan(2);
    }
  });

  it("fails a guide line with no source, and one with no working link", () => {
    expect(guideErrors([{ ...line, source: undefined }])).toContain('Guide line IN "sales" needs source: Invalid input: expected string, received undefined');
    expect(guideErrors([{ ...line, sourceUrl: undefined }])).toEqual(expect.arrayContaining([expect.stringContaining('Guide line IN "sales" needs sourceUrl')]));
    expect(guideErrors([{ ...line, sourceUrl: "the annual report" }])).toEqual(expect.arrayContaining([expect.stringContaining('Guide line IN "sales" needs sourceUrl')]));
  });

  it("fails a guide line with no Lingo card, or a card whose picture is not an Icon", () => {
    expect(guideErrors([{ ...line, lingo: undefined }])).toEqual(expect.arrayContaining([expect.stringContaining('Guide line IN "sales" needs lingo')]));
    expect(guideErrors([{ ...line, lingo: { ...line.lingo!, emoji: "rupee-sign" } }])).toEqual(
      expect.arrayContaining(['Guide line IN "sales" has the Lingo picture "rupee-sign", which is not an Icon name (src/icons/names.ts)']),
    );
  });

  it("fails a guide line that types a formula (ADR 0003), and a Lingo card over LingoCard's word limits", () => {
    const sum = { ...line, lingo: { ...line.lingo!, example: "Profit before tax 150 + finance costs 30 - other income 40 = operating profit 140." } };
    expect(guideErrors([sum])).toEqual(expect.arrayContaining([expect.stringContaining('Guide line IN "sales" types a formula (ADR 0003)')]));
    const long = { ...line, lingo: { ...line.lingo!, pro: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen" } };
    expect(guideErrors([long])).toEqual(expect.arrayContaining(['Guide line IN "sales"\'s Lingo card pro has 15 words; at most 14']));
  });

  it("dates an Indian Own Case at the Board's approval, when the figures became public, not at the year end (F07)", () => {
    const date = annualReportGuide("IN").reportDate;
    expect(date.where).toContain("the date the Board approved them");
    expect(date.where).toContain("Not the Balance Sheet's year end");
    expect(annualReportGuide("IN").price.where).toContain("use the next trading day");
  });

  it("fails a market whose guide misses a field, and a field guided twice", () => {
    expect(guideErrors([line])).toEqual(expect.arrayContaining([expect.stringMatching(/^The IN guide has no line for "company"/)]));
    expect(guideErrors([line, line])).toEqual(expect.arrayContaining(['Guide line IN "sales" is listed twice']));
  });
});

describe("the US guide (#113): a Form 10-K on SEC EDGAR", () => {
  it("gives every Own Case field a guide line, an https source and a Lingo card", () => {
    const us = annualReportGuide("US");
    expect(Object.keys(us).sort()).toEqual([...GUIDE_FIELDS].sort());
    for (const field of GUIDE_FIELDS) {
      expect(us[field].sourceUrl).toMatch(/^https:\/\/www\.(sec|investor|nasdaq)\.(gov|com)\//);
      expect(us[field].lingo.term.length).toBeGreaterThan(2);
    }
  });

  it("says where the 10-K puts sales, operating income and the share count, and that its tables are in millions", () => {
    const us = annualReportGuide("US");
    expect(us.company.where).toMatch(/EDGAR/);
    expect(us.sales.where).toMatch(/Item 8/);
    expect(us.sales.where).toMatch(/\$ millions/);
    expect(us.operatingProfit.where).toMatch(/Operating income/);
    expect(us.shares.where).toMatch(/cover page/);
  });

  it("fails a US guide line with no source", () => {
    const sales = GUIDE_LINE_INPUTS.find((l) => (l as GuideLineInput).market === "US" && (l as GuideLineInput).field === "sales") as GuideLineInput;
    expect(guideErrors([{ ...sales, source: undefined }])).toEqual(expect.arrayContaining([expect.stringContaining('Guide line US "sales" needs source')]));
  });
});
