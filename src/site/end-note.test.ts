import { describe, expect, it } from "vitest";
import { openingEstimate, valueOwnCase } from "@/finance/own-case";
import { ownCaseNote } from "@/learner/own-cases";
import { END_NOTE_CASE, endNote } from "./end-note";

// #75 "Where you end up": Home shows the one-page note the Assignment saves to the Notebook (an Own Case on the Estimate
// the Assignment opens with), worked out by the course's tested valuation engine, not typed in by hand. Spec #68 (F14):
// the Spine's last Topics no longer save a Valuation story, so Home shows the note a Learner can make.
describe("the note Home shows under 'Where you end up'", () => {
  it("is the Assignment's Own Case note, line for line, for Kikkoman's annual report", () => {
    const estimate = openingEstimate(END_NOTE_CASE.industry, END_NOTE_CASE.market);
    const value = valueOwnCase(END_NOTE_CASE, estimate);
    expect(value.ok).toBe(true);
    if (!value.ok) return;
    const note = endNote();
    expect(note.title).toBe("Kikkoman");
    expect(note.lines).toEqual(ownCaseNote(END_NOTE_CASE, estimate, value).split("\n"));
    expect(note.lines).toEqual([
      "Kikkoman, Japan. Annual report of 31 Mar 2026. Industry: Food processors.",
      "From the report: sales ¥745.5bn, operating profit ¥75.9bn (a margin of 10.19%), tax rate 30.5%, debt ¥18.2bn, cash ¥111.8bn, 927,741,900 shares, price ¥1,435 on 31 Mar 2026.",
      "My Estimate: growth 10% a year for five years, fading to 2.82%; the margin heading for 5.11%; ¥1.92 of sales for each ¥1 invested; cost of capital 3.84%.",
      "The engine's value: ¥1,234 a share, beside a price of ¥1,435 on 31 Mar 2026.",
    ]);
  });
});
