import { describe, expect, it } from "vitest";
import { GUIDE_FIELDS, GUIDE_LINE_INPUTS, annualReportGuide, guideErrors } from "./guides";

// The annual-report guide for Europe (spec #68, ticket #115): beside each Own Case field, where the number sits in a
// European (IFRS) annual financial report, a link to the rule that says so and a Lingo card, held by the course check
// (Seam 2) like India's (#108).

describe("the annual-report guide for Europe", () => {
  it("gives every Own Case field a guide line, a source link and a Lingo card, and passes the course check", () => {
    expect(guideErrors(GUIDE_LINE_INPUTS)).toEqual([]);
    const europe = annualReportGuide("EU");
    expect(Object.keys(europe).sort()).toEqual([...GUIDE_FIELDS].sort());
    for (const field of GUIDE_FIELDS) {
      expect(europe[field].sourceUrl).toMatch(/^https:\/\//);
      expect(europe[field].lingo.term.length).toBeGreaterThan(2);
    }
    expect(europe.sales.where).toContain("Revenue");
    expect(europe.sales.where).toContain("TEUR");
    // G09: the Europe Own Case counts in euros, so the guide names only euro exchanges and says pounds, pence and francs don't fit.
    expect(europe.company.where).toContain("euros");
    expect(europe.price.where).toContain("pence");
    for (const field of GUIDE_FIELDS) expect(europe[field].where, field).not.toMatch(/London|year-end close/);
    expect(europe.debt.source).toContain("IFRS 16");
    expect(europe.taxPercent.source).toContain("IAS 12");
    // G16: shares as the full count, never in millions; a shut market's price is the next trading day's (L03).
    expect(europe.shares.where).toContain("640.2 million is 640,200,000");
    expect(europe.price.where).toContain("use the next trading day");
  });
});
