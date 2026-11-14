import { describe, expect, it } from "vitest";
import { AMAZON_2000 } from "./fixtures/amazon-2000.valuation";
import { REPRODUCE_TOLERANCE, valueCase } from "./valuation-case";
import { valuationCase, valuationCaseIds } from "./valuation-cases";
import { VALUATION_CASES } from "./valuation-cases.generated";

// The Valuation Case registry (shared contract of spec 2026-11-12 B3): the valuation blocks of course/topics by Case id.

describe("the Valuation Case registry", () => {
  it("holds Damodaran's Amazon of February 2000 under its Case id, as the fixture writes it", () => {
    expect(valuationCaseIds()).toContain("amazon-dcf-2000");
    expect(VALUATION_CASES["amazon-dcf-2000"]).toEqual(AMAZON_2000);
  });

  it("lists its ids sorted, and its keys are written sorted", () => {
    const ids = valuationCaseIds();
    expect(ids).toEqual([...ids].sort());
    expect(Object.keys(VALUATION_CASES)).toEqual([...Object.keys(VALUATION_CASES)].sort());
  });

  it("parses a block once, with defaults filled in, and values it at $35.04 a share (Appendix B.1)", () => {
    const amazon = valuationCase("amazon-dcf-2000");
    expect(amazon).not.toBeNull();
    expect(amazon).toBe(valuationCase("amazon-dcf-2000"));
    expect(amazon!.per).toBe("share");
    const valued = valueCase(amazon!);
    expect(valued.ok && valued.valuePerShare.toFixed(2)).toBe("35.04");
  });

  it("knows no other Case, and no name off the object's prototype", () => {
    expect(valuationCase("tesla-2020")).toBeNull();
    expect(valuationCase("toString")).toBeNull();
    expect(valuationCase("")).toBeNull();
  });
});

// What each Case's source published, from docs/research/verify-*.json: the value a share, or for a company valued
// whole (per: company) its value; null for an illustration, which has no published value.
const PUBLISHED: Record<string, number | null> = {
  "amazon-dcf-2000": 35.08,
  "coffee-day-distress-2019": null,
  "coffee-day-rupee-valuation-2015": null,
  "fol-tesla-2020-diy": 426.58,
  "fol-uber-2014-crowd": 17404.33,
  "jud-nn-uber-2014-post": 53380.39,
  "jud-nn-uber-s1-2019": 53.9,
  "uber-vc-narrative-2014": 5894.89,
  "webvan-centre-npv-2000": null,
  "wework-leases-2019": 26.18,
  "zomato-ipo-2021": 40.79,
};

describe("every Case's own valuation block against what was published", () => {
  // Blocks borrowed through valuationFrom are the same object as the one they borrow, so each written block is checked once.
  const written = valuationCaseIds().filter((id) => Object.hasOwn(PUBLISHED, id));

  it("covers every Case the verified research gives a valuation", () => {
    expect(written.sort()).toEqual(Object.keys(PUBLISHED).sort());
  });

  it.each(Object.entries(PUBLISHED))("%s reproduces its published value within 2%, says reproduces: false, or is an illustration", (id, published) => {
    const block = valuationCase(id)!;
    expect(block).not.toBeNull();
    const valued = valueCase(block);
    expect(valued.ok).toBe(true);
    if (!valued.ok) return;
    if (published === null) {
      expect(block.illustration).toBe(true);
      expect(block.reproduces).toBe(false);
      expect(block.published.valuePerShare).toBeUndefined();
      return;
    }
    expect(block.illustration).toBe(false);
    expect(block.published.valuePerShare).toBe(published);
    const within = Math.abs(valued.valuePerShare - published) <= REPRODUCE_TOLERANCE * published;
    expect(block.reproduces).toBe(within);
    // Every one the research checked comes within 2% once the engine takes tax and sales to capital by year.
    expect(within).toBe(true);
  });

  it("Coffee Day's 2019 survival story is an illustration worth Rs 192.11 a share, and Webvan's $9.02 (the verifier's engine)", () => {
    const coffee = valueCase(valuationCase("coffee-day-distress-2019")!);
    expect(coffee.ok && coffee.valuePerShare.toFixed(2)).toBe("192.11");
    const webvan = valueCase(valuationCase("webvan-centre-npv-2000")!);
    expect(webvan.ok && webvan.valuePerShare.toFixed(2)).toBe("9.02");
    const rupees = valueCase(valuationCase("coffee-day-rupee-valuation-2015")!);
    expect(rupees.ok && rupees.valuePerShare.toFixed(2)).toBe("89.32");
  });
});
