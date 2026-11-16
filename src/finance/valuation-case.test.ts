import { describe, expect, it } from "vitest";
import { valueStory, type DcfResult } from "./dcf-engine";
import { marginPath } from "./dcf-paths";
import { AMAZON_2000 } from "./fixtures/amazon-2000.valuation";
import {
  applyLevers,
  caseProvenance,
  inputsFor,
  matchesPublished,
  returnOnNewCapital,
  toEngineInputs,
  valuationBlock,
  valuationInputs,
  valueCase,
  type Levers,
  type ValuationBlockInput,
} from "./valuation-case";

// Golden numbers from spec 2026-11-12: Appendix B.2 (Value levers on Damodaran's Amazon, February 2000, from
// HighGrow.pdf) and the table under decision B3. Each is the value a share with the levers moved, in dollars.

const amazon = valuationBlock.parse(AMAZON_2000);

function valued(result: DcfResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

const perShare = (levers: Levers, block = amazon) => valued(applyLevers(block, levers)).valuePerShare;

/** Within a cent of the spec's figure. */
const expectCents = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);

describe("the valuation block a Topic file's Case holds", () => {
  it("reads the Amazon fixture, filling nothing it left out", () => {
    expect(amazon.lossesCarried).toBe(500);
    expect(amazon.options).toBe(2892);
    expect(amazon.failure).toBeUndefined();
  });

  it("fills losses carried forward and options with 0, and what failure recovers with 0", () => {
    const block = valuationBlock.parse({ ...AMAZON_2000, lossesCarried: undefined, options: undefined, failure: { chancePercent: 10 } });
    expect(block.lossesCarried).toBe(0);
    expect(block.options).toBe(0);
    expect(block.failure).toEqual({ chancePercent: 10, recovered: 0 });
  });

  it("refuses a path that is not ten years, growth after year 10 at the year-10 cost of capital, no sources, and a stray field", () => {
    expect(valuationBlock.safeParse({ ...AMAZON_2000, growthPercent: AMAZON_2000.growthPercent.slice(1) }).success).toBe(false);
    const tooFast = valuationBlock.safeParse({ ...AMAZON_2000, growthAfterPercent: 9.61 });
    expect(tooFast.success).toBe(false);
    expect(tooFast.error?.issues[0].path).toEqual(["growthAfterPercent"]);
    expect(valuationBlock.safeParse({ ...AMAZON_2000, sources: [] }).success).toBe(false);
    expect(valuationBlock.safeParse({ ...AMAZON_2000, sources: [{ title: "No link", url: "HighGrow.pdf" }] }).success).toBe(false);
    expect(valuationBlock.safeParse({ ...AMAZON_2000, story: "Not here" }).success).toBe(false);
  });

  it("values a share unless it says per: company, for a private company counted as one share worth the whole", () => {
    expect(amazon.per).toBe("share");
    const whole = valuationBlock.parse({ ...AMAZON_2000, per: "company", shares: 1, price: { value: 30_000, date: "2000-02-01" } });
    expect(whole.per).toBe("company");
    // One share holds the whole: Amazon's 11,942 for shareholders (Appendix B.1, after options) is its value "a share".
    expect(Math.round(valued(valueCase(whole)).valuePerShare)).toBe(11_942);
    const counted = valuationBlock.safeParse({ ...AMAZON_2000, per: "company" });
    expect(counted.success).toBe(false);
    expect(counted.error?.issues[0].path).toEqual(["shares"]);
    expect(valuationBlock.safeParse({ ...AMAZON_2000, per: "family" }).success).toBe(false);
  });

  it("takes the margin as a halving path or year by year, never a mix of the two", () => {
    const yearly = { marginPercent: [11, 12, 13, 14, 15, 15, 15, 15, 15, 15], afterPercent: 15 };
    expect(valuationBlock.safeParse({ ...AMAZON_2000, margin: yearly }).success).toBe(true);
    expect(valuationBlock.safeParse({ ...AMAZON_2000, margin: { ...yearly, targetPercent: 15 } }).success).toBe(false);
    expect(valuationBlock.safeParse({ ...AMAZON_2000, margin: { marginPercent: yearly.marginPercent } }).success).toBe(false);
  });

  it("turns percents into the engine's fractions; the margin after year 10 is the target when left out", () => {
    const inputs = toEngineInputs(valuationBlock.parse({ ...AMAZON_2000, margin: { startPercent: -36.71, targetPercent: 10 } }));
    expect(inputs.growth[0]).toBe(1.5);
    expect(inputs.costOfCapital[9]).toBeCloseTo(0.0961, 12);
    expect(inputs.margin[0]).toBeCloseTo(-0.13355, 12);
    expect(inputs.marginAfter).toBe(0.1);
    expect(inputs.taxRate).toBe(0.35);
  });
});

