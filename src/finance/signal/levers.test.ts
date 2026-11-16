import { describe, expect, it } from "vitest";
import { valueCase } from "../valuation-case";
import { AMAZON, CASE_ID, engineLevers, LEVERS, leverBand, leverEffects, leverSettings, leversModel, PRESETS, PRICE, REFERENCE, REFERENCE_VALUE, snapLever, type Levers } from "./levers";

// The four levers model (Signal spec §6.2.1; decision #18, option C): the valuation engine on Case amazon-dcf-2000. The
// golden tests work at two levels. First, the engine reproduces Damodaran's published valuation: his story is the Case
// itself, within 2% of his $35.08 (the engine's own goldens are in valuation-case.test.ts and dcf-engine.test.ts). Second,
// the widget rows below are pinned to the engine's output to the cent, as the spec's §6.2.4 table now lists them, and the
// lever effects add up to the whole change.

describe("the Case behind the widget", () => {
  it("is Damodaran's Amazon, February 2000, at the $84 price of 3 February 2000", () => {
    expect(CASE_ID).toBe("amazon-dcf-2000");
    expect(AMAZON.published.valuePerShare).toBe(35.08);
    expect(PRICE).toBe(84);
    expect(AMAZON.price.date).toBe("2000-02-03");
  });

  it("his story is the Case's own story: the engine's $35.04, within 2% of the published $35.08", () => {
    const own = valueCase(AMAZON);
    if (!own.ok) throw new Error(own.error);
    expect(engineLevers(REFERENCE)).toEqual({});
    expect(leversModel(REFERENCE).perShare).toBe(own.valuePerShare);
    expect(REFERENCE_VALUE).toBeCloseTo(35.04, 2);
    expect(Math.abs(REFERENCE_VALUE - 35.08) / 35.08).toBeLessThan(0.02);
  });

  it("hands the engine only the levers that moved, revenue in the Case's millions", () => {
    expect(engineLevers({ rev: 60, margin: 10, s2c: 2.5, wacc: 12.84 })).toEqual({ revenueYear10: 60_000, salesToCapital: 2.5 });
    expect(engineLevers({ rev: 39, margin: 12, s2c: 3, wacc: 11.84 })).toEqual({ marginTarget: 12, costOfCapitalGrowing: 11.84 });
  });
});

describe("levers model: his story (the reference)", () => {
  const his = leversModel(PRESETS.damodaran.levers);

  it("is worth $35.04 a share", () => {
    expect(his.perShare).toBeCloseTo(35.04, 2);
  });

  it("splits into −5.19 from years 1 to 10, +49.66 after year 10 and −9.43 owed to others", () => {
    expect(his.yrs).toBeCloseTo(-5.19, 2);
    expect(his.after).toBeCloseTo(49.66, 2);
    expect(his.owes).toBeCloseTo(9.43, 2);
    expect(his.yrs + his.after - his.owes).toBeCloseTo(his.perShare, 10);
  });

  it("gets 111.7% of its value from after year 10", () => {
    expect(his.tvShare).not.toBeNull();
    expect(his.tvShare! * 100).toBeCloseTo(111.7, 1);
  });

  it("burns cash in years 1 to 6 and makes it in years 7 to 10, in dollars a share today", () => {
    const engine = [-2.42, -2.36, -2.02, -1.37, -0.65, -0.23, 0.23, 0.72, 1.23, 1.7];
    expect(his.flowsPerShare).toHaveLength(10);
    his.flowsPerShare.forEach((flow, i) => expect(flow).toBeCloseTo(engine[i], 2));
  });
});

