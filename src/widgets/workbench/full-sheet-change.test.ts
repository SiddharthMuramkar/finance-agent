import { describe, expect, it } from "vitest";
import { valueStory, type DcfInputs } from "@/finance/dcf-engine";
import { applyLevers, toEngineInputs, type Levers } from "@/finance/valuation-case";
import { valuationCase, valuationCaseIds } from "@/finance/valuation-cases";
import { fullSheet, ROW_IDS, rowsFrom, rowSpecs, withRows, type RowId } from "./full-sheet";
import { leverSpecs, openingSettings, valueOf } from "./value-levers-model";

// Changing a Full sheet row (spec #68, "Valuation, Full sheet"; ADR 0010, ADR 0020): a row the Levers do not set has its own
// slider, never a typed number, and the value is the one valuation engine's for those inputs. Seam 3: pure, inputs in git.

/** The engine's input a row sets, as the engine takes it (rates as fractions), from the row's figure in the Case's units. */
const asInput = (id: RowId, figure: number): number => (id === "taxRate" || id === "growthAfter" || id === "returnOnCapitalAfter" ? figure / 100 : figure);

/** The Levers that already move the same input (Terminal seesaw and Value bridge, spec B4): a second, independent path into the engine. */
const LEVER_FOR: Partial<Record<RowId, keyof Levers>> = { growthAfter: "growthAfter", cash: "cash", debt: "debt", options: "options" };

describe("changing a Full sheet row gives the engine's value for those inputs", () => {
  it.each(valuationCaseIds())("%s, every changeable row at each end of its slider", (id) => {
    const block = valuationCase(id)!;
    const specs = leverSpecs(block);
    const opening = openingSettings(specs);
    const engine = toEngineInputs(block);
    for (const row of rowSpecs(block)) {
      expect(row.min).toBeLessThanOrEqual(row.opening);
      expect(row.max).toBeGreaterThanOrEqual(row.opening);
      for (const figure of [row.min, row.max]) {
        const changed = withRows(block, { [row.id]: figure - row.opening });
        const shown = valueOf(changed, specs, opening);
        const expected = valueStory({ ...engine, [row.id]: asInput(row.id, figure) } as DcfInputs);
        // Every stop on the slider can be valued: the engine never refuses a row's range.
        if (!shown.ok) throw new Error(`${id} ${row.id} at ${figure}: ${shown.error}`);
        expect(expected.ok && expected.valuePerShare).toBeCloseTo(shown.valuePerShare, 9);
        const lever = LEVER_FOR[row.id];
        if (lever) {
          const viaLever = applyLevers(block, { [lever]: figure });
          expect(viaLever.ok && viaLever.valuePerShare).toBeCloseTo(shown.valuePerShare, 9);
        }
        // The Full sheet then reads the changed figure as its row's engine input.
        const sheet = fullSheet(changed, specs, opening);
        expect(sheet.ok && sheet.rows.find((r) => r.input === row.id)?.value).toBeCloseTo(asInput(row.id, figure), 12);
      }
    }
  });

  it("offers a slider on exactly the rows the Levers do not set, and none on the Case's facts", () => {
    expect([...ROW_IDS]).toEqual(["taxRate", "lossesCarried", "growthAfter", "returnOnCapitalAfter", "cash", "debt", "options"]);
    const amazon = valuationCase("amazon-dcf-2000")!;
    expect(rowSpecs(amazon).map((r) => r.id)).toEqual(ROW_IDS);
  });
});

describe("row settings saved with the Widget's state", () => {
  const amazon = valuationCase("amazon-dcf-2000")!;

  it("a Session saved before rows could change draws the Case's own figures: no row moved", () => {
    const rows = rowsFrom({}, amazon);
    expect(rows).toEqual({ taxRate: 0, lossesCarried: 0, growthAfter: 0, returnOnCapitalAfter: 0, cash: 0, debt: 0, options: 0 });
    expect(withRows(amazon, rows)).toBe(amazon);
    const opening = openingSettings(leverSpecs(amazon));
    const value = valueOf(withRows(amazon, rows), leverSpecs(amazon), opening);
    expect(value.ok && Number(value.valuePerShare.toFixed(2))).toBe(35.04);
  });

  it("keeps a saved change, and holds a change beyond the slider at its end", () => {
    const cash = rowSpecs(amazon).find((r) => r.id === "cash")!;
    expect(rowsFrom({ cashRow: 100, taxRow: Number.NaN, debtRow: "x" }, amazon)).toMatchObject({ cash: 100, taxRate: 0, debt: 0 });
    expect(rowsFrom({ cashRow: 1e12 }, amazon).cash).toBe(cash.max - cash.opening);
  });
});
