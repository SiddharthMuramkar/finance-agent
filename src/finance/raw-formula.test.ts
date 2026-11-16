import { describe, expect, it } from "vitest";
import { hasRawFormula, rawFormulaHits } from "./raw-formula";

describe("raw-formula detector", () => {
  it.each([
    "PV = amount / (1 + r)^n",
    "The price is V_n = V_0 x (1 + g)^n.",
    "PV = 1,100 / (1 + 0.10)^1 = 1,000.",
    "Divide: 1,210 / 1.21 = 1,000.",
    "The factor (1 + r) grows each year.",
    "Divide by 1.10 ^ 2 to discount.",
    "It compounds as 1.05² over two years.",
    "Net margin = net income / revenue",
    "Take 5,000 × 0.9 to get the answer.",
    "WACC = (E/V) x Re + (D/V) x Rd x (1 - T)",
    "The value is amount / (rate - growth).",
    "The sum is Σ of each payment.",
    // Formulas built from words or letters (review F10): every one of these was on a Topic's main path.
    "The cost of equity is then riskfree rate + beta x (mature market premium + CRP).",
    "GDP by spending is C + I + G + (X - M).",
    "The price per share is pre-money valuation / shares outstanding before the round.",
    "Their share is multiplied by (1 - new investors' share).",
    "The share can only go up to S x u or down to S x d.",
    "An asset with duration D loses about D x the change in yield.",
    "A cost of equity of 12.90% (6.5% + 1.60 x 4%).",
    "After-tax cash flow is profit × (1 - tax rate).",
    "Enterprise value divides (market value of equity + debt - cash) by a measure of the business.",
    "Probability of survival x going concern value + probability of distress x distress sale value.",
    "At expiry a call is worth max(S - K, 0).",
    // A payoff typed as a function, even with no letters between capitals (review 2, G30).
    "A put pays max(strike - price, 0) at expiry.",
    "The floor is min(loss, cap).",
    "The weights are E / V and D / V.",
    // Still caught after the rules were narrowed for prose (review 3, L16).
    "The value is price × shares outstanding.",
    "Divide sales ÷ capital to get the ratio.",
    "Take x x y for the area.",
    "Its cost is debt / (debt + equity).",
    "Earnings + 2 x growth gives the score.",
  ])("flags the typed formula %j", (text) => {
    expect(hasRawFormula(text)).toBe(true);
  });

  it.each([
    "A P/E of 15 means investors pay fifteen times earnings.",
    "A 50/50 split between stocks and bonds.",
    "The draw was on 23 October 2018, and the window ran to 2019-04-21 (4/21/2019).",
    "The cash option was $877.8 million, about 57% of the $1.537 billion headline.",
    "A flat fee of ₹2,50,000 and a loan of Rs 1,20,00,000 crore-scale at 8.5% a year.",
    "Debt/equity and price/book are ratios, written without spaces.",
    "Rates went from 5% to 7%, up 2 percentage points; 30 payments over 29 years.",
    "Waiting one year at 10% means dividing by 1.10 once.",
    "Read it at https://example.com/page?year=2018&rate=5 for the details.",
    "Revenue was at least 5 and at most 10, i.e. a >= 5 test in prose is not a formula.",
    "The draw - a lottery - paid out in 2019, and Topic 2 - the annuity - explains why.",
    "A 5x return and a 2x2 grid; 18+ readers only; buy and/or sell.",
    "Multiply 1.60 by the 4% premium and add the 6.5% riskfree rate.",
    "Plan A - the cheap one - won, and Plan B - the dear one - lost.",
    "* A Markdown bullet\n* another bullet\nand a line after it.",
    "The max (most) a buyer can lose is the premium; at a minimum (min) it is zero.",
    // Ordinary prose the F10 rules caught (review 3, L16); the detector also grades Tutor replies.
    "Time runs along the x axis and the value up the y axis.",
    "Plot the years on the x axes of both charts.",
    "A P/E of 20 x earnings is what buyers paid for each share.",
    "Sort each figure as price / value.",
    "Tata Motors + JLR sold more cars that year.",
    "Its 2008 deal (Tata Motors + JLR) closed in June.",
  ])("leaves %j alone", (text) => {
    expect(rawFormulaHits(text)).toEqual([]);
  });

  it("ignores formula markers, code fences (widgets and sources) and links", () => {
    expect(hasRawFormula("For example, {{formula:present-value amount=1000 ratePercent=10 years=5}} It falls with the rate.")).toBe(false);
    expect(hasRawFormula('Here you go.\n```openui-lang\nroot = Widget("x", [a])\n$rate = 3\n```')).toBe(false);
    expect(hasRawFormula('Answer.\n```sources\n[{"n":1,"title":"a = b"}]\n```')).toBe(false);
  });

  it("ignores the target of a Citation marker and a sources fence in a cited reply", () => {
    expect(hasRawFormula("Discounting shrinks later cash [1](/passages/12?blocks=3-5) and the rate matters [2](/passages/7?blocks=1-2).")).toBe(false);
    expect(hasRawFormula('Later cash is worth less [1](/passages/12?blocks=3-5).\n```sources\n[{"n":1,"title":"Damodaran"}]\n```')).toBe(false);
  });

  it("says which sign it found and quotes where", () => {
    const hits = rawFormulaHits("so PV = amount / (1 + r)^n holds");
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.some((h) => h.startsWith("an equals sign") && h.includes("PV = amount"))).toBe(true);
  });
});
