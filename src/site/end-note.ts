import { openingEstimate, valueOwnCase, type OwnCaseInputs } from "@/finance/own-case";
import { ownCaseNote } from "@/learner/own-cases";

// Home's "Where you end up" (#75): the one-page note the Assignment saves to the Notebook once the Spine is passed: an
// Own Case, a listed company valued from its annual report on the Estimate the Assignment opens with. It is drawn by the
// same code the Assignment's save runs (ownCaseNote, through the course's tested valuation engine), so the lines are the
// ones a Learner's note holds. Pure: no database, so Home stays public and cacheable per viewer.
//
// The figures, as a Learner copies them: Kikkoman, 有価証券報告書 for the year to 31 Mar 2026 (EDINET S100YE5V, filed
// 2026-06-19), IFRS, 百万円: https://disclosure2dl.edinet-fsa.go.jp/searchdocument/pdf/S100YE5V.pdf . Debt = 短期借入金
// 3,817 + 1年内返済予定の長期借入金 400 + 長期借入金 14,000; shares = 発行済株式総数 969,416,010 − 自己株式 41,674,110;
// tax = 法定実効税率 30.5%. TSE close on 31 Mar 2026: ¥1,435. (The same figures src/finance/own-case-japan-korea.test.ts
// values.)

/** The Own Case Home shows. */
export const END_NOTE_CASE: OwnCaseInputs = {
  company: "Kikkoman",
  market: "JP",
  reportDate: "2026-03-31",
  industry: "food",
  sales: 745_539,
  operatingProfit: 75_940,
  taxPercent: 30.5,
  debt: 18_217,
  cash: 111_770,
  shares: 927_741_900,
  price: 1_435,
};

/** The saved note as the Notebook shows it: the company as its heading, then the note's lines. */
export type EndNote = { title: string; lines: string[] };

export function endNote(): EndNote {
  const estimate = openingEstimate(END_NOTE_CASE.industry, END_NOTE_CASE.market);
  const value = valueOwnCase(END_NOTE_CASE, estimate);
  if (!value.ok) throw new Error(`Home's Own Case cannot be valued: ${value.error}`);
  return { title: END_NOTE_CASE.company, lines: ownCaseNote(END_NOTE_CASE, estimate, value).split("\n") };
}