describe("a Case's valuation inputs, apart from its provenance", () => {
  const { price, illustration, published, sources, reproduces, ...inputsOnly } = AMAZON_2000;

  it("reads the inputs alone, with no published value, sources or price, and values them as the Case: $35.04", () => {
    const inputs = valuationInputs.parse(inputsOnly);
    expect(valued(valueStory(toEngineInputs(inputs))).valuePerShare.toFixed(2)).toBe("35.04");
    expect(valuationInputs.safeParse({ ...inputsOnly, sources: AMAZON_2000.sources }).success).toBe(false);
  });

  it("reads the provenance alone: price, published value, notes and sources", () => {
    const provenance = caseProvenance.parse({ price, illustration, published, notes: ["How the figures were built."], sources, reproduces });
    expect(provenance.published.valuePerShare).toBe(35.08);
    expect(caseProvenance.safeParse({ price, published, sources, reproduces, baseRevenue: 1640 }).success).toBe(false);
  });

  it("keeps the inputs' own rules: growth after year 10 below the year-10 cost of capital, one share for a whole company", () => {
    expect(valuationInputs.safeParse({ ...inputsOnly, growthAfterPercent: 9.61 }).error?.issues[0].path).toEqual(["growthAfterPercent"]);
    expect(valuationInputs.safeParse({ ...inputsOnly, per: "company" }).error?.issues[0].path).toEqual(["shares"]);
  });
});

describe("the inputs for a set of Lever settings", () => {
  it("are the Case's own inputs when no Lever moves", () => {
    expect(inputsFor(amazon, {})).toEqual({ ok: true, inputs: toEngineInputs(amazon) });
  });

  it("value, by the engine alone, to the Lever golden values: $60bn and 12.5% is $84.07, 2 sales to capital is $25.14", () => {
    const at = (levers: Levers) => {
      const made = inputsFor(amazon, levers);
      if (!made.ok) throw new Error(made.error);
      return valued(valueStory(made.inputs)).valuePerShare;
    };
    expectCents(at({ revenueYear10: 60_000, marginTarget: 12.5 }), 84.07);
    expectCents(at({ salesToCapital: 2 }), 25.14);
  });

  it("show what the Levers moved: year 10's revenue, the margin after year 10, the chance it fails", () => {
    const made = inputsFor(amazon, { revenueYear10: 60_000, marginTarget: 12, failureChance: 20, cash: 1 });
    if (!made.ok) throw new Error(made.error);
    const revenue10 = made.inputs.growth.reduce((r, g) => r * (1 + g), made.inputs.baseRevenue);
    expect(revenue10).toBeCloseTo(60_000, 6);
    expect(made.inputs.marginAfter).toBe(0.12);
    expect(made.inputs.failure).toEqual({ chance: 0.2, recovered: 0 });
    expect(made.inputs.cash).toBe(1);
    expect(made.inputs.debt).toBe(amazon.debt);
  });

  it("refuse a revenue no growth path of the Case's shape reaches, as valuing does", () => {
    const made = inputsFor(amazon, { revenueYear10: -5 });
    expect(made.ok).toBe(false);
    expect(applyLevers(amazon, { revenueYear10: -5 })).toEqual(made);
  });
});

