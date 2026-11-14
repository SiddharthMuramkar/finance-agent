import { describe, expect, it } from "vitest";
import { valueStory, type DcfInputs } from "./dcf-engine";
import { marginPath } from "./dcf-paths";

// Golden numbers from spec 2026-11-12, Appendix B. Amazon's inputs are Damodaran's (HighGrow.pdf, valuation done
// February 2000), as the val-dcf Topic's Case states them; "the paper" below means that valuation.

const amazon: DcfInputs = {
  baseRevenue: 1117,
  growth: [1.5, 1, 0.75, 0.5, 0.3, 0.252, 0.204, 0.156, 0.108, 0.06],
  margin: marginPath(-0.3671, 0.1),
  marginAfter: 0.1,
  taxRate: 0.35,
  lossesCarried: 500,
  salesToCapital: 3,
  costOfCapital: [0.1284, 0.1284, 0.1284, 0.1283, 0.1281, 0.1213, 0.1162, 0.1108, 0.1049, 0.0961],
  growthAfter: 0.06,
  returnOnCapitalAfter: 0.2,
  cash: 26,
  debt: 349,
  options: 2892,
  shares: 340.79,
};

const roundNumbers: DcfInputs = {
  baseRevenue: 100,
  growth: [0.2, 0.2, 0.2, 0.2, 0.2, 0.16, 0.12, 0.08, 0.04, 0.03],
  margin: [0.11, 0.12, 0.13, 0.14, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15],
  marginAfter: 0.15,
  taxRate: 0.25,
  lossesCarried: 0,
  salesToCapital: 2,
  costOfCapital: [0.1, 0.1, 0.1, 0.1, 0.1, 0.096, 0.092, 0.088, 0.084, 0.08],
  growthAfter: 0.03,
  returnOnCapitalAfter: 0.08,
  cash: 20,
  debt: 50,
  options: 0,
  shares: 10,
};

function valued(inputs: DcfInputs) {
  const result = valueStory(inputs);
  if (!result.ok) throw new Error(result.error);
  return result;
}

const whole = (values: number[]) => values.map((v) => Math.round(v));
const twoPlaces = (values: number[]) => values.map((v) => v.toFixed(2));

describe("valuation engine: Amazon, February 2000 (spec Appendix B.1)", () => {
  const amazonValue = valued(amazon);

  it("each year's free cash flow is within 1 of the paper's -931, -1,024, -989, -758, -408, -163, 177, 625, 1,174, 1,788", () => {
    const published = [-931, -1024, -989, -758, -408, -163, 177, 625, 1174, 1788];
    amazonValue.years.forEach((year, i) => expect(Math.abs(year.fcf - published[i])).toBeLessThanOrEqual(1));
  });

  it("revenue grows to 2,792.5 (the reference table shows 2,792), 5,585, 9,774, 14,661, 19,059, 23,862, 28,729, 33,211, 36,798, 39,006", () => {
    expect(amazonValue.years[0].revenue).toBe(1117 * 2.5);
    expect(whole(amazonValue.years.slice(1).map((y) => y.revenue))).toEqual([5585, 9774, 14661, 19059, 23862, 28729, 33211, 36798, 39006]);
  });

  it("the margin closes half the gap to 10% each year: -13.355% (the reference table shows -13.36%), -1.68%, 4.16%, 7.08%, 8.54%, 9.27%, 9.64%, 9.82%, 9.91%, 9.95%", () => {
    expect(amazonValue.years[0].margin * 100).toBeCloseTo(-13.355, 10);
    expect(twoPlaces(amazonValue.years.slice(1).map((y) => y.margin * 100))).toEqual(["-1.68", "4.16", "7.08", "8.54", "9.27", "9.64", "9.82", "9.91", "9.95"]);
  });

  it("operating income is -373, -94, 407, 1,038, 1,628, 2,212, 2,768, 3,261, 3,646, 3,883 (the reference table)", () => {
    expect(whole(amazonValue.years.map((y) => y.operatingIncome))).toEqual([-373, -94, 407, 1038, 1628, 2212, 2768, 3261, 3646, 3883]);
  });

  it("losses carried forward shield years 3 and 4: tax is 0, 0, 0, 167, then 570, 774, 969, 1,141, 1,276, 1,359 (the reference table)", () => {
    expect(whole(amazonValue.years.map((y) => y.tax))).toEqual([0, 0, 0, 167, 570, 774, 969, 1141, 1276, 1359]);
    // 500 carried in, plus the losses of years 1 and 2, used up by year 4's profit.
    expect(amazonValue.years[1].nolAfter).toBeCloseTo(500 + 372.94 + 93.69, 1);
    expect(amazonValue.years[3].nolAfter).toBe(0);
  });

  it("reinvestment is each rise in revenue over 3: 558.5 (the reference table shows 558), 931, 1,396, 1,629, 1,466, 1,601, 1,623, 1,494, 1,196, 736", () => {
    expect(amazonValue.years[0].reinvestment).toBe((2792.5 - 1117) / 3);
    expect(whole(amazonValue.years.slice(1).map((y) => y.reinvestment))).toEqual([931, 1396, 1629, 1466, 1601, 1623, 1494, 1196, 736]);
  });

  it("year 11's free cash flow is 1,881, as in the paper; the terminal value is 52,112 (the paper's 52,148 uses its rounded 9.61%)", () => {
    expect(Math.round(amazonValue.fcf11)).toBe(1881);
    expect(Math.round(amazonValue.terminalValue)).toBe(52112);
  });

  it("years 1 to 10 are worth -1,767 today and the terminal value 16,924: a business of 15,157 (the paper: 15,170)", () => {
    expect(Math.round(amazonValue.sumPv)).toBe(-1767);
    expect(Math.round(amazonValue.pvTerminal)).toBe(16924);
    expect(Math.round(amazonValue.businessValue)).toBe(15157);
    expect(amazonValue.goingConcern).toBe(amazonValue.businessValue);
  });

  it("shareholders get 14,834 before options and 11,942 after (the paper: 14,847 and 11,955)", () => {
    expect(Math.round(amazonValue.equityBeforeOptions)).toBe(14834);
    expect(Math.round(amazonValue.equity)).toBe(11942);
  });

  it("a share is worth $35.04, between $34.95 and $35.15 (the paper: $35.08)", () => {
    expect(amazonValue.valuePerShare).toBeGreaterThanOrEqual(34.95);
    expect(amazonValue.valuePerShare).toBeLessThanOrEqual(35.15);
    expect(amazonValue.valuePerShare.toFixed(2)).toBe("35.04");
  });

  it("112% of the business's value comes from after year 10 (the paper: 'more than the whole value')", () => {
    expect(Math.round(amazonValue.terminalShare * 100)).toBe(112);
  });
});

