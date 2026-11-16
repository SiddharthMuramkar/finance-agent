import { describe, expect, it } from "vitest";
import { ICON_SET } from "@/icons/names";
import { GUIDE_FIELDS, guideLine, REPORT_GUIDE_INPUTS, reportGuideErrors } from "./report-guides";

// Annual-report guides for Japan and Korea (spec #68, ticket #114): a guide line, a source link and a Lingo card beside
// every figure the Own Case form asks for, held by the course check (Seam 2) like India's (#108).

describe("the annual-report guides for Japan and Korea", () => {
  it("give every field a guide line, a source link and a Lingo card, and pass the course check", () => {
    expect(reportGuideErrors(REPORT_GUIDE_INPUTS)).toEqual([]);
    for (const market of ["JP", "KR"]) {
      for (const field of GUIDE_FIELDS) {
        const line = guideLine(market, field);
        expect(line, `${market} ${field}`).toBeDefined();
        expect(line!.sourceUrl).toMatch(/^https:\/\//);
        expect(Object.keys(ICON_SET)).toContain(line!.lingo.emoji);
      }
    }
    expect(guideLine("JP", "operatingProfit")?.where).toContain("営業利益");
    expect(guideLine("KR", "operatingProfit")?.where).toContain("영업이익");
  });

  it("the course check fails a guide line with no source, and a field with no line", () => {
    const [first, ...rest] = REPORT_GUIDE_INPUTS.JP as Record<string, unknown>[];
    expect(reportGuideErrors({ JP: [{ ...first, sourceUrl: undefined }, ...rest] })).toEqual([expect.stringContaining('The JP guide line for "reportDate" needs sourceUrl')]);
    expect(reportGuideErrors({ JP: [{ ...first, source: "" }, ...rest] })).toEqual([expect.stringContaining('"reportDate" needs source')]);
    expect(reportGuideErrors({ JP: rest })).toEqual(['The JP guide has no line for "reportDate"']);
  });
});