// §6.2.4: value, years 1–10, after year 10, owes, after-year-10 share (null is the spec's "—"), and the effects in the
// order big / keeps / costs / risky. Every number is the engine's, to the cent.
type Story = { name: string; levers: Levers; value: number; yrs: number; after: number; tvSharePercent: number | null; effects: [number, number, number, number] };
const stories: Story[] = [
  { name: "His story", levers: PRESETS.damodaran.levers, value: 35.04, yrs: -5.19, after: 49.66, tvSharePercent: 111.7, effects: [0, 0, 0, 0] },
  { name: "Grocer", levers: PRESETS.grocer.levers, value: 1.3, yrs: -14.1, after: 24.83, tvSharePercent: 231.4, effects: [0, -33.75, 0, 0] },
  { name: "One story worth $84", levers: PRESETS.price.levers, value: 83.69, yrs: -2.93, after: 96.06, tvSharePercent: 103.2, effects: [26.69, 17.3, 0, 4.66] },
  {
    name: "That story with risk at 17.44%",
    levers: { ...PRESETS.price.levers, wacc: 17.44 },
    value: 54.3, yrs: -3.98, after: 67.71, tvSharePercent: 106.2, effects: [22.21, 14.63, 0, -17.57],
  },
  {
    name: "All four at maximum value",
    levers: { rev: 80, margin: 20, s2c: 6, wacc: 8.04 },
    value: 322.34, yrs: 54.12, after: 277.65, tvSharePercent: 83.7, effects: [101.99, 119.96, 16.69, 48.66],
  },
  {
    name: "All four at minimum value",
    levers: { rev: 5, margin: 0, s2c: 1, wacc: 17.84 },
    value: -17.37, yrs: -7.93, after: 0, tvSharePercent: null, effects: [7.04, -36.06, -20.82, -2.57],
  },
];
const KEYS = ["rev", "margin", "s2c", "wacc"] as const;

describe("levers model: the §6.2.4 acceptance stories", () => {
  describe.each(stories)("$name", ({ levers, value, yrs, after, tvSharePercent }) => {
    const result = leversModel(levers);

    it(`is worth ${value} a share`, () => {
      expect(result.perShare).toBeCloseTo(value, 2);
    });

    it(`splits into ${yrs} from years 1 to 10, ${after} after year 10 and −9.43 owed`, () => {
      expect(result.yrs).toBeCloseTo(yrs, 2);
      expect(result.after).toBeCloseTo(after, 2);
      expect(result.owes).toBeCloseTo(9.43, 2);
    });

    it(`gets ${tvSharePercent ?? "no share (the business is worth nothing)"}% of its value after year 10`, () => {
      if (tvSharePercent === null) expect(result.tvShare).toBeNull();
      else expect(result.tvShare! * 100).toBeCloseTo(tvSharePercent, 1);
    });
  });
});

describe("lever effects: what each lever adds to or takes from his story (Shapley)", () => {
  describe.each(stories)("$name", ({ levers, effects }) => {
    const got = leverEffects(levers);

    it(`are ${effects.join(" / ")} dollars a share (big / keeps / costs / risky)`, () => {
      KEYS.forEach((key, i) => expect(got[key]).toBeCloseTo(effects[i], 2));
    });

    it("are exactly zero for every lever left at his value", () => {
      KEYS.filter((key) => levers[key] === REFERENCE[key]).forEach((key) => expect(got[key]).toBe(0));
    });

    it("add up to the whole difference from his story", () => {
      const sum = KEYS.reduce((total, key) => total + got[key], 0);
      expect(sum).toBeCloseTo(leversModel(levers).perShare - leversModel(REFERENCE).perShare, 10);
    });
  });

  it("do not depend on the order the levers were moved in: margin then risk equals risk then margin", () => {
    const both = leverEffects({ ...REFERENCE, margin: 15, wacc: 10.04 });
    const marginOnly = leversModel({ ...REFERENCE, margin: 15 }).perShare - leversModel(REFERENCE).perShare;
    const riskOnly = leversModel({ ...REFERENCE, wacc: 10.04 }).perShare - leversModel(REFERENCE).perShare;
    const together = leversModel({ ...REFERENCE, margin: 15, wacc: 10.04 }).perShare - leversModel(REFERENCE).perShare;
    // Two levers moved: each gets its own move plus half of what the two do together beyond their separate moves.
    const interaction = together - marginOnly - riskOnly;
    expect(both.margin).toBeCloseTo(marginOnly + interaction / 2, 10);
    expect(both.wacc).toBeCloseTo(riskOnly + interaction / 2, 10);
  });
});

