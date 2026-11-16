import { describe, expect, it } from "vitest";
import { FULL_SHEET_WORDS, type RowWords } from "../widgets/workbench/full-sheet-words";
import { FULL_SHEET_INPUTS, fullSheetWordsErrors } from "./full-sheet-words-check";

// Seam 2, the course check (spec #68 #103): the Full sheet's row words and each row's Lingo card are linted like a
// Topic's terms: plain words, no typed formula, no spreadsheet names, card lines in their word limits, a known picture.

const good = FULL_SHEET_WORDS.cash;
const withRow = (row: RowWords) => ({ ...FULL_SHEET_WORDS, cash: row });

describe("the course check lints the Full sheet's words", () => {
  it("passes the Full sheet's own words, which cover every engine input", () => {
    expect(fullSheetWordsErrors()).toEqual([]);
    expect([...FULL_SHEET_INPUTS].sort()).toEqual(Object.keys(FULL_SHEET_WORDS).sort());
  });

  it("refuses a row with no Lingo card", () => {
    const { cash: _cash, ...rest } = FULL_SHEET_WORDS;
    expect(fullSheetWordsErrors(rest as typeof FULL_SHEET_WORDS)).toEqual([expect.stringMatching(/"cash" has no words or Lingo card/)]);
  });

  it("refuses a spreadsheet name or a camel-cased input name in a row's words", () => {
    expect(fullSheetWordsErrors(withRow({ ...good, words: "Cash in the DCF" }))).toEqual([expect.stringMatching(/"cash".*spreadsheet/)]);
    expect(fullSheetWordsErrors(withRow({ ...good, words: "baseRevenue" }))).toEqual([expect.stringMatching(/"cash".*spreadsheet/)]);
  });

  it("refuses a typed formula (ADR 0003)", () => {
    expect(fullSheetWordsErrors(withRow({ ...good, card: { ...good.card, means: "Value = cash flow / (1 + r)" } }))).toEqual([expect.stringMatching(/"cash".*formula/)]);
  });

  it("refuses a card line over its word limit and a picture that is not in the Icon set", () => {
    const long = Array.from({ length: 15 }, () => "word").join(" ");
    expect(fullSheetWordsErrors(withRow({ ...good, card: { ...good.card, pro: long } }))).toEqual([expect.stringMatching(/"cash".*pro has 15 words; at most 14/)]);
    expect(fullSheetWordsErrors(withRow({ ...good, card: { ...good.card, emoji: "no-such-picture" } }))).toEqual([expect.stringMatching(/"cash".*"no-such-picture"/)]);
  });
});
