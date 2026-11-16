import { describe, expect, it } from "vitest";
import { valueStory, type DcfInputs } from "@/finance/dcf-engine";
import { AMAZON_2000 } from "@/finance/fixtures/amazon-2000.valuation";
import { inputsFor, valuationBlock } from "@/finance/valuation-case";
import { valuationCase, valuationCaseIds } from "@/finance/valuation-cases";
import { valueLeversModeSchema } from "./data-schemas";
import { fullSheet } from "./full-sheet";
import { LEVER_IDS, leverSpecs, leversFor, openingSettings, valueOf, type LeverId, type LeverSettings } from "./value-levers-model";

// The Full sheet behind Go deeper (spec #68, "Valuation, Full sheet"; ADR 0010): every input the valuation engine takes,
// in plain words, read-only. Seam 3: the rows are exactly the engine's inputs, on every valuation Case.

/**
 * The engine's inputs that are set: an optional yearly path left out is not a row. The chance of failure is always a row,
 * as the Levers always offer it; a story with none leaves the input out, and the row's value is then left out too.
 */
const setKeys = (inputs: DcfInputs) => [...new Set([...Object.keys(inputs).filter((k) => inputs[k as keyof DcfInputs] !== undefined), "failure"])].sort();

describe("the Full sheet's rows are exactly the engine's inputs", () => {
  it.each(valuationCaseIds())("%s, at the Case's own story and with every Lever moved", (id) => {
    const block = valuationCase(id)!;
    const specs = leverSpecs(block);
    const opening = openingSettings(specs);
    // Every Lever a step off its opening, so the rows read the moved story's inputs, not the Case's.
    const moved = Object.fromEntries(specs.map((s) => [s.id, Math.min(s.max, s.opening + s.step)])) as LeverSettings;
    for (const settings of [opening, moved]) {
      const made = inputsFor(block, leversFor(block, specs, settings));
      const sheet = fullSheet(block, specs, settings);
      if (!made.ok) {
        expect(sheet.ok).toBe(false);
        continue;
      }
      if (!sheet.ok) throw new Error(sheet.error);
      const keys = sheet.rows.map((r) => r.input);
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort()).toEqual(setKeys(made.inputs));
      for (const row of sheet.rows) expect(row.value).toEqual(made.inputs[row.input]);
      // The rows alone value the story at the Widget's own value.
      const fromRows = valueStory(Object.fromEntries(sheet.rows.map((r) => [r.input, r.value])) as DcfInputs);
      const shown = valueOf(block, specs, settings);
      expect(fromRows.ok && shown.ok && fromRows.valuePerShare).toBe(shown.ok && shown.valuePerShare);
      for (const row of sheet.rows) {
        expect(row.words.length).toBeGreaterThan(0);
        expect(row.reading.length).toBeGreaterThan(0);
        // Named for what it does, never for a spreadsheet's cells (glossary "Full sheet").
        expect(`${row.words} ${row.reading}`).not.toMatch(/DCF|Excel|spreadsheet|NOL|WACC|FCFF|baseRevenue|[a-z][A-Z]/);
      }
    }
  });
});

describe("the Full sheet on Amazon in February 2000, in plain words", () => {
  const amazon = valuationBlock.parse(AMAZON_2000);
  const specs = leverSpecs(amazon);
  const sheet = fullSheet(amazon, specs, openingSettings(specs));
  if (!sheet.ok) throw new Error(sheet.error);
  const reading = (input: keyof DcfInputs) => sheet.rows.find((r) => r.input === input)?.reading;

  it("reads each figure as the Case gives it", () => {
    expect(reading("baseRevenue")).toBe("$1.1bn");
    expect(reading("growth")).toBe("150% in year 1, down to 6% in year 10");
    expect(reading("taxRate")).toBe("35%");
    expect(reading("lossesCarried")).toBe("$500m");
    expect(reading("salesToCapital")).toBe("$3 of sales for each $1 invested");
    expect(reading("growthAfter")).toBe("6%");
    expect(reading("returnOnCapitalAfter")).toBe("20%");
    expect(reading("cash")).toBe("$26m");
    expect(reading("debt")).toBe("$349m");
    expect(reading("options")).toBe("$2.9bn");
    expect(reading("shares")).toBe("340.79 million");
    expect(reading("failure")).toBe("0%: none in this story");
  });

  it("gives every year of a path that changes", () => {
    const growth = sheet.rows.find((r) => r.input === "growth")!;
    expect(growth.years).toEqual(["150%", "100%", "75%", "50%", "30%", "25.2%", "20.4%", "15.6%", "10.8%", "6%"]);
    const cost = sheet.rows.find((r) => r.input === "costOfCapital")!;
    expect(cost.years?.[0]).toBe("12.84%");
  });
});

