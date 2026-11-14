import { describe, expect, it } from "vitest";
import { AMAZON_2000 } from "@/finance/fixtures/amazon-2000.valuation";
import { valuationBlock } from "@/finance/valuation-case";
import {
  barTop,
  biggestMover,
  leverSpecs,
  leversMoved,
  moneyText,
  NO_MOVES,
  NO_RUN,
  openingSettings,
  priceTolerance,
  recordMove,
  storyNote,
  taskConditions,
  valueLeversModel,
  valueLeversShape,
  valueLeversStories,
  valueLeversTasks,
  valueOf,
  type LeverSettings,
} from "./value-levers-model";

// Value levers on Damodaran's Amazon of February 2000. Every expected figure is from spec 2026-11-12: the B3 table, its
// "what the Learner should find" table, Appendix B.2, and the sentences a Learner must read.

const amazon = valuationBlock.parse(AMAZON_2000);
const specs = leverSpecs(amazon);
const opening = openingSettings(specs);
const at = (changes: Partial<LeverSettings>) => valueLeversModel(amazon, specs, { ...opening, ...changes });
const perShare = (changes: Partial<LeverSettings>) => {
  const valued = valueOf(amazon, specs, { ...opening, ...changes });
  if (!valued.ok) throw new Error(valued.error);
  return valued.valuePerShare;
};
const headline = (changes: Partial<LeverSettings> = {}) => {
  const { before, key, after } = at(changes).headline;
  return `${before}${key}${after}`;
};
const expectCents = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);

describe("the levers (B3)", () => {
  const byId = Object.fromEntries(specs.map((s) => [s.id, s]));

  it("How big it gets: revenue in year 10, $10bn to $100bn in steps of $1bn, opening at $39bn, with today's revenue", () => {
    expect(byId.revenue).toMatchObject({ title: "How big it gets", label: "Revenue in year 10", min: 10, max: 100, step: 1, opening: 39, more: false });
    expect(byId.revenue.reading(39)).toBe("$39bn");
    expect(byId.revenue.spoken(39)).toBe("39 billion dollars");
    expect(byId.revenue.caption).toBe("Today: $1.1bn");
  });

  it("What it keeps: operating margin once mature, 2% to 20% in steps of 0.5, opening at 10%", () => {
    expect(byId.margin).toMatchObject({ title: "What it keeps", min: 2, max: 20, step: 0.5, opening: 10, more: false });
    expect(byId.margin.reading(12.5)).toBe("12.5%");
  });

  it("What growth costs: sales for each dollar invested, 1.0 to 5.0 in steps of 0.25, opening at 3.0", () => {
    expect(byId.salesToCapital).toMatchObject({ title: "What growth costs", label: "Sales for each dollar invested", min: 1, max: 5, step: 0.25, opening: 3 });
    expect(byId.salesToCapital.spoken(3)).toBe("3 dollars");
  });

  it("How risky: cost of capital while it grows, 10% to 18% in steps of 0.25, with a stop at the Case's 12.84% where it opens", () => {
    expect(byId.risk).toMatchObject({ title: "How risky", label: "Cost of capital while it grows", min: 10, max: 18, step: 0.25, opening: 12.84, stops: [12.84] });
  });

  it("More settings: chance it fails, 0% to 50% in steps of 5, opening at 0%", () => {
    expect(byId.failure).toMatchObject({ title: "Chance it fails", min: 0, max: 50, step: 5, opening: 0, more: true });
    expect(specs.filter((s) => !s.more).map((s) => s.id)).toEqual(["revenue", "margin", "salesToCapital", "risk"]);
  });
});

