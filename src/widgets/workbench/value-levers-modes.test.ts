import { describe, expect, it } from "vitest";
import { valuationCase, valuationCaseIds } from "@/finance/valuation-cases";
import { WORKBENCH_BUDGET } from "../check";
import { valueLeversModeSchema, type ValueLeversMode } from "./data-schemas";
import {
  caseListOf,
  leverSpecs,
  leversFor,
  openingSettings,
  priceReach,
  storyNote,
  valueLeversData,
  valueLeversModel,
  valueLeversReading,
  valueLeversShape,
  valueLeversStories,
  valueOf,
  valueRange,
  type LeverSettings,
} from "./value-levers-model";

// Value levers in each Spine Topic that reuses it (spec 2026-11-12, B4 and Appendix D), on Damodaran's Amazon. The expected
// values are Appendix B.2's ("lever moved alone" and "stories near the price") and the sentences C4 says each Topic is for.

const block = valuationCase("amazon-dcf-2000")!;
const source = { title: "A Topic's source", url: "https://example.com/source" };
const mode = (raw: unknown): ValueLeversMode => valueLeversModeSchema.parse(raw);
const value = (m: ValueLeversMode | undefined, settings: Partial<LeverSettings>) => {
  const specs = leverSpecs(block, m);
  const result = valueOf(block, specs, { ...openingSettings(specs), ...settings }, m);
  if (!result.ok) throw new Error(result.error);
  return result.valuePerShare;
};

describe("failure mode (Spine Topic 10: a value that assumes survival is too high for a firm that may not)", () => {
  const failure = mode({ kind: "failure" });

  it("puts the chance it fails at rest and what growth costs under More settings, still four and one", () => {
    const specs = leverSpecs(block, failure);
    expect(specs.filter((s) => !s.more).map((s) => s.id)).toEqual(["revenue", "margin", "risk", "failure"]);
    expect(specs.filter((s) => s.more).map((s) => s.id)).toEqual(["salesToCapital"]);
  });

  it("gives B.2's values with nothing recovered: 10% $30.59, 20% $26.15, 30% $21.70, and says what it is worth if it survives", () => {
    expect(value(failure, { failure: 10 })).toBeCloseTo(30.59, 2);
    expect(value(failure, { failure: 20 })).toBeCloseTo(26.15, 2);
    expect(value(failure, { failure: 30 })).toBeCloseTo(21.7, 2);
    const specs = leverSpecs(block, failure);
    const model = valueLeversModel(block, specs, { ...openingSettings(specs), failure: 30 }, failure);
    expect(model.readout).toEqual({ label: "If it survives", text: "$35 a share" });
    expect(model.headline.key).toBe("$22");
  });
});

describe("every lever opens inside its own range, on every Valuation Case", () => {
  it.each(valuationCaseIds())("%s", (id) => {
    const specs = leverSpecs(valuationCase(id)!, mode({ kind: "failure" }));
    for (const s of specs) {
      expect(s.opening, `${id} ${s.id}`).toBeGreaterThanOrEqual(s.min);
      expect(s.opening, `${id} ${s.id}`).toBeLessThanOrEqual(s.max);
    }
  });
});

describe("roic mode (Spine Topic 6: growth adds value only when new capital earns more than it costs)", () => {
  const roic = mode({ kind: "roic" });
  const readout = (settings: Partial<LeverSettings>) => {
    const specs = leverSpecs(block, roic);
    return valueLeversModel(block, specs, { ...openingSettings(specs), ...settings }, roic).readout;
  };

  it("reads 10% kept on $3 of sales a dollar, after 35% tax, as 19.5%, above the 12.84% it costs", () => {
    expect(readout({})).toEqual({ label: "Return on new capital", text: "19.5%, above the 12.84% it costs", warn: false });
  });

  it("warns when new capital earns less than it costs: 4% kept on $1.50 a dollar earns 3.9%", () => {
    expect(readout({ margin: 4, salesToCapital: 1.5 })).toEqual({ label: "Return on new capital", text: "3.9%, below the 12.84% it costs", warn: true });
  });
});

describe("match_price mode (Spine Topic 13: any price can be read back as a set of beliefs)", () => {
  it("names the one-lever settings nearest the $84 price: revenue $83bn (B.2: $80bn gives $81.09), or margin 17.5% (B.2: $85.50)", () => {
    const match = mode({ kind: "match_price" });
    const specs = leverSpecs(block, match);
    expect(priceReach(block, specs, openingSettings(specs), match)).toEqual(["revenue $83bn", "margin 17.5%"]);
    expect(valueLeversModel(block, specs, openingSettings(specs), match).readout).toEqual({ label: "Reaches the $84 price alone", text: "revenue $83bn, or margin 17.5%" });
  });
});

