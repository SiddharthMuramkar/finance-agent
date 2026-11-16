import { rawFormulaHits } from "../finance/raw-formula.ts";
import { isIconName } from "../icons/names.ts";
import { FULL_SHEET_WORDS, withMoney, type FullSheetInput, type RowWords } from "../widgets/workbench/full-sheet-words.ts";

// The course check for the Full sheet's words (spec #68, #103): every engine input the Full sheet can show has a name and a
// Lingo card, written in plain words like a Topic's terms. A row's name is what the figure does, never a spreadsheet's
// (glossary "Full sheet"); no typed formula anywhere (ADR 0003); a card's lines keep LingoCard's word limits and its
// picture is in the Icon set. No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** Every engine input, in the Full sheet's order: the list the words must cover. */
export const FULL_SHEET_INPUTS: readonly FullSheetInput[] = [
  "baseRevenue",
  "growth",
  "margin",
  "marginAfter",
  "taxRate",
  "taxRateByYear",
  "lossesCarried",
  "salesToCapital",
  "salesToCapitalByYear",
  "costOfCapital",
  "growthAfter",
  "returnOnCapitalAfter",
  "cash",
  "debt",
  "options",
  "shares",
  "failure",
];

/** LingoCard's limits (src/widgets/primitives/wave3/lingo-card.tsx). */
const CARD_LIMITS = { pro: 14, means: 20, example: 20 } as const;

/** Spreadsheet and model names, or an input's name in code ("baseRevenue"), where plain words belong. */
const SPREADSHEET = /\b(?:DCF|Excel|spreadsheet|NOL|WACC|FCFF|EBIT)\b|[a-z][A-Z]/;

const wordCount = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function fullSheetWordsErrors(table: Partial<Record<FullSheetInput, RowWords>> = FULL_SHEET_WORDS): string[] {
  const errors: string[] = [];
  for (const input of FULL_SHEET_INPUTS) {
    const row = table[input];
    const where = `Full sheet row "${input}"`;
    if (!row?.words || !row.card) {
      errors.push(`${where} has no words or Lingo card; add them to src/widgets/workbench/full-sheet-words.ts`);
      continue;
    }
    const names = [row.words, row.besidePath ?? ""].map((w) => withMoney(w, "$"));
    const card = row.card;
    for (const text of [...names, card.term]) {
      if (SPREADSHEET.test(text)) errors.push(`${where} uses a spreadsheet name, not plain words: "${text}"`);
    }
    for (const text of [...names, card.term, card.pro, card.means, card.example]) {
      const hits = rawFormulaHits(text);
      if (hits.length) errors.push(`${where} types a formula (ADR 0003): ${hits.join("; ")}`);
    }
    for (const [line, max] of Object.entries(CARD_LIMITS) as [keyof typeof CARD_LIMITS, number][]) {
      const n = wordCount(card[line]);
      if (n === 0 || n > max) errors.push(`${where}'s Lingo card ${line} has ${n} words; at most ${max}`);
    }
    if (!isIconName(card.emoji)) errors.push(`${where}'s Lingo card picture "${card.emoji}" is not in the Icon set (src/icons/names.ts)`);
  }
  return errors;
}
