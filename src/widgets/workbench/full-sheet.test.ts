import { describe, expect, it } from "vitest";
import { valueStory, type DcfInputs } from "@/finance/dcf-engine";
import { AMAZON_2000 } from "@/finance/fixtures/amazon-2000.valuation";
import { inputsFor, valuationBlock } from "@/finance/valuation-case";
import { valuationCase, valuationCaseIds } from "@/finance/valuation-cases";
import { fullSheet } from "./full-sheet";
import { leverSpecs, leversFor, openingSettings, valueOf, type LeverSettings } from "./value-levers-model";

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
