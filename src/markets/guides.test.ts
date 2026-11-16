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

  it("fails a market whose guide misses a field, and a field guided twice", () => {
    expect(guideErrors([line])).toEqual(expect.arrayContaining([expect.stringMatching(/^The IN guide has no line for "company"/)]));
    expect(guideErrors([line, line])).toEqual(expect.arrayContaining(['Guide line IN "sales" is listed twice']));
  });
});