describe("valuing the Case", () => {
  it("values Damodaran's Amazon at $35.04 a share, within 2% of the paper's $35.08, so the fixture says it reproduces", () => {
    expect(valued(valueCase(amazon)).valuePerShare.toFixed(2)).toBe("35.04");
    expect(matchesPublished(amazon)).toBe(true);
    expect(amazon.reproduces).toBe(matchesPublished(amazon));
  });

  it("does not reproduce a published value 3% away", () => {
    expect(matchesPublished(valuationBlock.parse({ ...AMAZON_2000, published: { valuePerShare: 36.2 } }))).toBe(false);
  });

  it("values the round-number case written year by year at 26.01 a share (Appendix B.3)", () => {
    const roundNumbers: ValuationBlockInput = {
      ...AMAZON_2000,
      baseRevenue: 100,
      growthPercent: [20, 20, 20, 20, 20, 16, 12, 8, 4, 3],
      margin: { marginPercent: [11, 12, 13, 14, 15, 15, 15, 15, 15, 15], afterPercent: 15 },
      taxPercent: 25,
      lossesCarried: 0,
      salesToCapital: 2,
      costOfCapitalPercent: [10, 10, 10, 10, 10, 9.6, 9.2, 8.8, 8.4, 8],
      growthAfterPercent: 3,
      returnOnCapitalAfterPercent: 8,
      cash: 20,
      debt: 50,
      options: 0,
      shares: 10,
    };
    expect(valued(valueCase(valuationBlock.parse(roundNumbers))).valuePerShare.toFixed(2)).toBe("26.01");
  });
});

describe("Value levers on Amazon (spec Appendix B.2)", () => {
  it("opens on the Case: no levers moved is the Case exactly, $35.04", () => {
    expect(applyLevers(amazon, {})).toEqual(valueCase(amazon));
    expect(perShare({}).toFixed(2)).toBe("35.04");
  });

  it("revenue in year 10 of $10bn / $20bn / $30bn / $50bn / $60bn / $80bn / $100bn: $2.40 / $13.65 / $24.91 / $47.40 / $58.64 / $81.09 / $103.50", () => {
    const expected = [2.4, 13.65, 24.91, 47.4, 58.64, 81.09, 103.5];
    [10, 20, 30, 50, 60, 80, 100].forEach((bn, i) => expectCents(perShare({ revenueYear10: bn * 1000 }), expected[i]));
  });

  it("margin of 2% / 4% / 6% / 8% / 12% / 15% / 20%: -$19.16 / -$5.49 / $8.06 / $21.57 / $48.51 / $68.70 / $102.30", () => {
    const expected = [-19.16, -5.49, 8.06, 21.57, 48.51, 68.7, 102.3];
    [2, 4, 6, 8, 12, 15, 20].forEach((margin, i) => expectCents(perShare({ marginTarget: margin }), expected[i]));
  });

  it("sales to capital of 1 / 1.5 / 2 / 4 / 5: -$4.55 / $15.25 / $25.14 / $39.99 / $42.96", () => {
    const expected = [-4.55, 15.25, 25.14, 39.99, 42.96];
    [1, 1.5, 2, 4, 5].forEach((ratio, i) => expectCents(perShare({ salesToCapital: ratio }), expected[i]));
  });

  it("cost of capital while it grows of 10% / 11% / 12% / 14% / 16% / 18%: $45.08 / $41.31 / $37.80 / $31.51 / $26.07 / $21.35", () => {
    const expected = [45.08, 41.31, 37.8, 31.51, 26.07, 21.35];
    [10, 11, 12, 14, 16, 18].forEach((rate, i) => expectCents(perShare({ costOfCapitalGrowing: rate }), expected[i]));
  });

  it("chance it fails, nothing recovered, of 10% / 20% / 30%: $30.59 / $26.15 / $21.70", () => {
    const expected = [30.59, 26.15, 21.7];
    [10, 20, 30].forEach((chance, i) => expectCents(perShare({ failureChance: chance }), expected[i]));
  });

  it("stories near the $84 price: $60bn with 12.5% is $84.07, $55bn with 13.5% is $85.77, $80bn with 10% is $81.09", () => {
    expectCents(perShare({ revenueYear10: 60_000, marginTarget: 12.5 }), 84.07);
    expectCents(perShare({ revenueYear10: 55_000, marginTarget: 13.5 }), 85.77);
    expectCents(perShare({ revenueYear10: 80_000, marginTarget: 10 }), 81.09);
  });

  it("$39bn with 17.5% is $85.50: the $39bn is the Case's own year-10 revenue (39,006), so the revenue lever stays put", () => {
    expectCents(perShare({ marginTarget: 17.5 }), 85.5);
  });

  it("keeps what the Case says failure recovers when the chance lever moves", () => {
    const withRecovery = valuationBlock.parse({ ...AMAZON_2000, failure: { chancePercent: 0, recovered: 5000 } });
    const at20 = valued(applyLevers(withRecovery, { failureChance: 20 }));
    // Amazon's going concern is 15,157 (Appendix B.1).
    expect(Math.round(at20.businessValue)).toBe(Math.round(0.8 * 15156.76 + 0.2 * 5000));
  });

  it("moves a margin written year by year as it moves the halving path: Amazon's margins written out, at 12%, are $48.51", () => {
    const written = valuationBlock.parse({ ...AMAZON_2000, margin: { marginPercent: marginPath(-36.71, 10), afterPercent: 10 } });
    expectCents(perShare({}, written), 35.04);
    expectCents(perShare({ marginTarget: 12 }, written), 48.51);
  });

  it("refuses a year-10 revenue no growth path reaches", () => {
    expect(applyLevers(amazon, { revenueYear10: 0 }).ok).toBe(false);
  });
});

