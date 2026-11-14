import { describe, expect, it } from "vitest";
import { AMAZON_2000 } from "@/finance/fixtures/amazon-2000.valuation";
import { valuationBlock } from "@/finance/valuation-case";
import { instantiateJudgement, judgementProblems, type ComputedQuestionInput, type JudgementInstance } from "./judgement";

// Computed judgement questions (spec 2026-11-12, D1 to D3, D5). Every expected figure is from the spec: the table under
// decision B3, the examples in D1 and D3, and Appendix B.2, all on Damodaran's Amazon of February 2000 ($84 price).

const amazon = valuationBlock.parse(AMAZON_2000);

function instance(q: ComputedQuestionInput, block = amazon, seed?: string): JudgementInstance {
  const result = instantiateJudgement(q, block, seed);
  if (!result.ok) throw new Error(result.error);
  return result.instance;
}

const figures = (i: JudgementInstance) => Object.fromEntries(i.choices.map((c) => [c.id, c.figure]));

/** D1's "Which lever" example for Spine Topic 1. */
const whichLever: ComputedQuestionInput = {
  id: "worth-lever",
  kind: "which_lever",
  prompt: "From his story, which change lifts the value most?",
  computed: {
    case: "amazon",
    changes: [
      { id: "margin", label: "Margin 10% to 12%", levers: { marginTarget: 12 } },
      { id: "revenue", label: "Revenue in year 10 $39bn to $44bn", levers: { revenueYear10: 44000 } },
      { id: "reinvest", label: "Sales to capital 3 to 4", levers: { salesToCapital: 4 } },
      { id: "risk", label: "Cost of capital 12.84% to 11.84%", levers: { costOfCapitalGrowing: 11.84 } },
    ],
  },
};

/** D1's "What the price assumes" example. */
const priceAssumes: ComputedQuestionInput = {
  id: "worth-price",
  kind: "price_assumes",
  prompt: "The price is $84. Which story gets there?",
  computed: {
    case: "amazon",
    changes: [
      { id: "bigger-richer", label: "$60bn and 12.5%", levers: { revenueYear10: 60000, marginTarget: 12.5 } },
      { id: "cheaper-money", label: "$39bn, 10% and a 10% cost of capital", levers: { costOfCapitalGrowing: 10 } },
      { id: "lean", label: "$39bn, 10% and sales to capital 5", levers: { salesToCapital: 5 } },
      { id: "bigger", label: "$50bn and 10%", levers: { revenueYear10: 50000 } },
    ],
  },
};

describe("which lever (D1, D2)", () => {
  it("picks margin, and shows each change's value as B3 gives it", () => {
    const q = instance(whichLever);
    expect(q.answer).toBe("margin");
    // $40.66 at a lever of exactly $44bn. The spec's $40.67 adds $5bn to the Case's own year-10 revenue of $39,006m
    // (the same $6m gap that puts B3's $46.29 against the engine's $46.28 at exactly $49bn); see the next test.
    expect(figures(q)).toEqual({ margin: "$48.51", revenue: "$40.66", reinvest: "$39.99", risk: "$38.34" });
    expect(q.start.figure).toBe("$35.04");
    expect(q.choices.map((c) => c.text).sort()).toEqual(whichLever.computed.changes.map((c) => c.label).sort());
  });

  it("gives the spec's $40.67 when revenue rises $5bn from the Case's own year 10", () => {
    const plusFive = { ...whichLever, computed: { ...whichLever.computed, changes: whichLever.computed.changes.map((c) => (c.id === "revenue" ? { ...c, levers: { revenueYear10: 44006 } } : c)) } };
    expect(figures(instance(plusFive)).revenue).toBe("$40.67");
  });

  it("picks the smallest move when the prompt asks for the least", () => {
    const least = { ...whichLever, prompt: "From his story, which change lifts the value least?", computed: { ...whichLever.computed, changes: whichLever.computed.changes.filter((c) => c.id !== "reinvest") } };
    expect(instance(least).answer).toBe("risk");
  });

  it("gives every wrong choice a fix that quotes the two figures being compared (D3)", () => {
    const q = instance(whichLever);
    const risk = q.choices.find((c) => c.id === "risk")!;
    expect(risk.mistake?.fix).toBe("Cost of capital 12.84% to 11.84% gives $38.34, about $3 a share more. Margin 10% to 12% gives $48.51, about $13 more.");
    expect(q.choices.find((c) => c.id === "margin")!.mistake).toBeUndefined();
    for (const c of q.choices.filter((x) => x.id !== "margin")) expect(c.mistake?.fix).toContain("$48.51");
  });

  it("adds the figures after the file's words in the explanation", () => {
    const q = instance({ ...whichLever, explanation: "Margin and growth move value most." });
    expect(q.explanation).toMatch(/^Margin and growth move value most\. From \$35\.04 a share: /);
    for (const f of ["$48.51", "$40.66", "$39.99", "$38.34"]) expect(q.explanation).toContain(f);
  });

  it("changes its answer and figures when the Case's valuation input changes, with no edit to the question", () => {
    // The same Case with growth twice as costly (sales to capital 1.5, B.2: $15.25): moving it to 4 now lifts the value most.
    const changed = valuationBlock.parse({ ...AMAZON_2000, salesToCapital: 1.5, reproduces: false });
    const after = instance(whichLever, changed);
    expect(after.start.figure).toBe("$15.25");
    expect(after.answer).toBe("reinvest");
    expect(figures(after)).not.toEqual(figures(instance(whichLever)));
    expect(figures(after).reinvest).toBe("$39.99");
  });
});

