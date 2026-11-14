import { describe, expect, it } from "vitest";
import { impliedPremium, impliedPremiumBlock } from "./implied-erp";

// Golden numbers from Damodaran's ERP paper (Tables 16 and 17) and histimpl.xls, as docs/research/verify-amazon-risk-erp.json
// re-checked them: the S&P 500 at the end of 2007, and on 1 January 2009.

const end2007 = impliedPremiumBlock.parse({
  index: { name: "S&P 500", level: 1468.36, date: "2007-12-31" },
  riskFreePercent: 4.02,
  cashYieldPercent: 4.02,
  growthPercent: 5,
  growthAfterPercent: 4.02,
  published: { requiredReturnPercent: 8.39, premiumPercent: 4.37 },
  sources: [{ title: "ERP paper", url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/ERPpageproof.pdf" }],
});

describe("the implied equity risk premium (Spine Topic 13)", () => {
  const solved = impliedPremium(end2007);

  it("the cash flows are Table 17's 61.98, 65.08, 68.33, 71.75, 75.34 and then 78.36", () => {
    expect(solved.cashFlows.map((c) => c.toFixed(2))).toEqual(["61.98", "65.08", "68.33", "71.75", "75.34", "78.36"]);
  });

  it("the index at 1,468.36 implies a return of 8.39% and a premium of 4.37% over the 4.02% bond", () => {
    expect((solved.requiredReturn * 100).toFixed(2)).toBe("8.39");
    expect((solved.premium * 100).toFixed(2)).toBe("4.37");
  });

  it("on 1 January 2009 (index 903.25, bond 2.21%, cash 52.58 growing 4%) the premium was 6.43%", () => {
    const jan2009 = impliedPremium({ ...end2007, index: { ...end2007.index, level: 903.25 }, riskFreePercent: 2.21, cashYieldPercent: (52.58 / 903.25) * 100, growthPercent: 4, growthAfterPercent: 2.21 });
    expect((jan2009.requiredReturn * 100).toFixed(2)).toBe("8.64");
    expect((jan2009.premium * 100).toFixed(2)).toBe("6.43");
  });

  it("faster growth implies a higher premium: 3%, 4%, 6% and 7% give 3.99%, 4.18%, 4.56% and 4.76%", () => {
    expect([3, 4, 6, 7].map((g) => (impliedPremium({ ...end2007, growthPercent: g }).premium * 100).toFixed(2))).toEqual(["3.99", "4.18", "4.56", "4.76"]);
  });
});