describe("the headline, the bar and the numbers at rest (B3)", () => {
  it('opens on the Case: "Your story is worth $35 a share", $35.04 from the engine', () => {
    expect(headline()).toBe("Your story is worth $35 a share");
    expect(at({}).headline.key).toBe("$35");
    expect(at({}).value!.toFixed(2)).toBe("35.04");
  });

  it("draws a bar from $0 to $150 with a marker at the $84 price on 3 Feb 2000", () => {
    const { bar, price } = at({});
    expect(bar.top).toBe(150);
    expect(bar.topText).toBe("$150");
    expect(bar.marker).toBeCloseTo(84 / 150, 12);
    expect(bar.fill).toBeCloseTo(35.04 / 150, 3);
    expect(price).toEqual({ value: 84, text: "$84", label: "Price on 3 Feb 2000", word: "price" });
    expect(barTop(84)).toBe(150);
  });

  it("fills the bar above $150 and still shows the number", () => {
    const rich = at({ revenue: 100, margin: 20 });
    expect(rich.value!).toBeGreaterThan(150);
    expect(rich.bar).toMatchObject({ fill: 1, full: true });
    expect(rich.headline.key).toBe(`$${Math.round(rich.value!)}`);
  });

  it("shows that 112% of the business's value sits after year 10 (Appendix B.1)", () => {
    expect(at({}).afterYear10?.text).toBe("112%");
  });

  it("draws ten bars of free cash flow, losses and gains, and one for everything after year 10 in today's money", () => {
    const bars = at({}).cashFlows;
    expect(bars).toHaveLength(11);
    expect(bars.slice(0, 10).map((b) => Math.round(b.value))).toEqual([-931, -1025, -990, -758, -408, -163, 177, 625, 1174, 1788]);
    expect(bars.slice(0, 10).map((b) => b.gain)).toEqual([false, false, false, false, false, false, true, true, true, true]);
    expect(bars[10]).toMatchObject({ afterYear10: true, gain: true, label: "After year 10, in today's money" });
    expect(Math.round(bars[10].value)).toBe(16924);
  });

  it('says "$0: lenders and option holders take everything" when a grocer\'s 4% margin leaves shareholders nothing, never a negative price', () => {
    const grocer = at({ margin: 4 });
    expect(grocer.value!).toBeLessThan(0);
    expect(grocer.nothingLeft).toBe(true);
    expect(headline({ margin: 4 })).toBe("$0: lenders and option holders take everything");
    expect(grocer.bar.fill).toBe(0);
  });
});

describe("what the Learner should find (B3), from Damodaran's story at $35.04", () => {
  it("margin 10% to 12%: $48.51", () => expectCents(perShare({ margin: 12 }), 48.51));
  it("revenue in year 10 from $39bn to $49bn: $46.28 (the spec's $46.29 is $10bn above the Case's own $39.006bn)", () => expect(perShare({ revenue: 49 }).toFixed(2)).toBe("46.28"));
  it("sales to capital 3 to 4: $39.99", () => expectCents(perShare({ salesToCapital: 4 }), 39.99));
  it("cost of capital 12.84% to 11.84%: $38.34", () => expectCents(perShare({ risk: 11.84 }), 38.34));

  it('revenue $60bn and margin 12.5% together: $84.07, the price, so "Find a story worth the $84 price" ticks', () => {
    const story = at({ revenue: 60, margin: 12.5 });
    expectCents(story.value!, 84.07);
    expect(story.headline.key).toBe("$84");
    expect(story.nearPrice).toBe(true);
  });

  it("margin and growth move the value most, the discount rate least", () => {
    const moves = [perShare({ margin: 12 }), perShare({ revenue: 49 }), perShare({ salesToCapital: 4 }), perShare({ risk: 11.84 })].map((v) => v - perShare({}));
    expect([...moves].sort((a, b) => b - a)).toEqual(moves);
  });

  it("each lever alone gives Appendix B.2's values", () => {
    expectCents(perShare({ revenue: 80 }), 81.09);
    expectCents(perShare({ margin: 15 }), 68.7);
    expectCents(perShare({ salesToCapital: 2 }), 25.14);
    expectCents(perShare({ risk: 16 }), 26.07);
    expectCents(perShare({ failure: 20 }), 26.15);
  });
});

describe("the stories (B3)", () => {
  const stories = valueLeversStories(amazon, specs, { caseStory: "Damodaran's story", priceStory: { revenue: 60, margin: 12.5 } });

  it("are Damodaran's story, A grocer's margins (4%), and A story worth $84 only after the Insight", () => {
    expect(stories.map((s) => [s.label, s.afterInsight])).toEqual([
      ["Damodaran's story", false],
      ["A grocer's margins", false],
      ["A story worth $84", true],
    ]);
    expect(stories[0].settings).toEqual(opening);
    expect(stories[1].settings).toEqual({ ...opening, margin: 4 });
    expect(stories[2].settings).toEqual({ ...opening, revenue: 60, margin: 12.5 });
  });

  it("land the story worth the price within $2 of it by the engine, and leave out one that does not", () => {
    expect(priceTolerance(amazon)).toBe(2);
    // $80bn at 10% is $81.09 (Appendix B.2): $2.91 short.
    const short = valueLeversStories(amazon, specs, { priceStory: { revenue: 80 } });
    expect(short.map((s) => s.id)).toEqual(["case", "grocer"]);
    // With none given, one is found by moving revenue alone, and it lands within $2.
    const found = valueLeversStories(amazon, specs).find((s) => s.id === "price")!;
    expect(Math.abs(perShare(found.settings) - 84)).toBeLessThanOrEqual(2);
  });
});

