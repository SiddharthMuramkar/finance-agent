import { describe, expect, it } from "vitest";
import { rangeCheck } from "./range-check";
import { MARKET_READINGS, marketReading, marketReadingErrors, readingMonth } from "./readings";
import { rateInOtherMoney } from "./yardsticks";

// More markets (spec #68, ticket #114): Japan and Korea, each with industry yardsticks and a dated risk-free reading.
// Every one is dated and sourced, and the course check (Seam 2) holds them to that like the first set.

const KINDS = ["operating_margin", "sales_to_capital", "cost_of_capital"] as const;
const row = (market: "JP" | "KR", industry: string) => KINDS.map((kind) => MARKET_READINGS.find((r) => r.market === market && r.industry === industry && r.kind === kind)?.value);

describe("Japan's and Korea's Market readings", () => {
  it("hold Japan's yardsticks by industry from Damodaran's Japan sheets (Jan 2026), the cost of capital in yen", () => {
    expect(row("JP", "Food Processing")).toEqual([5.11, 1.92, 3.84]);
    expect(row("JP", "Auto & Truck")).toEqual([6.07, 1, 5.02]);
    expect(marketReading("jp-food-cost-of-capital")?.sourceUrl).toBe("https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccJapan.xls");
  });

  it("hold Korea's yardsticks from the Emerging Markets sheets, named as such, the cost of capital turned from US dollars into won (G11)", () => {
    expect(row("KR", "Total Market (without financials)")).toEqual([9.17, 1.06, 8.92]);
    const coc = marketReading("kr-market-cost-of-capital")!;
    expect(coc.label).toMatch(/emerging markets/i);
    expect(coc.label).toMatch(/^Cost of capital in won, from US dollars/);
    expect(coc.sourceUrl).toBe("https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccemerg.xls");
    // The sheet's dollar cell and both yields of the sheet's own day are in the check note, so the turn can be redone.
    expect(coc.checkNote).toContain("9.76% in US dollars");
    expect(coc.checkNote).toContain("31 Dec 2025 (Korea 3.385%, US 4.18%)");
    const ktb = marketReading("kr-risk-free-10y-2025")!;
    const ust = marketReading("us-risk-free-10y-2025")!;
    expect([ktb.value, ktb.date, ust.value, ust.date]).toEqual([3.385, "2025-12-31", 4.18, "2025-12-31"]);
    expect(coc.value).toBe(rateInOtherMoney(9.76, ktb.value, ust.value));
    expect(marketReading("kr-auto-cost-of-capital")?.value).toBe(9.73);
    expect(marketReading("kr-food-cost-of-capital")?.value).toBe(6.82);
  });

  it("turn a rate into another money the way val-india teaches: by the ratio of one plus each 10-year yield", () => {
    // 9.76% in dollars, with won at 3.385% and dollars at 4.18%: 1.0976 times 1.03385 over 1.0418 is 1.0892, so 8.92%.
    expect(rateInOtherMoney(9.76, 3.385, 4.18)).toBe(8.92);
    expect(rateInOtherMoney(10, 5, 5)).toBe(10);
    expect(rateInOtherMoney(8, 7.58, 2.04)).toBeGreaterThan(13);
  });

  it("hold no Korean software yardstick: the Emerging Markets row's 0.28% margin is no fair one for a Korean software maker (G07)", () => {
    expect(MARKET_READINGS.filter((r) => r.market === "KR" && r.industry === "Software (System & Application)")).toEqual([]);
  });

  it("hold a dated 10-year government bond reading for each: JGB 2.817% (MOF) and KTB 4.008% (Bank of Korea), 30 Oct 2026", () => {
    const jgb = marketReading("jp-risk-free-10y")!;
    const ktb = marketReading("kr-risk-free-10y")!;
    expect([jgb.kind, jgb.value, jgb.date, new URL(jgb.sourceUrl).host]).toEqual(["risk_free", 2.817, "2026-10-30", "www.mof.go.jp"]);
    expect([ktb.kind, ktb.value, ktb.date, new URL(ktb.sourceUrl).host]).toEqual(["risk_free", 4.008, "2026-10-30", "ecos.bok.or.kr"]);
    expect(readingMonth(jgb.date)).toBe("Oct 2026");
    // The file of every day, which keeps the 30 Oct 2026 row; the one-month jgbcm.csv drops it in November (G26).
    expect(jgb.sourceUrl).toBe("https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv");
  });

  it("are every one dated, sourced, credited and linked, and pass the course check", () => {
    const ours = MARKET_READINGS.filter((r) => r.market === "JP" || r.market === "KR");
    // Japan: four industries and the JGB; Korea: three industries, the KTB, and the KTB at the end of 2025.
    expect(ours).toHaveLength(4 * 3 + 1 + (3 * 3 + 2));
    for (const r of ours) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.source.length).toBeGreaterThan(3);
      expect(r.credit.length).toBeGreaterThan(3);
      expect(r.sourceUrl).toMatch(/^https:\/\//);
    }
    expect(marketReadingErrors(ours)).toEqual([]);
  });

  it("the course check fails a risk-free reading with no date or no source", () => {
    const jgb = marketReading("jp-risk-free-10y")!;
    expect(marketReadingErrors([{ ...jgb, date: undefined }])).toEqual([expect.stringContaining('"jp-risk-free-10y" needs date')]);
    expect(marketReadingErrors([{ ...jgb, source: undefined }])).toEqual([expect.stringContaining('"jp-risk-free-10y" needs source')]);
  });
});

describe("the range check in Japan and Korea", () => {
  it("names an input far from the Japanese industry's yardstick, and says Korea's come from emerging markets", () => {
    const [jp] = rangeCheck({ marginPercent: 45 }, { market: "JP", industry: "food" });
    expect(jp.sentence).toBe("Your operating margin of 45% is far above Food Processing's 5.11% in Japan (Jan 2026): more than double it.");
    expect(jp.yardstick.id).toBe("jp-food-margin");
    const [kr] = rangeCheck({ costOfCapitalPercent: 30 }, { market: "KR", industry: "market" });
    expect(kr.sentence).toContain("in emerging markets (Jan 2026): more than 3 points above it.");
    expect(rangeCheck({ marginPercent: 10, salesToCapital: 1.2, costOfCapitalPercent: 10 }, { market: "KR", industry: "market" })).toEqual([]);
  });
});