describe("what the Learner should find (spec B3)", () => {
  it("margin 10% to 12% is $48.51; sales to capital 3 to 4 is $39.99; cost of capital 12.84% to 11.84% is $38.34", () => {
    expectCents(perShare({ marginTarget: 12 }), 48.51);
    expectCents(perShare({ salesToCapital: 4 }), 39.99);
    expectCents(perShare({ costOfCapitalGrowing: 11.84 }), 38.34);
  });

  it("revenue $10bn above the Case's 39,006 (49,006) is $46.29; at the slider's exact $49bn it is $46.28, a cent off from that $6m", () => {
    expectCents(perShare({ revenueYear10: 49_006 }), 46.29);
    expect(perShare({ revenueYear10: 49_000 })).toBeCloseTo(46.29, 1);
    expect(perShare({ revenueYear10: 49_000 }).toFixed(2)).toBe("46.28");
  });

  it("margin and growth move the value most, the discount rate least", () => {
    const opening = perShare({});
    const moves = [perShare({ marginTarget: 12 }), perShare({ revenueYear10: 49_006 }), perShare({ salesToCapital: 4 }), perShare({ costOfCapitalGrowing: 11.84 })].map((v) => v - opening);
    expect([...moves].sort((a, b) => b - a)).toEqual(moves);
  });
});

// Appendix B.3's round-number case as a block, its margins written year by year.
const roundNumbers = valuationBlock.parse({
  currency: "USD",
  unit: "millions",
  baseRevenue: 100,
  growthPercent: [20, 20, 20, 20, 20, 16, 12, 8, 4, 3],
  margin: { marginPercent: [11, 12, 13, 14, 15, 15, 15, 15, 15, 15], afterPercent: 15 },
  taxPercent: 25,
  salesToCapital: 2,
  costOfCapitalPercent: [10, 10, 10, 10, 10, 9.6, 9.2, 8.8, 8.4, 8],
  growthAfterPercent: 3,
  returnOnCapitalAfterPercent: 8,
  cash: 20,
  debt: 50,
  shares: 10,
  price: { value: 26, date: "2026-01-01" },
  published: { valuePerShare: 26.01 },
  sources: [{ title: "Spec 2026-11-12, Appendix B.3", url: "https://example.com/" }],
  reproduces: true,
} satisfies ValuationBlockInput);

