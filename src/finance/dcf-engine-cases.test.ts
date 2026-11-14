import { describe, expect, it } from "vitest";
import { valueStory, type DcfInputs } from "./dcf-engine";
import { toEngineInputs } from "./valuation-case";
import { valuationCase } from "./valuation-cases";

// Golden numbers for the engine's three extensions to spec B1 (a tax rate by year, sales to capital by year, failure
// recovering a share of the going concern), from the verified research in docs/research/verify-*.json. The inputs
// are the Cases' own blocks, as course/topics holds them; every expected figure is the published one, or the verifier's
// independent engine where the research says what B1 gives without the extension.

function inputs(id: string): DcfInputs {
  const block = valuationCase(id);
  if (!block) throw new Error(`no valuation block for ${id}`);
  return toEngineInputs(block);
}

/** The story without one of its optional paths, to show what plain B1 gives. */
function without(story: DcfInputs, key: "taxRateByYear" | "salesToCapitalByYear"): DcfInputs {
  const copy = { ...story };
  delete copy[key];
  return copy;
}

function valued(story: DcfInputs) {
  const result = valueStory(story);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("a tax rate that changes by year: Damodaran's Uber, June 2014 (ubervaluation.xls)", () => {
  const uber = valued(inputs("uber-vc-narrative-2014"));

  it("with tax rising 31% to 40% the company is worth $5,894.89m after a 10% chance of failure, as published", () => {
    expect(uber.valuePerShare.toFixed(2)).toBe("5894.89");
  });

  it("each year's free cash flow matches the sheet: -56.58, 4.21, 75.71, 155.68, 242.76, 336.14, 435.45, 540.60, 651.72, 775.93", () => {
    expect(uber.years.map((y) => y.fcf.toFixed(2))).toEqual(["-56.58", "4.21", "75.71", "155.68", "242.76", "336.14", "435.45", "540.60", "651.72", "775.93"]);
  });

  it("the terminal value is $14,417.95m, and 79% of the value comes from after year 10", () => {
    expect(uber.terminalValue.toFixed(2)).toBe("14417.95");
    expect(Math.round(uber.terminalShare * 100)).toBe(79);
  });

  it("at a flat 40% (B1 without the tax path) it is $5,818.68m, 1.3% under", () => {
    expect(valued(without(inputs("uber-vc-narrative-2014"), "taxRateByYear")).valuePerShare.toFixed(2)).toBe("5818.68");
  });

  it("the December 2014 spreadsheet's opening story is $17,404.34m with the tax path ($17,230.63m at a flat 40%)", () => {
    const crowd = inputs("fol-uber-2014-crowd");
    expect(valued(crowd).valuePerShare.toFixed(2)).toBe("17404.34");
    expect(valued(without(crowd, "taxRateByYear")).valuePerShare.toFixed(2)).toBe("17230.63");
  });

  it("Bill Gurley's story in the same sheet is $53,380.42m (published $53,380.39m)", () => {
    expect(valued(inputs("jud-nn-uber-2014-post")).valuePerShare.toFixed(2)).toBe("53380.42");
  });

  it("the S-1 valuation of April 2019 is $53.90 a share, with $1,147m of losses carried forward", () => {
    expect(valued(inputs("jud-nn-uber-s1-2019")).valuePerShare.toFixed(2)).toBe("53.90");
  });

  it("refuses a tax path that is not ten years or leaves 0% to 100%", () => {
    const uberInputs = inputs("uber-vc-narrative-2014");
    expect(valueStory({ ...uberInputs, taxRateByYear: [0.31, 0.32] }).ok).toBe(false);
    expect(valueStory({ ...uberInputs, taxRateByYear: Array(10).fill(1.2) }).ok).toBe(false);
  });
});

describe("sales to capital by year, and failure recovering half the going concern: Tesla, February 2020", () => {
  const tesla = valued(inputs("fol-tesla-2020-diy"));

  it("is $426.58 a share, as in the DIY post's value picture", () => {
    expect(tesla.valuePerShare.toFixed(2)).toBe("426.58");
  });

  it("each year's free cash flow is the picture's -1,199, -900, -377, 464, 1,750, 492, 2,314, 4,668, 7,395, 10,221", () => {
    expect(tesla.years.map((y) => Math.round(y.fcf))).toEqual([-1199, -900, -377, 464, 1750, 492, 2314, 4668, 7395, 10221]);
  });

  it("the going concern is $97,390m, and failure recovers half of it, $48,694.82m", () => {
    expect(Math.round(tesla.goingConcern)).toBe(97390);
    expect(tesla.recovered.toFixed(2)).toBe("48694.82");
  });

  it("one sales to capital for all ten years misses: 3 gives $452.64 and 2 gives $392.56, recovery held at $48,694.82m", () => {
    const flat = without(inputs("fol-tesla-2020-diy"), "salesToCapitalByYear");
    const fixed = { chance: 0.1, recovered: 48694.82 };
    expect(valued({ ...flat, salesToCapital: 3, failure: fixed }).valuePerShare.toFixed(2)).toBe("452.64");
    expect(valued({ ...flat, salesToCapital: 2, failure: fixed }).valuePerShare.toFixed(2)).toBe("392.56");
  });

  it("recovery tied to the going concern moves with the story; a fixed amount does not", () => {
    const tied = valued({ ...inputs("fol-tesla-2020-diy"), salesToCapitalByYear: Array(10).fill(3) });
    expect(tied.recovered).toBeCloseTo(tied.goingConcern / 2, 6);
    expect(tied.valuePerShare).toBeGreaterThan(452.64);
  });
});

describe("Zomato, July 2021, and WeWork, September 2019: both extensions at once", () => {
  it("Zomato is Rs 40.79 a share (the engine's Rs 40.788 against the sheet's 40.788)", () => {
    const zomato = valued(inputs("zomato-ipo-2021"));
    expect(zomato.valuePerShare.toFixed(3)).toBe("40.788");
    expect(zomato.years.map((y) => Math.round(y.fcf))).toEqual([-5305, -3053, -1320, -102, 4471, 7968, 17549, 29429, 34372, 38325]);
  });

  it("WeWork is $26.18 a share, failure recovering 60% of a $34,098m going concern", () => {
    const wework = valued(inputs("wework-leases-2019"));
    expect(wework.valuePerShare.toFixed(2)).toBe("26.18");
    expect(Math.round(wework.goingConcern)).toBe(34098);
    expect(Math.round(wework.businessValue)).toBe(31370);
  });

  it("a recovered share outside 0% to 100% is refused", () => {
    const zomato = inputs("zomato-ipo-2021");
    expect(valueStory({ ...zomato, failure: { chance: 0.1, recoveredShare: 1.5 } }).ok).toBe(false);
  });
});
