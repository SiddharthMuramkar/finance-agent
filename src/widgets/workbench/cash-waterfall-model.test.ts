import { describe, expect, it } from "vitest";
import { valuationCase } from "@/finance/valuation-cases";
import { WORKBENCH_BUDGET } from "../check";
import { cashWaterfallCaption, cashWaterfallFromCase, cashWaterfallLevers, cashWaterfallModel, cashWaterfallReading, cashWaterfallScene, cashWaterfallShape, cashWaterfallTasks } from "./cash-waterfall-model";
import { cashWaterfallData } from "./registry";

// Cash waterfall (spec 2026-11-12, B4; Spine Topic 3: "Growth uses cash before it shows as profit"). Amazon's year 1 is
// Appendix B.1's first row: revenue 2,792, operating income -373, tax 0, reinvestment 558, free cash flow -931. Webvan's 2000
// is its 10-K: revenue up from $13.305m to $178.456m, an operating loss before non-cash charges of $319.754m (-179.2%), and
// $237.3m reinvested for $165.151m of new revenue (0.70 of sales for each dollar), free cash flow about -$557.1m.

const amazon = cashWaterfallFromCase(valuationCase("amazon-dcf-2000")!);

describe("Cash waterfall on Amazon's year 1 (B4, Appendix B.1)", () => {
  it("steps revenue down to free cash flow: 2,792, -373, 0 tax, 558 reinvested, -931", () => {
    const model = cashWaterfallModel(amazon, amazon.opening);
    const step = (id: string) => model.steps.find((s) => s.id === id)!;
    expect(step("revenue").to).toBeCloseTo(2_792, -1);
    expect(step("operating").to).toBeCloseTo(-373, 0);
    expect(step("tax").text).toBe("$0");
    expect(step("reinvestment").from - step("reinvestment").to).toBeCloseTo(558, -1);
    expect(model.fcf).toBeCloseTo(-931, 0);
    expect(`${model.headline.before}${model.headline.key}`).toBe("Free cash flow next year: -$931.4m");
    expect(model.numbers).toEqual([
      { label: "Operating income", text: "-$372.9m" },
      { label: "Reinvestment", text: "$558.5m" },
    ]);
  });

  it("opens at the Case's year 1: 150% growth, a -13.36% margin and $3 of sales for each dollar, with today's revenue under growth", () => {
    const levers = cashWaterfallLevers(amazon);
    expect(levers.map((l) => [l.id, l.reading(l.opening)])).toEqual([
      ["growth", "150%"],
      ["margin", "-13.36%"],
      ["salesToCapital", "$3.00"],
    ]);
    expect(levers[0].caption).toBe("This year: $1.1bn");
    expect(levers[0].chips).toEqual([0]);
    expect(levers[0].min).toBe(0);
  });

  it("counts lever 3 in the Case's own currency: yen, won and euros as well as dollars (#112)", () => {
    const lever3 = (currency: "JPY" | "KRW" | "EUR") => cashWaterfallLevers({ ...amazon, money: { ...amazon.money, currency } })[2];
    expect([lever3("JPY").label, lever3("JPY").reading(3), lever3("JPY").spoken(1)]).toEqual(["Sales for each yen invested", "¥3.00", "1 yen"]);
    expect([lever3("KRW").label, lever3("KRW").spoken(2)]).toEqual(["Sales for each won invested", "2 won"]);
    expect([lever3("EUR").label, lever3("EUR").reading(3), lever3("EUR").spoken(2)]).toEqual(["Sales for each euro invested", "€3.00", "2 euros"]);
  });

  it("costs nothing to grow at 0%: no reinvestment, so free cash flow is the operating income", () => {
    const model = cashWaterfallModel(amazon, { ...amazon.opening, growth: 0 });
    expect(model.numbers[1].text).toBe("$0");
    expect(model.fcf).toBeCloseTo(1_117 * -0.13355, 1);
    expect(model.conditions[0]).toBe(true);
  });

  it("finds free cash flow above zero when the margin is high enough, which the margin lever alone reaches", () => {
    expect(cashWaterfallTasks()).toEqual(["Set growth to 0%. What happens to reinvestment?", "Find settings where free cash flow is above zero"]);
    const margin = cashWaterfallLevers(amazon)[1];
    expect(cashWaterfallModel(amazon, { ...amazon.opening, margin: margin.max }).conditions[1]).toBe(true);
  });

  it("keeps within the Workbench budget (B2)", () => {
    const shape = cashWaterfallShape(amazon);
    expect(shape.controls).toBe(3);
    expect(shape.numbers).toBeLessThanOrEqual(WORKBENCH_BUDGET.numbers);
    expect(shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
  });

  it("tells the Tutor every step of the year", () => {
    expect(cashWaterfallReading(amazon, amazon.opening).readouts).toEqual([
      "Revenue: $2.8bn",
      "Less running costs: -$3.2bn",
      "Operating income: -$372.9m",
      "Less tax: $0",
      "Less what growth costs: -$558.5m",
      "Free cash flow: -$931.4m",
    ]);
  });
});

describe("Cash waterfall on a company's year from the Topic file: Webvan's 2000 (10-K)", () => {
  const webvan = {
    name: "Webvan",
    currency: "USD",
    unit: "millions",
    revenue: 13.305,
    taxPercent: 35,
    opening: { growth: 1241.3, margin: -179.2, salesToCapital: 0.7 },
    source: { title: "Webvan Group, Form 10-K for 2000", url: "https://www.sec.gov/Archives/edgar/data/1092657/000101287001001485/0001012870-01-001485.txt" },
  };

  it("reaches the 10-K's revenue and operating loss, and about its free cash flow", () => {
    const found = cashWaterfallData({ company: webvan });
    if (!("data" in found)) throw new Error(found.problem);
    const model = cashWaterfallModel(found.data, found.data.opening);
    expect(model.steps[0].to).toBeCloseTo(178.456, 1);
    expect(model.steps[2].to).toBeCloseTo(-319.754, 0);
    // 0.70 is the 10-K's sales to capital rounded, so reinvestment is 235.9 against the 237.3 spent.
    expect(model.fcf! - -557.1).toBeLessThan(2);
    expect(model.fcf! - -557.1).toBeGreaterThan(0);
  });

  it("refuses a company without its source, or neither a Case nor a company", () => {
    expect(cashWaterfallData({ company: { ...webvan, source: undefined } })).toMatchObject({ problem: expect.stringMatching(/source/) });
    expect(cashWaterfallData({})).toMatchObject({ problem: expect.stringMatching(/^base: a Valuation Case/) });
  });
});

// Spine critics round 1 on #89: a beginner reads the bench as Webvan's real year. Named years ("1999 sales" into 2000, not
// "this year" and "next year"), growth said as a multiple ("13.4 times"), sales for each dollar invested under More
// settings, a what-if line that says the margin is made up, and a scene with Webvan's Icon that reacts to the levers.
describe("Cash waterfall for a beginner: Webvan's 2000 as a what-if", () => {
  const webvan = {
    name: "Webvan",
    currency: "USD",
    unit: "millions",
    revenue: 13.305,
    taxPercent: 35,
    lossesCarried: 470,
    opening: { growth: 1241.3, margin: 4, salesToCapital: 0.7 },
    years: { from: "1999", to: "2000" },
    whatIf: "A what-if: Webvan really lost money on most sales, so the cash it used in the Story was far more.",
    icon: "delivery-truck",
    source: { title: "Webvan Group, Form 10-K for 2000", url: "https://www.sec.gov/Archives/edgar/data/1092657/000101287001001485/0001012870-01-001485.txt" },
  };
  const data = () => {
    const found = cashWaterfallData({ company: webvan });
    if (!("data" in found)) throw new Error(found.problem);
    return found.data;
  };

  it("names the years: 1999 sales under growth, free cash flow in 2000, never this year or next year", () => {
    const levers = cashWaterfallLevers(data());
    expect(levers[0].label).toBe("Sales growth, 1999 to 2000");
    expect(levers[0].caption).toBe("1999 sales: $13.3m");
    const model = cashWaterfallModel(data(), data().opening);
    expect(model.headline.before).toBe("Free cash flow in 2000: ");
    expect(cashWaterfallCaption(data())).toBe("Webvan 2000, from sales to free cash flow");
    const prose = JSON.stringify([levers.map((l) => [l.label, l.caption]), model.headline, cashWaterfallCaption(data())]);
    expect(prose).not.toMatch(/this year|next year/i);
  });

  it("says growth as a multiple of the year before: 1241.3% reads 13.4 times", () => {
    const growth = cashWaterfallLevers(data())[0];
    expect(growth.reading(1241.3)).toBe("13.4 times");
    expect(growth.reading(50)).toBe("1.5 times");
    expect(growth.reading(0)).toBe("No growth");
  });

  it("keeps sales for each dollar invested under More settings, so two levers stand at rest", () => {
    const levers = cashWaterfallLevers(data());
    expect(levers.filter((l) => l.more).map((l) => l.id)).toEqual(["salesToCapital"]);
    const shape = cashWaterfallShape(data());
    expect(shape.controls).toBe(2);
    expect(shape.more).toBe(1);
    expect(shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
  });

  it("carries the what-if line and the Icon, and refuses digits in the line (the bench's figures are the engine's)", () => {
    expect(data().whatIf).toBe(webvan.whatIf);
    expect(data().icon).toBe("delivery-truck");
    expect(cashWaterfallData({ company: { ...webvan, whatIf: "Webvan really lost 179% on each sale." } })).toMatchObject({ problem: expect.stringMatching(/whatIf/) });
  });

  it("gives the scene a line that reacts: building ahead while it grows, nothing to build at 0%, cash back once above zero", () => {
    const d = data();
    expect(cashWaterfallScene(d, d.opening)).toMatchObject({ icon: "delivery-truck", mood: "building" });
    expect(cashWaterfallScene(d, { ...d.opening, growth: 0 })).toMatchObject({ mood: "still" });
    expect(cashWaterfallScene(d, { ...d.opening, growth: 10, margin: 20, salesToCapital: 5 })).toMatchObject({ mood: "cash" });
    expect(cashWaterfallScene(d, d.opening)!.buildings).toBeGreaterThan(cashWaterfallScene(d, { ...d.opening, growth: 100 })!.buildings);
    for (const s of [d.opening, { ...d.opening, growth: 0 }]) expect(cashWaterfallScene(d, s)!.line).not.toMatch(/\d/);
  });

  it("draws no scene and keeps its old words for a Valuation Case (Amazon)", () => {
    expect(cashWaterfallScene(amazon, amazon.opening)).toBeNull();
    expect(cashWaterfallCaption(amazon)).toBe("Next year, from revenue to free cash flow");
    expect(cashWaterfallLevers(amazon).some((l) => l.more)).toBe(false);
  });
});