describe("the years after year 10 (the Terminal seesaw, spec B4)", () => {
  it("at the Case's own 6% and 9.61% the terminal value is 52,112 and 112% of the business (Appendix B.1)", () => {
    const result = valued(applyLevers(amazon, { growthAfter: 6, costOfCapitalAfter: 9.61 }));
    expect(Math.round(result.terminalValue)).toBe(52_112);
    expect(Math.round(result.terminalShare * 100)).toBe(112);
  });

  it("on the round-number case, 3% growth gives 541.72, 76.0% of the business (Appendix B.3); 2% gives about 536.46 by rule 7", () => {
    const atCase = valued(applyLevers(roundNumbers, { growthAfter: 3 }));
    expect(atCase.terminalValue.toFixed(2)).toBe("541.72");
    expect((atCase.terminalShare * 100).toFixed(1)).toBe("76.0");
    // Year 10's 374.0035 x 1.02 x 15% x (1 - 25%) x (1 - 2% / 8%) / (8% - 2%) = 536.46.
    expect(valued(applyLevers(roundNumbers, { growthAfter: 2 })).terminalValue).toBeCloseTo(536.46, 2);
  });

  it("refuses growth after year 10 at or above the cost of capital after year 10, in words", () => {
    const result = applyLevers(amazon, { growthAfter: 9.61 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe("Growth after year 10 must be below the year-10 cost of capital, or the value is infinite.");
    expect(applyLevers(amazon, { growthAfter: 7, costOfCapitalAfter: 7 }).ok).toBe(false);
  });

  it("a higher cost of capital after year 10 lowers the terminal value and the value a share", () => {
    const opening = valued(applyLevers(amazon, {}));
    const dearer = valued(applyLevers(amazon, { costOfCapitalAfter: 10.61 }));
    expect(dearer.terminalValue).toBeLessThan(opening.terminalValue);
    expect(dearer.valuePerShare).toBeLessThan(opening.valuePerShare);
  });
});

describe("from the business to one share (the Value bridge, spec B4)", () => {
  it("adds cash 26, takes off debt 349 and options 2,892 from 15,157: 11,942, $35.04 a share (Appendix B.1)", () => {
    const result = valued(applyLevers(amazon, { cash: 26, debt: 349, options: 2892 }));
    expect(Math.round(result.businessValue)).toBe(15_157);
    expect(Math.round(result.equityBeforeOptions)).toBe(14_834);
    expect(Math.round(result.equity)).toBe(11_942);
    expect(result.valuePerShare.toFixed(2)).toBe("35.04");
  });

  it("with no options, shareholders keep the 14,834 before options: $43.53 a share", () => {
    expect(perShare({ options: 0 }).toFixed(2)).toBe((14_834 / 340.79).toFixed(2));
  });

  it("each extra $1,000m of debt or leases takes $1,000m from shareholders, and the business value does not move", () => {
    const more = valued(applyLevers(amazon, { debt: 1349 }));
    expect(Math.round(more.businessValue)).toBe(15_157);
    expect(perShare({}) - more.valuePerShare).toBeCloseTo(1000 / 340.79, 9);
  });
});

describe("the return on new capital (spec C4, Spine Topic 6)", () => {
  it("is margin x sales for each dollar x (1 - tax): Amazon's 10%, $3 and 35% earn 19.5%; at $1 of sales it earns 6.5%", () => {
    expect(returnOnNewCapital(10, 3, 35)).toBeCloseTo(19.5, 12);
    expect(returnOnNewCapital(10, 1, 35)).toBeCloseTo(6.5, 12);
  });

  it("below the cost of capital, faster growth takes value away: at $1 of sales a dollar, Amazon's story is worth less than nothing (Appendix B.2: -$4.55)", () => {
    expectCents(perShare({ salesToCapital: 1 }), -4.55);
  });
});
