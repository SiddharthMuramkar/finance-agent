import { describe, expect, it } from "vitest";
import { REPORT_GUIDE_FIELDS, REPORT_GUIDE_INPUTS, reportGuide, reportGuideErrors } from "./report-guides";

// The annual-report guide (spec #68; #108 for India, #113 for the US): beside each figure the Own Case form asks for, a
// line saying where it sits in the market's annual report, with a source link. The course check (Seam 2) fails a guide
// line with no source.

describe("the course check on annual-report guides", () => {
  it("passes every guide as written", () => {
    expect(reportGuideErrors(REPORT_GUIDE_INPUTS)).toEqual([]);
  });

  it("fails a guide line with no source, or with no working link", () => {
    const us = structuredClone(REPORT_GUIDE_INPUTS.find((g) => (g as { market: string }).market === "US")) as { fields: Record<string, Record<string, unknown>> };
    delete us.fields.sales.source;
    expect(reportGuideErrors([us])).toEqual([expect.stringContaining('US guide line "sales" needs source')]);
    us.fields.sales.source = "Investor.gov";
    us.fields.sales.sourceUrl = "not a link";
    expect(reportGuideErrors([us])).toEqual([expect.stringContaining('US guide line "sales" needs sourceUrl')]);
  });

  it("fails a guide that leaves out a field the form asks for", () => {
    const us = structuredClone(REPORT_GUIDE_INPUTS.find((g) => (g as { market: string }).market === "US")) as { fields: Record<string, unknown> };
    delete us.fields.price;
    expect(reportGuideErrors([us])).toEqual([expect.stringContaining('US guide has no line for "price"')]);
  });
});

describe("the US guide (#113): a Form 10-K on SEC EDGAR", () => {
  it("has a line and an https source for every figure the Own Case form asks for", () => {
    const guide = reportGuide("US")!;
    expect(guide.report).toMatchObject({ name: "Form 10-K", sourceUrl: expect.stringMatching(/^https:\/\/www\.sec\.gov\//) });
    for (const field of REPORT_GUIDE_FIELDS) {
      expect(guide.fields[field].line.length).toBeGreaterThan(10);
      expect(guide.fields[field].sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("says where the 10-K puts sales and operating income, and that its tables are in millions", () => {
    const guide = reportGuide("US")!;
    expect(guide.fields.sales.line).toMatch(/Item 8/);
    expect(guide.fields.operatingProfit.line).toMatch(/Operating income/);
    expect(guide.fields.sales.line).toMatch(/millions/);
    expect(guide.fields.shares.line).toMatch(/cover/);
  });
});
