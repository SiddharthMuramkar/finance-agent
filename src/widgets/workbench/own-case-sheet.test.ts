import { describe, expect, it } from "vitest";
import { openingEstimate, valueOwnCase, type OwnCaseEstimate, type OwnCaseInputs } from "@/finance/own-case";
import { NO_ROW_CHANGES, ROW_IDS, rowSpecs } from "./full-sheet";
import { OWN_CASE_TYPED, ownCaseSheet, sheetValueLine } from "./own-case-sheet";

// Seam 3 (spec #68, ticket #111): an Own Case on the Full sheet. Every input the Learner gave, and every figure the
// opening Estimate took from a yardstick or a default, is a row that says where it came from; changing a row revalues
// the Own Case through the one engine (ADR 0010), the same value as typing that figure into the form.

const COFFEE_DAY: OwnCaseInputs = {
  company: "Coffee Day Enterprises",
  market: "IN",
  reportDate: "2015-10-21",
  industry: "food",
  sales: 2479.36,
  operatingProfit: 109.59,
  taxPercent: 33.99,
  debt: 4998.4,
  cash: 3679.63,
  shares: 206_001_719,
  price: 328,
};
const OPENING = openingEstimate("food");
const NOW = new Date("2026-11-16T00:00:00Z");

const sheetOf = (estimate: OwnCaseEstimate = OPENING, rows = NO_ROW_CHANGES) => {
  const sheet = ownCaseSheet(COFFEE_DAY, estimate, rows, NOW);
  if (!sheet.ok) throw new Error(sheet.error);
  return sheet;
};
const origins = (input: string) => sheetOf().rows.find((r) => r.input === input)?.origins;