describe("Things to try (B3) and what the Tutor is told", () => {
  it("are the two lines, the price in the Case's words", () => {
    expect(valueLeversTasks(amazon)).toEqual(["Move one lever at a time. Which one moves the value most?", "Find a story worth the $84 price"]);
  });

  it("tick the first once two levers have moved the value one at a time, and record which moved it most", () => {
    let state = { moves: NO_MOVES, run: NO_RUN };
    // Revenue $39bn to $49bn and back (+$11.24 at most), then margin 10% to 12% in two steps (+$13.47).
    state = recordMove(state.moves, state.run, "revenue", perShare({}), perShare({ revenue: 49 }));
    state = recordMove(state.moves, state.run, "revenue", perShare({ revenue: 49 }), perShare({}));
    expect(leversMoved(state.moves)).toBe(1);
    expect(biggestMover(state.moves, specs, amazon)?.spec.title).toBe("How big it gets");
    expect(taskConditions(at({}), state.moves)).toEqual([false, false]);
    state = recordMove(state.moves, state.run, "margin", perShare({}), perShare({ margin: 11 }));
    state = recordMove(state.moves, state.run, "margin", perShare({ margin: 11 }), perShare({ margin: 12 }));
    expect(leversMoved(state.moves)).toBe(2);
    expect(taskConditions(at({ margin: 12 }), state.moves)).toEqual([true, false]);
    const most = biggestMover(state.moves, specs, amazon);
    expect(most?.spec.title).toBe("What it keeps");
    expect(most?.by).toBe("$13.47");
  });

  it("counts a lever moved and moved back as having moved the value by the most it reached", () => {
    let state = { moves: NO_MOVES, run: NO_RUN };
    state = recordMove(state.moves, state.run, "risk", perShare({}), perShare({ risk: 10 }));
    state = recordMove(state.moves, state.run, "risk", perShare({ risk: 10 }), perShare({}));
    expect(biggestMover(state.moves, specs, amazon)?.by).toBe("$10.04");
  });
});

describe("the Workbench budget at rest (B2)", () => {
  it("has four controls, one under More settings, one visual, three numbers, one headline, two tasks and under 40 words", () => {
    const shape = valueLeversShape(amazon);
    expect(shape).toMatchObject({ controls: 4, more: 1, visuals: 1, numbers: 3, headlines: 1, tasks: 2 });
    expect(shape.words).toBeLessThanOrEqual(40);
  });
});

describe("money in the Case's own currency", () => {
  const rupees = valuationBlock.parse({ ...AMAZON_2000, currency: "INR", unit: "crores", price: { value: 1200, date: "2019-03-29" } });

  it("writes rupees in crore and lakh, and lever 1 in crore rupees", () => {
    expect(moneyText(1250, rupees)).toBe("₹1,250 crore");
    expect(moneyText(0.5, rupees)).toBe("₹50 lakh");
    const revenue = leverSpecs(rupees)[0];
    expect(revenue.reading(39006)).toBe("₹39,006 crore");
    expect(revenue.spoken(39006)).toBe("39,006 crore rupees");
    expect(leverSpecs(rupees)[2].label).toBe("Sales for each rupee invested");
    expect(valueLeversModel(rupees, leverSpecs(rupees), openingSettings(leverSpecs(rupees))).price.label).toBe("Price on 29 Mar 2019");
  });

  it("values a company counted whole (per: company) as one figure, with no 'a share'", () => {
    const whole = valuationBlock.parse({ ...AMAZON_2000, per: "company", shares: 1, price: { value: 30_000, date: "2000-02-01" } });
    const model = valueLeversModel(whole, leverSpecs(whole), openingSettings(leverSpecs(whole)));
    expect(`${model.headline.before}${model.headline.key}${model.headline.after}`).toBe("Your story is worth $11.9bn");
    expect(model.price.text).toBe("$30bn");
  });
});