describe("what the price assumes (D1, D2)", () => {
  it("picks the story within 5% of the $84 price, with B.2's figures", () => {
    const q = instance(priceAssumes);
    expect(q.answer).toBe("bigger-richer");
    expect(figures(q)).toEqual({ "bigger-richer": "$84.07", "cheaper-money": "$45.08", lean: "$42.96", bigger: "$47.40" });
    expect(q.choices.find((c) => c.id === "bigger")!.mistake?.fix).toBe("$50bn and 10% gives $47.40, short of the $84 price. $60bn and 12.5% gives $84.07, within 5% of it.");
    expect(q.explanation).toContain("The price is $84.");
  });

  it("cannot be served, and fails the check, when no story comes within 5% of the price", () => {
    const far = { ...priceAssumes, computed: { ...priceAssumes.computed, changes: priceAssumes.computed.changes.slice(1) } };
    expect(instantiateJudgement(far, amazon)).toEqual({ ok: false, error: "no story it shows comes within 5% of the $84 price" });
    expect(judgementProblems(far, amazon)).toEqual(["no story it shows comes within 5% of the $84 price"]);
  });
});

describe("the course check's near-tie rule (L14)", () => {
  it("passes D1's examples", () => {
    expect(judgementProblems(whichLever, amazon)).toEqual([]);
    expect(judgementProblems(priceAssumes, amazon)).toEqual([]);
  });

  it("rejects a which-lever question in which another choice is within 5% of the right one", () => {
    // B3: revenue to $49bn gives $46.28, within 5% of margin's $48.51.
    const tie = { ...whichLever, computed: { ...whichLever.computed, changes: whichLever.computed.changes.map((c) => (c.id === "revenue" ? { ...c, levers: { revenueYear10: 49000 } } : c)) } };
    expect(judgementProblems(tie, amazon)).toEqual(['"revenue" ($46.28) comes within 5% of the right choice "margin" ($48.51), so the question is a coin toss']);
  });

  it("rejects a what-the-price-assumes question with two stories near the price", () => {
    // B.2: $55bn with 13.5% gives $85.77, within 5% of $84.07.
    const two = { ...priceAssumes, computed: { ...priceAssumes.computed, changes: [...priceAssumes.computed.changes.slice(0, 3), { id: "also", label: "$55bn and 13.5%", levers: { revenueYear10: 55000, marginTarget: 13.5 } }] } };
    expect(judgementProblems(two, amazon)).toEqual(['"also" ($85.77) comes within 5% of the right choice "bigger-richer" ($84.07), so the question is a coin toss']);
  });
});

describe("predict, then see (D1)", () => {
  const predict: ComputedQuestionInput = {
    id: "worth-predict",
    kind: "predict",
    prompt: "If {change}, not 10%, the value will be:",
    computed: {
      case: "amazon",
      changes: [
        { id: "thin", label: "Margins end at 4%", levers: { marginTarget: 4 } },
        { id: "eight", label: "Margins end at 8%", levers: { marginTarget: 8 } },
        { id: "six", label: "Margins end at 6%", levers: { marginTarget: 6 } },
      ],
      bands: [
        { id: "most", label: "About two thirds", min: 0.4, max: 0.9 },
        { id: "fifth", label: "About a fifth", min: 0.1, max: 0.4 },
        { id: "none", label: "Nothing left", max: 0.1 },
      ],
    },
  };

  it("lands margins of 4% in nothing left, from B.2's -$5.49 shown as $0", () => {
    const q = instance(predict);
    expect(q.prompt).toBe("If margins end at 4%, not 10%, the value will be:");
    expect(q.answer).toBe("none");
    expect(q.predict).toEqual({ change: "Margins end at 4%", value: 0, figure: "$0" });
    expect(q.choices.map((c) => c.id)).toEqual(["most", "fifth", "none"]);
    expect(q.choices.every((c) => !c.mistake)).toBe(true);
  });

  it("shows another change from the pool for a Review's seed (D5)", () => {
    const shown = new Set(["r1", "r2", "r3", "r4", "r5", "r6"].map((s) => instance(predict, amazon, s).predict!.change));
    expect(shown.has("Margins end at 4%")).toBe(false);
    expect([...shown].every((c) => ["Margins end at 8%", "Margins end at 6%"].includes(c))).toBe(true);
    // B.2: 8% gives $21.57 (62% of $35.04); 6% gives $8.06 (23%).
    const eight = [...Array(20).keys()].map((n) => instance(predict, amazon, `s${n}`)).find((i) => i.predict!.change === "Margins end at 8%")!;
    expect(eight.predict!.figure).toBe("$21.57");
    expect(eight.answer).toBe("most");
  });

  it("fails the check when a change lands in no band", () => {
    const gap = { ...predict, computed: { ...predict.computed, bands: predict.computed.bands!.slice(0, 2) } };
    expect(judgementProblems(gap, amazon)).toEqual(['change "thin" ($0, from $35.04) lands in 0 bands; it must land in exactly one']);
  });
});

