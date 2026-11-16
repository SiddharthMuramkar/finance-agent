import { openingEstimate, valueOwnCase, type OwnCaseInputs } from "@/finance/own-case";
import { ownCaseNote } from "@/learner/own-cases";

// Home's "Where you end up" (#75): the one-page note the Assignment saves to the Notebook once the Spine is passed: an
// Own Case, a listed company valued from its annual report on the Estimate the Assignment opens with. It is drawn by the
// same code the Assignment's save runs (ownCaseNote, through the course's tested valuation engine), so the lines are the
// ones a Learner's note holds. Pure: no database, so Home stays public and cacheable per viewer.
//
// The figures, as a Learner copies them: Kikkoman, 有価証券報告書 for the year to 31 Mar 2026 (EDINET S100YE5V, filed
// 2026-06-19 per its 【提出日】), IFRS, 百万円: https://disclosure2dl.edinet-fsa.go.jp/searchdocument/pdf/S100YE5V.pdf .
// Debt = 短期借入金 3,817 + 1年内返済予定の長期借入金 400 + 長期借入金 14,000 + リース負債 8,282 (current) and 34,930
// (non-current), from 連結財政状態計算書 (G10: leases are debt) = 61,429; shares = 発行済株式総数 969,416,010 − 自己株式
// 41,674,110; tax = 法定実効税率 30.5%. The note is dated the day the figures became public, not the year end (M06: nobody
// knew them on 31 Mar), with that day's TSE close: ¥1,540 on 19 Jun 2026 (2801 daily prices on irbank.net and
// kabu.hayauma.net, read 2026-11-16). (The same filing day and close e2e/own-case-japan-korea.spec.ts types.)

/** The Own Case Home shows. */
export const END_NOTE_CASE: OwnCaseInputs = {
  company: "Kikkoman",
  market: "JP",
  reportDate: "2026-06-19",
  industry: "food",
  sales: 745_539,
  operatingProfit: 75_940,
  taxPercent: 30.5,
  debt: 61_429,
  cash: 111_770,
  shares: 927_741_900,
  price: 1_540,
};

/** The saved note as the Notebook shows it: the company as its heading, then the note's lines. */
export type EndNote = { title: string; lines: string[] };

export function endNote(): EndNote {
  const estimate = openingEstimate(END_NOTE_CASE.industry, END_NOTE_CASE.market);
  const value = valueOwnCase(END_NOTE_CASE, estimate);
  if (!value.ok) throw new Error(`Home's Own Case cannot be valued: ${value.error}`);
  return { title: END_NOTE_CASE.company, lines: ownCaseNote(END_NOTE_CASE, estimate, value).split("\n") };
}