// §6.2.1 band table: one lever on its own, the other three at his values.
const bands: { key: (typeof KEYS)[number]; atMin: number; atMax: number; reach: number | null }[] = [
  { key: "rev", atMin: -3.19, atMax: 81.09, reach: null },
  { key: "margin", atMin: -34.02, atMax: 102.3, reach: 17.5 },
  { key: "s2c", atMin: -4.55, atMax: 44.94, reach: null },
  { key: "wacc", atMin: 53.37, atMax: 21.71, reach: null },
];

describe("lever band: what one lever can do on its own", () => {
  it.each(bands)("$key: $atMin at its minimum, $atMax at its maximum, reaches the price on its own at $reach", ({ key, atMin, atMax, reach }) => {
    const band = leverBand(key);
    expect(band.atMin).toBeCloseTo(atMin, 2);
    expect(band.atMax).toBeCloseTo(atMax, 2);
    expect(band.lo).toBe(Math.min(band.atMin, band.atMax));
    expect(band.hi).toBe(Math.max(band.atMin, band.atMax));
    expect(band.reach).toBe(reach);
  });

  it("runs backwards for risk: the safest setting is the high end of the band", () => {
    const band = leverBand("wacc");
    expect(band.hi).toBe(band.atMin);
    expect(band.lo).toBe(band.atMax);
  });

  it("steps every slider setting on its grid, ends included", () => {
    expect(leverSettings(LEVERS[3])).toHaveLength(50);
    expect(leverSettings(LEVERS[3]).at(-1)).toBe(17.84);
    expect(leverSettings(LEVERS[3])).toContain(11.84);
    expect(leverSettings(LEVERS[3])).toContain(17.44);
  });
});

describe("snapLever", () => {
  it("snaps a raw value to its lever's step and range", () => {
    expect(snapLever("margin", 12.3)).toBe(12.5);
    expect(snapLever("wacc", 11.9)).toBe(11.84);
    expect(snapLever("rev", 120)).toBe(80);
    expect(snapLever("s2c", -4)).toBe(1);
    expect(snapLever("rev", Number.NaN)).toBe(39);
  });
});

describe("QA checklist (§13)", () => {
  // A pill shows the effect in whole dollars; under 50 cents it is an invisible placeholder (null here).
  const pills = (levers: Levers) => {
    const effects = leverEffects(levers);
    return KEYS.map((key) => (Math.abs(effects[key]) < 0.5 ? null : Math.round(effects[key])));
  };

  it("6: one story worth $84 shows $84, reaches the price, with pills +$27, +$17, none, +$5", () => {
    expect(PRESETS.price.levers).toEqual({ rev: 59, margin: 12, s2c: 3, wacc: 11.84 });
    expect(Math.round(leversModel(PRESETS.price.levers).perShare)).toBe(84);
    expect(pills(PRESETS.price.levers)).toEqual([27, 17, null, 5]);
  });

  it("7: a grocer's margins shows $1, with one red pill, −$34, under What it keeps", () => {
    expect(Math.round(leversModel(PRESETS.grocer.levers).perShare)).toBe(1);
    expect(pills(PRESETS.grocer.levers)).toEqual([null, -34, null, null]);
  });

  it("10: What it keeps on its own runs from $0 to $102 a share and reaches $84 at 17.5%", () => {
    const band = leverBand("margin");
    expect(Math.max(0, Math.round(band.lo))).toBe(0);
    expect(Math.round(band.hi)).toBe(102);
    expect(band.reach).toBe(17.5);
  });

  it("11: What it keeps at 17.5% is worth 85.50, the first setting at or above $84; 17% gives $82", () => {
    expect(leversModel({ ...REFERENCE, margin: 17.5 }).perShare).toBeCloseTo(85.5, 2);
    expect(Math.round(leversModel({ ...REFERENCE, margin: 17 }).perShare)).toBe(82);
    expect(leverBand("margin").reach).toBe(17.5);
  });
});