describe("every Own Case input on the Full sheet, with where it came from", () => {
  it("each typed figure is a row marked as typed", () => {
    const sheet = sheetOf();
    const typedFrom = new Set(sheet.rows.filter((r) => r.origins.includes("typed")).flatMap((r) => r.from));
    for (const key of OWN_CASE_TYPED) expect(typedFrom, key).toContain(key);
    // The literal list of the eight figures the form asks for (spec #68, user story 79), less the industry tap.
    expect([...OWN_CASE_TYPED].sort()).toEqual(["cash", "debt", "operatingProfit", "price", "sales", "shares", "taxPercent"]);
  });

  it("each opening Estimate figure is a row marked as a yardstick or a default", () => {
    const sheet = sheetOf();
    const from = new Set(sheet.rows.flatMap((r) => r.from));
    for (const key of Object.keys(OPENING)) expect(from, key).toContain(key);
    expect(origins("salesToCapital")).toEqual(["yardstick"]);
    expect(origins("costOfCapital")).toEqual(["yardstick"]);
    expect(origins("marginAfter")).toEqual(["yardstick"]);
    // Return on capital after year 10 is the cost of capital then (openingEstimate): a default, not a yardstick of its own (G20).
    expect(origins("returnOnCapitalAfter")).toEqual(["default"]);
    expect(origins("growth")).toEqual(["default"]);
    expect(origins("growthAfter")).toEqual(["default"]);
    expect(origins("lossesCarried")).toEqual(["default"]);
    expect(origins("options")).toEqual(["default"]);
    expect(origins("failure")).toEqual(["default"]);
    expect(origins("margin")).toEqual(["typed", "yardstick"]);
    for (const input of ["baseRevenue", "taxRate", "cash", "debt", "shares", "price"]) expect(origins(input), input).toEqual(["typed"]);
  });

  it("every row says where it came from in words, and shows the typed figures as typed", () => {
    const sheet = sheetOf();
    for (const row of sheet.rows) expect(row.originWords, row.input).toMatch(/^(You typed it|The industry's yardstick|A default)/);
    expect(sheet.rows.find((r) => r.input === "returnOnCapitalAfter")?.originWords).toBe("A default: the same as the cost of capital after year 10");
    expect(sheet.rows.find((r) => r.input === "price")?.reading).toBe("₹328");
    expect(sheet.rows.find((r) => r.input === "cash")?.reading).toBe("₹3,679.6 crore");
  });

  it("an Estimate figure the Learner set is theirs, not the yardstick's", () => {
    const sheet = sheetOf({ ...OPENING, salesToCapital: OPENING.salesToCapital + 1 });
    expect(sheet.rows.find((r) => r.input === "salesToCapital")?.origins).toEqual(["estimate"]);
  });

  // G20: outside India, growth after year 10 opens at the market's dated 10-year bond reading (own-case.ts), not a default.
  it("in a market with a dated risk-free reading, growth after year 10 is that reading", () => {
    for (const market of ["US", "JP", "KR", "EU"] as const) {
      const sheet = ownCaseSheet({ ...COFFEE_DAY, market }, openingEstimate("food", market), NO_ROW_CHANGES, NOW);
      if (!sheet.ok) throw new Error(sheet.error);
      const row = (input: string) => sheet.rows.find((r) => r.input === input)!;
      expect(row("growthAfter").origins, market).toEqual(["reading"]);
      expect(row("growthAfter").originWords, market).toBe("The market's dated 10-year bond reading");
      expect(row("growth").originWords, market).toBe("A default; then the market's dated 10-year bond reading");
    }
    expect(sheetOf().rows.find((r) => r.input === "growth")?.originWords).toBe("A default");
  });

  it("figures that cannot be valued give a readable sentence, never a sheet", () => {
    const sheet = ownCaseSheet({ ...COFFEE_DAY, shares: 0 }, OPENING, NO_ROW_CHANGES, NOW);
    expect(sheet).toEqual({ ok: false, error: "The share count must be above zero." });
  });
});

describe("changing a row revalues the Own Case through the engine", () => {
  // The CI failure at 5459df8: the form read ₹0 (F06) while the sheet read -₹14 for the same Own Case.
  it("a value at or below zero reads 0 with the form's words, never a negative price", () => {
    const sheet = sheetOf();
    expect(sheet.valuePerShare).toBeLessThan(0);
    expect(sheetValueLine(sheet.valuePerShare, sheet.block)).toBe("The engine's value with these rows: ₹0 a share. Lenders take everything: nothing is left for shareholders.");
    expect(sheetValueLine(123.4, sheet.block)).toBe("The engine's value with these rows: ₹123 a share.");
  });

  it("at the sheet's opening the value is the form's value", () => {
    const form = valueOwnCase(COFFEE_DAY, OPENING, NOW);
    if (!form.ok) throw new Error(form.error);
    expect(sheetOf().valuePerShare).toBe(form.valuePerShare);
  });

  // A typed figure moved on the sheet gives the value of typing that figure into the form: one engine, two ways in.
  const TYPED_ROW = { taxRate: "taxPercent", cash: "cash", debt: "debt" } as const;
  for (const [row, field] of Object.entries(TYPED_ROW) as [keyof typeof TYPED_ROW, (typeof TYPED_ROW)[keyof typeof TYPED_ROW]][]) {
    it(`moving ${row} to either end of its slider is typing it`, () => {
      const spec = rowSpecs(sheetOf().block).find((s) => s.id === row)!;
      for (const figure of [spec.min, spec.max]) {
        const sheet = sheetOf(OPENING, { ...NO_ROW_CHANGES, [row]: figure - spec.opening });
        const typed = valueOwnCase({ ...COFFEE_DAY, [field]: figure }, OPENING, NOW);
        if (!typed.ok) throw new Error(typed.error);
        expect(sheet.valuePerShare).toBeCloseTo(typed.valuePerShare, 6);
        expect(sheet.rows.find((r) => r.input === row)?.moved).toBe(figure !== spec.opening);
      }
    });
  }

  it("moving any row changes the value, and coming back gives the opening value", () => {
    const opening = sheetOf().valuePerShare;
    for (const id of ROW_IDS) {
      const spec = rowSpecs(sheetOf().block).find((s) => s.id === id)!;
      const moved = sheetOf(OPENING, { ...NO_ROW_CHANGES, [id]: spec.max - spec.opening });
      expect(moved.valuePerShare, id).not.toBeCloseTo(opening, 4);
    }
    expect(sheetOf(OPENING, NO_ROW_CHANGES).valuePerShare).toBe(opening);
  });
});
