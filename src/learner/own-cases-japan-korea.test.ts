import { describe, expect, it } from "vitest";
import { openingEstimate, valueOwnCase, type OwnCaseInputs } from "@/finance/own-case";
import { ownCaseNote } from "./own-cases";

// The one-page note of a Japanese or Korean Own Case (spec #68, ticket #114) names its market and writes its money in
// yen or won, whole, as those currencies have no minor unit. Kikkoman's figures: src/finance/own-case-japan-korea.test.ts.

const NOW = new Date("2026-11-16T10:00:00Z");
const KIKKOMAN: OwnCaseInputs = { company: "Kikkoman", market: "JP", reportDate: "2026-03-31", industry: "food", sales: 745_539, operatingProfit: 75_940, taxPercent: 30.5, debt: 18_217, cash: 111_770, shares: 927_741_900, price: 1_435 };
const SAMSUNG: OwnCaseInputs = { company: "Samsung Electronics", market: "KR", reportDate: "2025-12-31", industry: "market", sales: 333_605_938, operatingProfit: 43_601_051, taxPercent: 26.4, debt: 25_239_139, cash: 57_856_378, shares: 5_827_808_935, price: 119_900 };

function note(inputs: OwnCaseInputs) {
  const estimate = openingEstimate(inputs.industry, inputs.market);
  const value = valueOwnCase(inputs, estimate, NOW);
  if (!value.ok) throw new Error(value.error);
  return ownCaseNote(inputs, estimate, value);
}

describe("the one-page note of a Japanese or Korean Own Case", () => {
  it("names Japan and writes yen", () => {
    const text = note(KIKKOMAN);
    expect(text).toContain("Kikkoman, Japan. Annual report of 31 Mar 2026. Industry: Food processors.");
    expect(text).toContain("price ¥1,435 on 31 Mar 2026");
    expect(text).toContain("¥1.92 of sales for each ¥1 invested");
    expect(text).toMatch(/The engine's value: ¥[\d,]+ a share, beside a price of ¥1,435 on 31 Mar 2026\./);
    expect(text).not.toMatch(/₹|crore/);
  });

  it("names Korea and writes won", () => {
    const text = note(SAMSUNG);
    expect(text).toContain("Samsung Electronics, Korea. Annual report of 31 Dec 2025.");
    expect(text).toContain("price ₩119,900 on 31 Dec 2025");
    expect(text).not.toMatch(/your story|cheap|dear|undervalued|overvalued|\bbuy\b|\bsell\b/i);
  });
});
