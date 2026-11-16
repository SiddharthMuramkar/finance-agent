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

  it("count leases as debt, as India and Europe do, and state Japan's lease rule right (G10)", () => {
    const jp = annualReportGuide("JP").debt;
    expect(jp.where).toContain("リース債務");
    expect(jp.where).toContain("リース負債");
    expect(jp.where).toContain("operating leases join them from years starting on or after 1 April 2027");
    expect(jp.where).not.toMatch(/leases under Japanese GAAP stay off/i);
    expect(jp.sourceUrl).toBe("https://www.asb-j.jp/jp/wp-content/uploads/sites/4/lease_20240913_02.pdf");
    expect(annualReportGuide("KR").debt.where).toContain("리스부채");
  });

  it("say what to do with a report in thousands or in single yen or won (G16)", () => {
    expect(annualReportGuide("JP").sales.where).toMatch(/千円 \(thousands\) is divided by 1,000 and one in 円 by 1,000,000/);
    expect(annualReportGuide("KR").sales.where).toMatch(/천원 \(thousands\) is divided by 1,000 and one in 원 by 1,000,000/);
    expect(annualReportGuide("JP").shares.where).toContain("千株 counts thousands");
  });

  it("count Korea's preferred shares with the common ones (G08)", () => {
    const shares = annualReportGuide("KR").shares;
    expect(shares.where).toContain("common (보통주) and preferred (우선주) together");
    expect(shares.lingo.term).toBe("우선주");
  });

  it("the course check fails a Japanese guide line with no source, and a Korean guide that misses a field", () => {
    const jp = GUIDE_LINE_INPUTS.filter((l) => (l as { market: string }).market === "JP") as Record<string, unknown>[];
    const kr = GUIDE_LINE_INPUTS.filter((l) => (l as { market: string }).market === "KR") as Record<string, unknown>[];
    const [first, ...rest] = jp;
    expect(guideErrors([{ ...first, sourceUrl: undefined }, ...rest])).toEqual([expect.stringContaining(`Guide line JP "${first.field}" needs sourceUrl`)]);
    expect(guideErrors(kr.filter((l) => l.field !== "price"))).toEqual([expect.stringMatching(/^The KR guide has no line for "price"/)]);
  });
});