describe("valuation engine: the round-number case (spec Appendix B.3)", () => {
  const value = valued(roundNumbers);

  it("revenue is 120.00, 144.00, 172.80, 207.36, 248.83, 288.65, 323.28, 349.15, 363.11, 374.00", () => {
    expect(twoPlaces(value.years.map((y) => y.revenue))).toEqual(["120.00", "144.00", "172.80", "207.36", "248.83", "288.65", "323.28", "349.15", "363.11", "374.00"]);
  });

  it("free cash flow is -0.10, 0.96, 2.45, 4.49, 7.26, 12.57, 19.05, 26.35, 33.87, 36.63", () => {
    expect(twoPlaces(value.years.map((y) => y.fcf))).toEqual(["-0.10", "0.96", "2.45", "4.49", "7.26", "12.57", "19.05", "26.35", "33.87", "36.63"]);
  });

  it("year 11's free cash flow is 27.09 and the terminal value 541.72", () => {
    expect(value.fcf11.toFixed(2)).toBe("27.09");
    expect(value.terminalValue.toFixed(2)).toBe("541.72");
  });

  it("years 1 to 10 are worth 69.50 today, the terminal value 220.65, the business 290.15", () => {
    expect(value.sumPv.toFixed(2)).toBe("69.50");
    expect(value.pvTerminal.toFixed(2)).toBe("220.65");
    expect(value.businessValue.toFixed(2)).toBe("290.15");
  });

  it("shareholders get 260.15, or 26.01 a share, and 76.0% of the value comes from after year 10", () => {
    expect(value.equity.toFixed(2)).toBe("260.15");
    expect(value.equityBeforeOptions).toBe(value.equity);
    expect(value.valuePerShare.toFixed(2)).toBe("26.01");
    expect((value.terminalShare * 100).toFixed(1)).toBe("76.0");
  });
});

describe("valuation engine: failure, and what it refuses", () => {
  it("a 50% chance of failure with 100 recovered weighs the round-number business: 0.5 x 290.15 + 0.5 x 100 = 195.07", () => {
    const value = valued({ ...roundNumbers, failure: { chance: 0.5, recovered: 100 } });
    expect(value.goingConcern.toFixed(2)).toBe("290.15");
    expect(value.businessValue.toFixed(2)).toBe("195.07");
    expect(value.valuePerShare.toFixed(2)).toBe("16.51");
  });

  it("failure with nothing recovered leaves the share of value from after year 10 where it was (76.0%)", () => {
    expect((valued({ ...roundNumbers, failure: { chance: 0.3 } }).terminalShare * 100).toFixed(1)).toBe("76.0");
  });

  it("reports a negative value a share as it is; a Widget, not the engine, shows $0 (Amazon at a 2% margin)", () => {
    const value = valued({ ...amazon, margin: marginPath(-0.3671, 0.02), marginAfter: 0.02 });
    expect(value.valuePerShare).toBeLessThan(0);
  });

  it("refuses growth after year 10 at or above the year-10 cost of capital, as a result rather than a throw", () => {
    for (const growthAfter of [0.0961, 0.1]) {
      const result = valueStory({ ...amazon, growthAfter });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/growth after year 10/i);
    }
    expect(valueStory({ ...amazon, growthAfter: 0.096 }).ok).toBe(true);
  });

  it("refuses a path that is not ten years long, a share count of zero and a chance of failure above 100%", () => {
    expect(valueStory({ ...amazon, growth: amazon.growth.slice(0, 9) })).toEqual({ ok: false, error: "The growth path needs 10 years; it has 9." });
    expect(valueStory({ ...amazon, shares: 0 }).ok).toBe(false);
    expect(valueStory({ ...amazon, failure: { chance: 1.2 } }).ok).toBe(false);
    expect(valueStory({ ...amazon, cash: Number.NaN }).ok).toBe(false);
  });
});