describe("range mode (Spine Topic 14: a value is a range; know which lever would change your mind)", () => {
  it("ranks margin and revenue first and the cost of capital last, as B3 finds", () => {
    const range = mode({ kind: "range" });
    const specs = leverSpecs(block, range);
    const { low, high, ranked } = valueRange(block, specs, openingSettings(specs), range as Extract<ValueLeversMode, { kind: "range" }>);
    expect(ranked.slice(0, 2)).toEqual(["margin", "revenue"]);
    expect(ranked.at(-1)).toBe("risk");
    expect(low).toBeLessThan(35.04);
    expect(high).toBeGreaterThan(35.04);
    expect(valueLeversModel(block, specs, openingSettings(specs), range).readout?.note).toBe("By effect: margin, revenue, reinvestment, risk");
  });

  it("takes the Topic's own bands: margin 8% to 12% spans B.2's $21.57 to $48.51", () => {
    const range = mode({ kind: "range", bands: { margin: [8, 12], revenue: [38, 40], salesToCapital: [2.9, 3.1], risk: [12.5, 13] } });
    const specs = leverSpecs(block, range);
    const { low, high, ranked } = valueRange(block, specs, openingSettings(specs), range as Extract<ValueLeversMode, { kind: "range" }>);
    expect(low).toBeCloseTo(21.57, 2);
    expect(high).toBeCloseTo(48.51, 2);
    expect(ranked[0]).toBe("margin");
  });
});

describe("market mode (Spine Topic 4: the same sums give far-apart values when the market story differs)", () => {
  const retail = { label: "US retail, excluding cars", size: 2_245_899, source };
  const market = mode({ kind: "market", markets: [retail, { label: "All US retail", size: 2_994_929, source }] });

  it("turns lever 1 into a share of the market, opening at the Case's $39bn as a share of it, and the value at $35", () => {
    const [share] = leverSpecs(block, market);
    expect(share.label).toBe("Share of the market in year 10");
    // B.1 prints year-10 revenue rounded to 39,006.
    expect(share.opening).toBeCloseTo((39_006 / 2_245_899) * 100, 4);
    expect(value(market, {})).toBeCloseTo(35.04, 2);
  });

  it("values a share worth $60bn of revenue as B.2's $60bn: $58.64", () => {
    const specs = leverSpecs(block, market);
    const settings = { ...openingSettings(specs), revenue: (60_000 / 2_245_899) * 100 };
    expect(leversFor(block, specs, settings, market).revenueYear10).toBeCloseTo(60_000, 6);
    expect(value(market, { revenue: settings.revenue })).toBeCloseTo(58.64, 2);
  });

  it("gives the same share of a bigger market a bigger value, and says the market chosen to the Tutor", () => {
    const specs = leverSpecs(block, market);
    const opening = openingSettings(specs);
    const first = valueLeversModel(block, specs, opening, market, 0);
    const second = valueLeversModel(block, specs, opening, market, 1);
    expect(second.value!).toBeGreaterThan(first.value!);
    expect(second.readout).toEqual({ label: "Sales in year 10", text: "$52bn of a $3tn market" });
    const reading = valueLeversReading({ block, mode: market }, { market: 1 });
    expect(reading.readouts).toContain("Market: All US retail, $3tn today (sourced: A Topic's source)");
  });
});

describe("margin_marks mode (Spine Topic 5: a margin is capped by what rivals allow)", () => {
  it("marks rivals' margins on lever 2 and names them in the readout", () => {
    const marks = mode({
      kind: "margin_marks",
      marks: [
        { label: "Barnes & Noble", percent: 7.94, source },
        { label: "Specialty retail", percent: 10, source },
      ],
    });
    const specs = leverSpecs(block, marks);
    expect(specs[1].marks).toEqual([
      { value: 7.94, label: "Barnes & Noble 7.94%" },
      { value: 10, label: "Specialty retail 10%" },
    ]);
    expect(valueLeversModel(block, specs, openingSettings(specs), marks).readout).toEqual({ label: "Rivals' margins", text: "Barnes & Noble 7.94%, Specialty retail 10%" });
  });
});

