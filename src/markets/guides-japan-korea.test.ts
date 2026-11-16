import { describe, expect, it } from "vitest";
import { GUIDE_FIELDS, GUIDE_LINE_INPUTS, annualReportGuide, guideErrors } from "./guides";

// Annual-report guides for Japan and Korea (spec #68, ticket #114): a guide line, a source link and a Lingo card beside
// every Own Case field, held by the course check (Seam 2) like India's (#108).

describe("the annual-report guides for Japan and Korea", () => {
  it("give every field a guide line, a source link and a Lingo card, and pass the course check", () => {
    expect(guideErrors(GUIDE_LINE_INPUTS)).toEqual([]);
    for (const market of ["JP", "KR"] as const) {
      const guide = annualReportGuide(market);
      expect(Object.keys(guide).sort()).toEqual([...GUIDE_FIELDS].sort());
      for (const field of GUIDE_FIELDS) {
        expect(guide[field].sourceUrl).toMatch(/^https:\/\//);
        expect(guide[field].lingo.term.length).toBeGreaterThan(1);
      }
    }
    expect(annualReportGuide("JP").operatingProfit.where).toContain("営業利益");
    expect(annualReportGuide("KR").operatingProfit.where).toContain("영업이익");
  });

  it("the course check fails a Japanese guide line with no source, and a Korean guide that misses a field", () => {
    const jp = GUIDE_LINE_INPUTS.filter((l) => (l as { market: string }).market === "JP") as Record<string, unknown>[];
    const kr = GUIDE_LINE_INPUTS.filter((l) => (l as { market: string }).market === "KR") as Record<string, unknown>[];
    const [first, ...rest] = jp;
    expect(guideErrors([{ ...first, sourceUrl: undefined }, ...rest])).toEqual([expect.stringContaining(`Guide line JP "${first.field}" needs sourceUrl`)]);
    expect(guideErrors(kr.filter((l) => l.field !== "price"))).toEqual([expect.stringMatching(/^The KR guide has no line for "price"/)]);
  });
});
