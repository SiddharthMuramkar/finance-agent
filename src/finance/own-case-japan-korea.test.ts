import { describe, expect, it } from "vitest";
import { marketReading } from "../markets/readings";
import { OWN_CASE_MARKETS, openingEstimate, ownCaseBlock, ownCaseIndustries, ownCaseMarket, valueOwnCase, type OwnCaseInputs } from "./own-case";

// Seam 3 (spec #68, ticket #114): an Own Case in Japan or Korea is the same valuation shape, in yen or won millions as
// the annual report prints them, valued by the one engine (ADR 0010). Figures as a Learner copies them:
// - Kikkoman, 有価証券報告書 for the year to 31 Mar 2026 (EDINET S100YE5V, filed 2026-06-19), IFRS, 百万円:
//   https://disclosure2dl.edinet-fsa.go.jp/searchdocument/pdf/S100YE5V.pdf . Debt = 短期借入金 3,817 + 1年内返済予定の
//   長期借入金 400 + 長期借入金 14,000; shares = 発行済株式総数 969,416,010 − 自己株式 41,674,110; tax = 法定実効税率 30.5%.
//   TSE close on 31 Mar 2026: ¥1,435.
// - Samsung Electronics, 2025 Business Report (year to 31 Dec 2025), K-IFRS, KRW millions:
//   https://images.samsung.com/is/content/samsung/assets/global/ir/docs/2025_4Q_Interim_Report.pdf . Debt = short-term
//   borrowings 17,574,980 + current portion of long-term liabilities 1,177,508 + debentures 7,134 + long-term borrowings
//   6,479,517; common shares outstanding 5,827,808,935; tax 26.4% (24% top rate plus 10% local, 2025). KRX close on
//   30 Dec 2025, the year's last trading day: ₩119,900.

const KIKKOMAN: OwnCaseInputs = {
  company: "Kikkoman",
  market: "JP",
  reportDate: "2026-03-31",
  industry: "food",
  sales: 745_539,
  operatingProfit: 75_940,
  taxPercent: 30.5,
  debt: 18_217,
  cash: 111_770,
  shares: 927_741_900,
  price: 1_435,
};

const SAMSUNG: OwnCaseInputs = {
  company: "Samsung Electronics",
  market: "KR",
  reportDate: "2025-12-31",
  industry: "market",
  sales: 333_605_938,
  operatingProfit: 43_601_051,
  taxPercent: 26.4,
  debt: 25_239_139,
  cash: 57_856_378,
  shares: 5_827_808_935,
  price: 119_900,
};

const NOW = new Date("2026-11-16T10:00:00Z");

describe("Own Cases in Japan and Korea", () => {
  it("offer India, Japan and Korea, each with the four industries its Market readings hold", () => {
    expect(OWN_CASE_MARKETS).toEqual(expect.arrayContaining(["IN", "JP", "KR"]));
    for (const market of ["JP", "KR"] as const) expect(ownCaseIndustries(market).map((i) => i.id)).toEqual(["auto", "food", "software", "market"]);
    const food = ownCaseIndustries("JP").find((i) => i.id === "food")!;
    expect([food.operatingMarginPercent, food.salesToCapital, food.costOfCapitalPercent]).toEqual([5.11, 1.92, 3.84]);
  });

  it("a Japanese report is valued in yen millions, its shares counted in millions, dated at the report with that day's price", () => {
    const built = ownCaseBlock(KIKKOMAN, openingEstimate("food", "JP"), NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.block).toMatchObject({ currency: "JPY", unit: "millions", price: { value: 1435, date: "2026-03-31" }, illustration: true, reproduces: false });
    expect(built.block.shares).toBeCloseTo(927.7419, 4);
    const value = valueOwnCase(KIKKOMAN, openingEstimate("food", "JP"), NOW);
    expect(value.ok && value.valuePerShare > 0).toBe(true);
  });

  it("a Korean report is valued in won millions", () => {
    const built = ownCaseBlock(SAMSUNG, openingEstimate("market", "KR"), NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.block).toMatchObject({ currency: "KRW", unit: "millions", price: { value: 119_900, date: "2025-12-31" } });
    expect(built.block.shares).toBeCloseTo(5827.808935, 6);
    const value = valueOwnCase(SAMSUNG, openingEstimate("market", "KR"), NOW);
    expect(value.ok && value.valuePerShare > 0).toBe(true);
  });

  it("an opening Estimate grows after year 10 at the market's dated risk-free reading, and its cost of capital is the industry's", () => {
    expect(openingEstimate("food", "JP")).toMatchObject({ growthAfterPercent: marketReading("jp-risk-free-10y")!.value, costOfCapitalPercent: 3.84, targetMarginPercent: 5.11 });
    expect(openingEstimate("market", "KR")).toMatchObject({ growthAfterPercent: marketReading("kr-risk-free-10y")!.value, costOfCapitalPercent: 9.76 });
    expect(ownCaseMarket("JP").riskFree?.id).toBe("jp-risk-free-10y");
    expect(ownCaseMarket("KR").riskFree?.id).toBe("kr-risk-free-10y");
  });

  it("India's opening Estimate is as before", () => {
    expect(openingEstimate("food")).toEqual(openingEstimate("food", "IN"));
    expect(openingEstimate("food", "IN").growthAfterPercent).toBe(5);
  });

  it("a market the Assignment does not offer is refused with a readable sentence", () => {
    expect(valueOwnCase({ ...KIKKOMAN, market: "XX" as never }, openingEstimate("food", "JP"), NOW)).toEqual({ ok: false, error: "Pick the company's market." });
  });
});