describe("a price that nobody paid goes by its own word (price.label)", () => {
  // Amazon's block with its marker relabelled, as Uber's $40bn talk of 2 Dec 2014 is in fol-uber-2014-crowd.
  const talk = valuationBlock.parse({ ...AMAZON_2000, price: { ...AMAZON_2000.price, label: "talk" } });
  const specs = leverSpecs(talk);
  it("names the marker, the Thing to try and the match readout with it, never 'price'", () => {
    const model = valueLeversModel(talk, specs, openingSettings(specs));
    expect(model.price.label).toMatch(/^Talk on /);
    expect(valueLeversTasks(talk)[1]).toBe("Find a story worth the $84 talk");
    const reach = valueLeversModel(talk, leverSpecs(talk, { kind: "match_price" }), openingSettings(specs), { kind: "match_price" }).readout;
    expect(reach?.label).toBe("Reaches the $84 talk alone");
  });
  it("keeps 'price' for a Case without a label", () => {
    expect(valueLeversTasks(valuationBlock.parse(AMAZON_2000))[1]).toBe("Find a story worth the $84 price");
  });
  it("gives the word to the bar and to a saved note's title (review finding talk-label-missing-from-bar-aria)", () => {
    const model = valueLeversModel(talk, specs, openingSettings(specs));
    expect(model.price.word).toBe("talk");
    expect(storyNote(talk, specs, openingSettings(specs), model, "Uber").title).toBe("My Valuation story: Uber, against the talk of 3 Feb 2000");
    const amazon = valuationBlock.parse(AMAZON_2000);
    const plain = valueLeversModel(amazon, leverSpecs(amazon), openingSettings(leverSpecs(amazon)));
    expect(plain.price.word).toBe("price");
    expect(storyNote(amazon, leverSpecs(amazon), openingSettings(leverSpecs(amazon)), plain).title).toBe("My Valuation story, against the price of 3 Feb 2000");
  });
  it("takes one or a few lower-case words only", () => {
    expect(valuationBlock.safeParse({ ...AMAZON_2000, price: { ...AMAZON_2000.price, label: "The $40bn Talk!" } }).success).toBe(false);
  });
});

describe("the risk lever on a Case whose cost of capital rises towards year 10", () => {
  it("opens inside its range: Tesla's 7% rising to 7.4% gets a lever from 5% to 12%", async () => {
    const { valuationCase } = await import("@/finance/valuation-cases");
    const { leverSpecs: specsOf } = await import("./value-levers-model");
    const tesla = valuationCase("fol-tesla-2020-diy");
    expect(tesla).not.toBeNull();
    const risk = specsOf(tesla!).find((s) => s.id === "risk")!;
    expect([risk.min, risk.max, risk.opening]).toEqual([5, 12, 7]);
    // A falling rate keeps its rule: Amazon's 12.84% falling to 9.61% still runs 10% to 18%.
    const amazon = specsOf(valuationBlock.parse(AMAZON_2000)).find((s) => s.id === "risk")!;
    expect([amazon.min, amazon.max]).toEqual([10, 18]);
  });
});

describe("the risk lever's one rule, on every Valuation Case", () => {
  it("opens inside its range, starts above zero, and the engine values both ends, whichever way the rate moves", async () => {
    const { valuationCase, valuationCaseIds } = await import("@/finance/valuation-cases");
    const { leverSpecs: specsOf } = await import("./value-levers-model");
    const { applyLevers } = await import("@/finance/valuation-case");
    for (const id of valuationCaseIds()) {
      const block = valuationCase(id)!;
      const risk = specsOf(block).find((s) => s.id === "risk")!;
      expect(risk.min, id).toBeGreaterThan(0);
      expect(risk.opening, id).toBeGreaterThanOrEqual(risk.min);
      expect(risk.opening, id).toBeLessThanOrEqual(risk.max);
      for (const rate of [risk.min, risk.max]) expect(applyLevers(block, { costOfCapitalGrowing: rate }).ok, `${id} at ${rate}%`).toBe(true);
    }
  });
  it("keeps Coffee Day's 2019 opening inside the range, though its year-1 rate is within a point of its mature rate", async () => {
    const { valuationCase } = await import("@/finance/valuation-cases");
    const { leverSpecs: specsOf } = await import("./value-levers-model");
    const block = valuationCase("coffee-day-distress-2019")!;
    const risk = specsOf(block).find((s) => s.id === "risk")!;
    expect(risk.min).toBeLessThanOrEqual(risk.opening);
    expect(risk.opening).toBeLessThanOrEqual(risk.max);
  });
});