describe("a Review's fresh set (D5)", () => {
  const pool: ComputedQuestionInput = {
    ...whichLever,
    computed: {
      ...whichLever.computed,
      shown: 3,
      changes: [
        ...whichLever.computed.changes,
        { id: "fail", label: "A one-in-ten chance it fails", levers: { failureChance: 10 } },
        { id: "grocer", label: "A grocer's margins", levers: { marginTarget: 4 } },
      ],
    },
  };

  it("shows the Check's own set with no seed, and other sets with a clear answer for Review seeds", () => {
    const check = instance(pool);
    expect(check.choices.map((c) => c.id).sort()).toEqual(["margin", "reinvest", "revenue"]);
    const drawn = ["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => instance(pool, amazon, s));
    for (const d of drawn) {
      expect(d.choices).toHaveLength(3);
      expect(d.choices.map((c) => c.id).sort()).not.toEqual(["margin", "reinvest", "revenue"]);
    }
    expect(new Set(drawn.map((d) => d.choices.map((c) => c.id).sort().join())).size).toBeGreaterThan(1);
  });

  it("gives the same draw for the same seed, so marking sees what was shown", () => {
    expect(instance(pool, amazon, "learner-1.r2")).toEqual(instance(pool, amazon, "learner-1.r2"));
  });
});

describe("a which-lever prompt that says which way (L14)", () => {
  it("fails when the prompt says the changes lift the value and one takes it down", () => {
    const mixed = { ...whichLever, computed: { ...whichLever.computed, changes: [...whichLever.computed.changes, { id: "grocer", label: "A grocer's margins", levers: { marginTarget: 4 } }] } };
    expect(judgementProblems(mixed, amazon)).toEqual(['its prompt says the changes lift the value, but "grocer" takes it down to $0']);
    expect(judgementProblems({ ...mixed, prompt: "From his story, which change moves the value most?" }, amazon)).toEqual([]);
  });
});

describe("a company valued whole (per: company)", () => {
  // Amazon's block read as one whole company: the same values, in $ millions, with no "a share" anywhere.
  const whole = valuationBlock.parse({ ...AMAZON_2000, per: "company", shares: 1, options: 0, price: { value: 28_000, date: "2000-02-01" } });
  it("shows values and the price in billions, never a share", () => {
    const q: ComputedQuestionInput = {
      id: "whole-lever",
      kind: "which_lever",
      prompt: "Which change lifts the value most?",
      computed: { case: "c", changes: [{ id: "margin", label: "Margin 10% to 12%", levers: { marginTarget: 12 } }, { id: "risk", label: "Cost of capital to 11.84%", levers: { costOfCapitalGrowing: 11.84 } }] },
    };
    const served = instantiateJudgement(q, whole);
    if (!served.ok) throw new Error(served.error);
    for (const c of served.instance.choices) expect(c.figure).toMatch(/^\$\d+(\.\d)?bn$/);
    const text = JSON.stringify(served.instance);
    expect(text).not.toMatch(/a share/);
  });
});

describe("a price that nobody paid (price.label)", () => {
  const talk = valuationBlock.parse({ ...AMAZON_2000, price: { ...AMAZON_2000.price, label: "talk" } });
  it("says 'the talk', never 'the price', in the figures and the mix-up fixes", () => {
    const q: ComputedQuestionInput = {
      id: "talk-q",
      kind: "price_assumes",
      prompt: "The talk is of $84. Which story gets there?",
      computed: {
        case: "c",
        changes: [
          { id: "bigger-richer", label: "$60bn and 12.5%", levers: { revenueYear10: 60000, marginTarget: 12.5 } },
          { id: "bigger", label: "$50bn and 10%", levers: { revenueYear10: 50000 } },
        ],
      },
    };
    const served = instantiateJudgement(q, talk);
    if (!served.ok) throw new Error(served.error);
    // What the Learner reads: the explanation and each wrong choice's fix (the mistake tag is an id, not shown).
    const shown = [served.instance.explanation, ...served.instance.choices.map((c) => c.mistake?.fix ?? "")].join(" ");
    expect(shown).toContain("The talk is $84.");
    expect(shown).toContain("the $84 talk");
    expect(shown).not.toMatch(/\bprice\b/);
  });
});