describe("two_stories mode (Spine Topic 11: the best case on every lever at once is a wish, not a story)", () => {
  const two = mode({
    kind: "two_stories",
    stories: [
      { label: "A bigger Amazon", levers: { revenue: 60 } },
      { label: "Everything goes right", levers: { revenue: 100, margin: 20, salesToCapital: 5, risk: 10 } },
    ],
  });

  it("puts both stories side by side, the first at B.2's $58.64 for $60bn", () => {
    const specs = leverSpecs(block, two);
    const model = valueLeversModel(block, specs, openingSettings(specs), two);
    expect(model.readout?.label).toBe("The two stories");
    expect(model.readout?.text).toMatch(/^\$59 against \$\d+$/);
  });

  it("flags the story with every lever at its best, and the settings that contradict each other", () => {
    const specs = leverSpecs(block, two);
    const stories = valueLeversStories(block, specs, { caseStory: "Damodaran's story" }, two);
    expect(stories.map((s) => [s.label, s.flagged ?? false])).toEqual([
      ["Damodaran's story", false],
      ["A bigger Amazon", false],
      ["Everything goes right", true],
      ["A story worth $84", false],
    ]);
    const wish = valueLeversModel(block, specs, stories[2].settings, two);
    expect(wish.flags).toEqual(["Every lever at its best: a wish, not a story"]);
    const cheapGrowth = valueLeversModel(block, specs, { ...openingSettings(specs), revenue: 90, salesToCapital: 4.75 }, two);
    expect(cheapGrowth.flags).toEqual(["Fast growth with little investment"]);
  });
});

describe("all_open mode (Spine Topic 15: their own Valuation story, saved to the Notebook)", () => {
  it("writes the Learner's story as a one-page note: each lever, the value, the price and the share after year 10", () => {
    const open = mode({ kind: "all_open" });
    const specs = leverSpecs(block, open);
    const settings = openingSettings(specs);
    const note = storyNote(block, specs, settings, valueLeversModel(block, specs, settings, open), "Amazon");
    expect(note.title).toBe("My Valuation story: Amazon, against the price of 3 Feb 2000");
    expect(note.lines).toEqual([
      "How big it gets: sales in year 10 $39bn",
      "What it keeps: operating margin once mature 10%",
      "What growth costs: sales for each dollar invested $3.00",
      "How risky: cost of capital while it grows 12.84%",
      "Chance it fails: 0%",
      "Worth: $35 a share",
      "Price on 3 Feb 2000: $84",
      "Value from after year 10: 112%",
    ]);
  });
});

describe("match_price mode with Case chips (the ready-Case valuation Topic: judge a published Story on one of three Cases)", () => {
  it("lists its Cases for the chips, as all_open does, and a mode without chips lists none", () => {
    const cases = [
      { id: "amazon-dcf-2000", label: "Amazon, Feb 2000" },
      { id: "zomato-ipo-2021", label: "Zomato, Jul 2021" },
    ];
    expect(caseListOf({ kind: "match_price", cases })).toEqual(cases);
    expect(caseListOf({ kind: "match_price" })).toEqual([]);
    expect(caseListOf({ kind: "roic" })).toEqual([]);
  });

  it("heads the value as the story's, not the Learner's: the Learner judges a published Story here", () => {
    const judge = mode({ kind: "match_price", cases: [{ id: "amazon-dcf-2000", label: "Amazon, Feb 2000" }, { id: "zomato-ipo-2021", label: "Zomato, Jul 2021" }] });
    const specs = leverSpecs(block, judge);
    const { headline } = valueLeversModel(block, specs, openingSettings(specs), judge);
    expect(`${headline.before}${headline.key}${headline.after}`).toBe("The story is worth $35 a share");
  });
});

describe("every mode", () => {
  const modes = [
    { kind: "market", markets: [{ label: "US retail, excluding cars", size: 2_245_899, source }] },
    { kind: "margin_marks", marks: [{ label: "Barnes & Noble", percent: 7.94, source }] },
    { kind: "roic" },
    { kind: "failure" },
    { kind: "two_stories", stories: [{ label: "A bigger Amazon", levers: { revenue: 60 } }, { label: "Everything goes right", levers: { revenue: 100, margin: 20 } }] },
    { kind: "match_price" },
    { kind: "range" },
    { kind: "all_open" },
  ];

  it("keeps four levers at rest and one under More settings, three numbers, and 34 words or fewer before its title (B2)", () => {
    for (const raw of modes) {
      const shape = valueLeversShape(block, mode(raw));
      expect([raw.kind, shape.controls, shape.more, shape.numbers]).toEqual([raw.kind, WORKBENCH_BUDGET.controls, WORKBENCH_BUDGET.more, WORKBENCH_BUDGET.numbers]);
      expect(shape.words, raw.kind).toBeLessThanOrEqual(34);
    }
  });

  it("never heads the value or labels a readout 'your story' (GLOSSARY: a Story is someone's claim; the Learner's own is an Estimate)", () => {
    for (const raw of modes) {
      const m = mode(raw);
      const specs = leverSpecs(block, m);
      const { headline, readout } = valueLeversModel(block, specs, openingSettings(specs), m);
      expect(`${headline.before}${headline.key}${headline.after} ${readout?.label ?? ""}`, raw.kind).not.toMatch(/\byour story\b/i);
    }
  });

  it("is parsed from a part's literal props, and a mode that does not parse is refused in words", () => {
    expect(valueLeversData({ caseId: "amazon-dcf-2000", mode: { kind: "roic" } })).toMatchObject({ data: { mode: { kind: "roic" } } });
    expect(valueLeversData({ caseId: "amazon-dcf-2000", mode: { kind: "wishful" } })).toMatchObject({ problem: expect.stringMatching(/^mode: /) });
    expect(valueLeversData({ caseId: "amazon-dcf-2000", mode: { kind: "market", markets: [{ label: "Unsourced", size: 1 }] } })).toMatchObject({ problem: expect.stringMatching(/source/) });
  });
});