// #103: the rows a Lever moves. What each Lever changes, from the spec ("Valuation, Full sheet") and the Lever words: the
// revenue in year 10 is reached by a faster or slower growth path; the margin Lever sets the margin it heads to, so the
// path and the margin after year 10; sales for each $ invested scale every year that sets its own; risk is the cost of
// capital while the business grows; failure is the chance it fails.
const ROWS_A_LEVER_MOVES: Record<LeverId, (inputs: DcfInputs) => (keyof DcfInputs)[]> = {
  revenue: () => ["growth"],
  margin: () => ["margin", "marginAfter"],
  salesToCapital: (inputs) => (inputs.salesToCapitalByYear ? ["salesToCapital", "salesToCapitalByYear"] : ["salesToCapital"]),
  risk: () => ["costOfCapital"],
  failure: () => ["failure"],
};

describe("moving each Lever marks exactly the rows it changes", () => {
  it.each(valuationCaseIds())("%s, each Lever a step off its opening on its own", (id) => {
    const block = valuationCase(id)!;
    const specs = leverSpecs(block);
    const opening = openingSettings(specs);
    const atCase = fullSheet(block, specs, opening);
    if (!atCase.ok) throw new Error(atCase.error);
    // At the Case's own story nothing has moved.
    expect(atCase.rows.filter((r) => r.moved)).toEqual([]);
    for (const lever of LEVER_IDS) {
      const spec = specs.find((s) => s.id === lever)!;
      const step = spec.opening + spec.step <= spec.max ? spec.step : -spec.step;
      const sheet = fullSheet(block, specs, { ...opening, [lever]: spec.opening + step });
      if (!sheet.ok) continue; // a revenue no growth path of the Case's shape reaches: no rows, the error instead
      const made = inputsFor(block, {});
      if (!made.ok) throw new Error(made.error);
      const marked = sheet.rows.filter((r) => r.moved).map((r) => r.input);
      expect([lever, marked.sort()]).toEqual([lever, ROWS_A_LEVER_MOVES[lever](made.inputs).sort()]);
    }
  });

  it("marks the rows of every Lever moved at once, and none once each is back at its opening", () => {
    const amazon = valuationBlock.parse(AMAZON_2000);
    const specs = leverSpecs(amazon);
    const opening = openingSettings(specs);
    const moved = Object.fromEntries(specs.map((s) => [s.id, s.opening + s.step])) as LeverSettings;
    const all = fullSheet(amazon, specs, moved);
    if (!all.ok) throw new Error(all.error);
    expect(all.rows.filter((r) => r.moved).map((r) => r.input).sort()).toEqual(["costOfCapital", "failure", "growth", "margin", "marginAfter", "salesToCapital"]);
    const back = fullSheet(amazon, specs, { ...opening });
    if (!back.ok) throw new Error(back.error);
    expect(back.rows.some((r) => r.moved)).toBe(false);
  });

  it("in market mode, a bigger share of the market moves only the growth path", () => {
    const amazon = valuationBlock.parse(AMAZON_2000);
    const source = { title: "US Census Bureau, Annual Retail Trade Survey", url: "https://www.census.gov/programs-surveys/arts.html" };
    const mode = valueLeversModeSchema.parse({ kind: "market", markets: [{ label: "US retail, excluding cars", size: 2_245_899, source }] });
    const specs = leverSpecs(amazon, mode);
    const opening = openingSettings(specs);
    const revenue = specs.find((s) => s.id === "revenue")!;
    const sheet = fullSheet(amazon, specs, { ...opening, revenue: revenue.opening + revenue.step }, mode, 0);
    if (!sheet.ok) throw new Error(sheet.error);
    expect(sheet.rows.filter((r) => r.moved).map((r) => r.input)).toEqual(["growth"]);
  });
});

describe("every row has a Lingo card", () => {
  it.each(valuationCaseIds())("%s: each row opens a card for its own term, in the Case's currency", (id) => {
    const block = valuationCase(id)!;
    const specs = leverSpecs(block);
    const sheet = fullSheet(block, specs, openingSettings(specs));
    if (!sheet.ok) throw new Error(sheet.error);
    for (const row of sheet.rows) {
      expect(row.card.term.length).toBeGreaterThan(0);
      expect(row.card.means.length).toBeGreaterThan(0);
      expect(`${row.words} ${row.card.term}`).not.toContain("{money}");
    }
    expect(new Set(sheet.rows.map((r) => r.card.term)).size).toBe(sheet.rows.length);
  });

  it("names the money in the Case's own currency", () => {
    const amazon = valuationBlock.parse(AMAZON_2000);
    const specs = leverSpecs(amazon);
    const sheet = fullSheet(amazon, specs, openingSettings(specs));
    if (!sheet.ok) throw new Error(sheet.error);
    expect(sheet.rows.find((r) => r.input === "salesToCapital")?.words).toBe("Sales for each $ invested");
    expect(sheet.rows.find((r) => r.input === "cash")?.card.term).toBe("Cash");
  });
});
