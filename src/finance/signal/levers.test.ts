import { describe, expect, it } from "vitest";
import { growthScale, leverBand, leverEffects, leversModel, PRESETS, REFERENCE, type Levers } from "./levers";

// The four levers model (Signal spec §6.2.1), Amazon in February 2000. Every expected number below is copied from the
// spec's acceptance tables (§6.2.4) and QA checklist (§13), never worked out the way the code works it out.

describe("growth scale k (bisection, 70 steps)", () => {
  it.each([5, 39, 60, 80])("grows $1.117bn of revenue to $%ibn in year 10 along the fading shape", (rev) => {
    const k = growthScale(rev);
    const shape = [1, 0.85, 0.72, 0.6, 0.5, 0.41, 0.33, 0.26, 0.2, 0.15];
    expect(shape.reduce((revenue, s) => revenue * (1 + k * s), 1.117)).toBeCloseTo(rev, 9);
  });
});

describe("levers model: his story (the reference)", () => {
  const his = leversModel(PRESETS.damodaran.levers);

  it("is worth $35.09 a share", () => {
    expect(his.perShare).toBeCloseTo(35.09, 2);
  });

  it("splits into −5.49 from years 1 to 10, +49.82 after year 10 and −9.24 owed to others", () => {
    expect(his.yrs).toBeCloseTo(-5.49, 2);
    expect(his.after).toBeCloseTo(49.82, 2);
    expect(his.owes).toBeCloseTo(9.24, 2);
  });

  it("gets 112.4% of its value from after year 10", () => {
    expect(his.tvShare).not.toBeNull();
    expect(his.tvShare! * 100).toBeCloseTo(112.4, 1);
  });

  it("burns cash in years 1 to 7 and makes it in years 8 to 10, in dollars a share today", () => {
    const spec = [-1.67, -1.42, -1.05, -1.02, -0.91, -0.66, -0.33, 0.08, 0.53, 0.96];
    expect(his.flowsPerShare).toHaveLength(10);
    his.flowsPerShare.forEach((flow, i) => expect(flow).toBeCloseTo(spec[i], 2));
  });
});

// §6.2.4: value, years 1–10, after year 10, owes, after-year-10 share (null is the spec's "—"), and the effects in the
// order big / keeps / costs / risky.
type Story = { name: string; levers: Levers; value: number; yrs: number; after: number; tvSharePercent: number | null; effects: [number, number, number, number] };
const stories: Story[] = [
  { name: "His story", levers: PRESETS.damodaran.levers, value: 35.09, yrs: -5.49, after: 49.82, tvSharePercent: 112.4, effects: [0, 0, 0, 0] },
  { name: "Grocer", levers: PRESETS.grocer.levers, value: 2.92, yrs: -12.75, after: 24.91, tvSharePercent: 204.8, effects: [0, -32.17, 0, 0] },
  { name: "One story worth $84", levers: PRESETS.price.levers, value: 83.89, yrs: -4.78, after: 97.91, tvSharePercent: 105.1, effects: [27.68, 16.68, 0, 4.44] },
  {
    name: "That story with risk at 17.44%",
    levers: { ...PRESETS.price.levers, wacc: 17.44 },
    value: 55.54, yrs: -4.65, after: 69.43, tvSharePercent: 107.2, effects: [23.21, 14.09, 0, -16.84],
  },
  {
    name: "All four at maximum value",
    levers: { rev: 80, margin: 20, s2c: 6, wacc: 8.04 },
    value: 310.16, yrs: 42.23, after: 277.17, tvSharePercent: 86.8, effects: [98.92, 114.59, 15.35, 46.21],
  },
  {
    name: "All four at minimum value",
    levers: { rev: 5, margin: 0, s2c: 1, wacc: 17.84 },
    value: -16.11, yrs: -6.87, after: 0, tvSharePercent: null, effects: [3.68, -33.92, -18.64, -2.32],
  },
];
const KEYS = ["rev", "margin", "s2c", "wacc"] as const;

describe("levers model: the §6.2.4 acceptance stories", () => {
  describe.each(stories)("$name", ({ levers, value, yrs, after, tvSharePercent }) => {
    const result = leversModel(levers);

    it(`is worth ${value} a share`, () => {
      expect(result.perShare).toBeCloseTo(value, 2);
    });

    it(`splits into ${yrs} from years 1 to 10, ${after} after year 10 and −9.24 owed`, () => {
      expect(result.yrs).toBeCloseTo(yrs, 2);
      expect(result.after).toBeCloseTo(after, 2);
      expect(result.owes).toBeCloseTo(9.24, 2);
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
  { key: "rev", atMin: -3.1, atMax: 80.8, reach: null },
  { key: "margin", atMin: -30.0, atMax: 99.3, reach: 18 },
  { key: "s2c", atMin: -0.7, atMax: 44.0, reach: null },
  { key: "wacc", atMin: 52.3, atMax: 22.5, reach: null },
];

describe("lever band: what one lever can do on its own", () => {
  it.each(bands)("$key: $atMin at its minimum, $atMax at its maximum, reaches the price on its own at $reach", ({ key, atMin, atMax, reach }) => {
    const band = leverBand(key);
    expect(band.atMin).toBeCloseTo(atMin, 1);
    expect(band.atMax).toBeCloseTo(atMax, 1);
    expect(band.lo).toBe(Math.min(band.atMin, band.atMax));
    expect(band.hi).toBe(Math.max(band.atMin, band.atMax));
    expect(band.reach).toBe(reach);
  });

  it("runs backwards for risk: the safest setting is the high end of the band", () => {
    const band = leverBand("wacc");
    expect(band.hi).toBe(band.atMin);
    expect(band.lo).toBe(band.atMax);
  });
});

describe("QA checklist (§13)", () => {
  // A pill shows the effect in whole dollars; under 50 cents it is an invisible placeholder (null here).
  const pills = (levers: Levers) => {
    const effects = leverEffects(levers);
    return KEYS.map((key) => (Math.abs(effects[key]) < 0.5 ? null : Math.round(effects[key])));
  };

  it("6: one story worth $84 shows $84, reaches the price, with pills +$28, +$17, none, +$4", () => {
    expect(Math.round(leversModel(PRESETS.price.levers).perShare)).toBe(84);
    expect(pills(PRESETS.price.levers)).toEqual([28, 17, null, 4]);
  });

  it("7: a grocer's margins shows $3, with one red pill, −$32, under What it keeps", () => {
    expect(Math.round(leversModel(PRESETS.grocer.levers).perShare)).toBe(3);
    expect(pills(PRESETS.grocer.levers)).toEqual([null, -32, null, null]);
  });

  it("11: What it keeps at 18% is worth 86.47, the first setting at or above $84; 17.5% gives $83", () => {
    expect(leversModel({ ...REFERENCE, margin: 18 }).perShare).toBeCloseTo(86.47, 2);
    expect(Math.round(leversModel({ ...REFERENCE, margin: 17.5 }).perShare)).toBe(83);
    expect(leverBand("margin").reach).toBe(18);
  });
});