describe("Value levers on rupees counted in millions, and range bands around the Learner's story (Spine 14, 15)", () => {
  it("reads lever 1 in crore and the cost of capital to two decimals for Zomato", () => {
    const zomato = valuationCase("zomato-ipo-2021")!;
    const specs = leverSpecs(zomato, mode({ kind: "all_open" }));
    const revenue = specs.find((s) => s.id === "revenue")!;
    expect(revenue.reading(revenue.opening)).toMatch(/^₹[\d,]+ crore$/);
    const risk = specs.find((s) => s.id === "risk")!;
    expect(risk.reading(risk.opening)).toBe("10.25%");
  });

  it("moves a Topic's band with the Learner's setting, so the range spreads around their story", () => {
    const tesla = valuationCase("fol-tesla-2020-diy")!;
    const ranged = mode({ kind: "range", bands: { margin: [9.23, 15.28] } });
    const specs = leverSpecs(tesla, ranged);
    const opening = openingSettings(specs);
    const atHis = valueRange(tesla, specs, opening, ranged as Extract<ValueLeversMode, { kind: "range" }>);
    const richer = valueRange(tesla, specs, { ...opening, margin: 18 }, ranged as Extract<ValueLeversMode, { kind: "range" }>);
    expect(richer.low).toBeGreaterThan(atHis.low);
    expect(richer.high).toBeGreaterThan(atHis.high);
  });
});

describe("all open mode, round two (Spine Topic 15)", () => {
  it("reads the Case's own year-10 revenue while lever 1 sits at its opening, and the step once moved", () => {
    const coffee = valuationCase("coffee-day-rupee-valuation-2015")!;
    const revenue = leverSpecs(coffee, mode({ kind: "all_open" })).find((s) => s.id === "revenue")!;
    expect(revenue.reading(revenue.opening)).toBe("₹7,660 crore");
    expect(revenue.reading(revenue.opening + revenue.step)).toBe(`₹${(revenue.opening + revenue.step).toLocaleString("en-IN")} crore`);
  });

  it("flags only a wish, every lever at its best, and writes the flag into the saved note", () => {
    const open = mode({ kind: "all_open" });
    const specs = leverSpecs(block, open);
    const best = { ...openingSettings(specs), revenue: 100, margin: 20, salesToCapital: 5, risk: 10 };
    const model = valueLeversModel(block, specs, best, open);
    expect(model.flags).toEqual(["Every lever at its best: a wish, not a story"]);
    expect(storyNote(block, specs, best, model).lines.at(-1)).toBe("Flag: Every lever at its best: a wish, not a story");
    const bigger = { ...openingSettings(specs), revenue: 100 };
    expect(valueLeversModel(block, specs, bigger, open).flags).toEqual([]);
  });
});

describe("range mode marks and headline (Spine Topic 14)", () => {
  it("puts each Topic band on its lever as two ticks", () => {
    const tesla = valuationCase("fol-tesla-2020-diy")!;
    const ranged = mode({ kind: "range", bands: { margin: [9.23, 15.28], revenue: [91000, 171000] } });
    const specs = leverSpecs(tesla, ranged);
    const margin = specs.find((s) => s.id === "margin")!;
    expect(margin.marks?.map((m) => m.value)).toEqual([9.23, 15.28]);
    const revenue = specs.find((s) => s.id === "revenue")!;
    expect(revenue.marks?.length).toBe(2);
  });

  it("leads with the range as the headline and says where the price sits", () => {
    const tesla = valuationCase("fol-tesla-2020-diy")!;
    const ranged = mode({ kind: "range", bands: { margin: [9.23, 15.28] } });
    const specs = leverSpecs(tesla, ranged);
    const m = valueLeversModel(tesla, specs, openingSettings(specs), ranged);
    expect(m.headline.before).toBe("A range of values: ");
    expect(m.headline.key).toMatch(/ to /);
    expect(m.range?.where).toBe("above"); // the $749 price is above the story's range
    expect(m.bar.span).toBeTruthy();
    expect(m.readout?.label).toBe("This story"); // never "your story" (GLOSSARY)
  });
});
