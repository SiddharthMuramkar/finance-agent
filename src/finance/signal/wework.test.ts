import { describe, expect, it } from "vitest";
import { WEWORK_START, answerCall, clampBeat, nextBeat, perDollarOfRevenue, startAgain, weworkView, type WeworkBeat } from "./wework";

// Expected values come from the Signal spec §6.6 (WeWork, a pace is not revenue) and QA §13 item 18.
const at = (beat: WeworkBeat) => weworkView({ beat, answer: null });

describe("WeWork bars: one scale to $3.2bn, each row named with its own time base (§6.6.1)", () => {
  it("shows the three rows in spec order with their amounts, notes and scale positions once all are revealed", () => {
    const bars = at(4).bars;
    expect(bars.map((b) => [b.label, b.valueText, b.note])).toEqual([
      ["Run rate claimed", "$3.0bn", "A full year, if the latest month repeated 12 times"],
      ["Revenue recorded", "$1.54bn", "Six months, January to June 2019"],
      ["Net loss", "−$0.905bn", "The same six months"],
    ]);
    // Scale positions 3.0 / 3.2, 1.54 / 3.2 and 0.905 / 3.2.
    expect(bars[0].widthPercent).toBeCloseTo(93.75, 10);
    expect(bars[1].widthPercent).toBeCloseTo(48.125, 10);
    expect(bars[2].widthPercent).toBeCloseTo(28.28125, 10);
    expect(bars.map((b) => b.kind)).toEqual(["claim", "recorded", "loss"]);
  });

  it("hides every row on beat 1: '?' as the value and a zero-width bar", () => {
    expect(WEWORK_START).toEqual({ beat: 1, answer: null });
    expect(weworkView(WEWORK_START).bars.map((b) => [b.shown, b.valueText, b.widthPercent])).toEqual([
      [false, "?", 0],
      [false, "?", 0],
      [false, "?", 0],
    ]);
  });

  it("reveals the run rate at beat 2, recorded revenue at beat 3 and the net loss at beat 4", () => {
    const shown = (beat: WeworkBeat) => at(beat).bars.map((b) => b.shown);
    expect(shown(2)).toEqual([true, false, false]);
    expect(shown(3)).toEqual([true, true, false]);
    expect(shown(4)).toEqual([true, true, true]);
    expect(shown(5)).toEqual([true, true, true]);
    expect(at(3).bars[2]).toMatchObject({ valueText: "?", widthPercent: 0 });
  });
});

describe("WeWork beats: one at a time, five dots, Next beat and Start again (§6.6.2)", () => {
  it("tells beats 1 to 5 with the spec's speakers and words", () => {
    expect(([1, 2, 3, 4, 5] as const).map((beat) => [at(beat).card.number, at(beat).card.speaker, at(beat).card.text])).toEqual([
      [1, "Narrator", "14 August 2019. WeWork publishes its plan to sell shares to the public."],
      [2, "WeWork", "Over seven years to $1 billion run-rate, then six months from $2 billion to $3 billion!"],
      [3, "Asha · weighs the share sale", "Nice. But the revenue actually recorded this half-year is $1.54 billion."],
      [4, "Asha", "And the net loss? About $905 million."],
      [5, "Narrator", "Asha must decide what a run rate tells her about earned revenue."],
    ]);
  });

  it("steps one beat at a time and stops at beat 5", () => {
    let state = WEWORK_START;
    const seen: number[] = [];
    for (let tap = 0; tap < 6; tap++) {
      state = nextBeat(state);
      seen.push(state.beat);
    }
    expect(seen).toEqual([2, 3, 4, 5, 5, 5]);
  });

  it("offers 'Next beat' until beat 5, then a disabled 'End of the story'", () => {
    expect(at(1).next).toEqual({ label: "Next beat", disabled: false });
    expect(at(4).next).toEqual({ label: "Next beat", disabled: false });
    expect(at(5).next).toEqual({ label: "End of the story", disabled: true });
  });

  it("fills the progress dots up to the beat reached", () => {
    expect(at(1).dots).toEqual([true, false, false, false, false]);
    expect(at(3).dots).toEqual([true, true, true, false, false]);
    expect(at(5).dots).toEqual([true, true, true, true, true]);
  });

  it("returns to beat 1 on Start again", () => {
    expect(startAgain()).toEqual(WEWORK_START);
  });

  it("clamps an incoming beat to a whole number from 1 to 5 (state schema §8.2)", () => {
    expect([1, 5, 0, -3, 6, 99, 2.4, 3.6].map(clampBeat)).toEqual([1, 5, 1, 1, 5, 5, 2, 4]);
    expect([Number.NaN, Number.POSITIVE_INFINITY, "3", null, undefined].map(clampBeat)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("WeWork call and Go deeper: is $3 billion of run-rate revenue $3 billion earned? (§6.6.3)", () => {
  const toBeat5 = () => [1, 2, 3, 4].reduce((s) => nextBeat(s), WEWORK_START);

  it("shows no call before beat 5, and taps before then change nothing", () => {
    for (const beat of [1, 2, 3, 4] as const) expect(at(beat).call).toBeNull();
    const early = { beat: 3, answer: null } as const;
    expect(answerCall(early, "pace")).toEqual(early);
  });

  it("asks the call on beat 5 with the two options, nothing answered and Go deeper closed", () => {
    const view = weworkView(toBeat5());
    expect(view.call).toEqual({
      question: "Is $3 billion of run-rate revenue $3 billion earned?",
      options: [
        { id: "revenue", label: "Yes, it is revenue" },
        { id: "pace", label: "No, it is a pace" },
      ],
      answer: null,
    });
    expect(view.goDeeper).toBeNull();
  });

  it("QA 18: beat 5, tap 'No, it is a pace': three bars shown, right, Go deeper shows $1.00 and −$0.59", () => {
    const view = weworkView(answerCall(toBeat5(), "pace"));
    expect(view.bars.every((b) => b.shown)).toBe(true);
    expect(view.call?.answer).toEqual({
      optionId: "pace",
      verdict: "right",
      feedback: "It is the latest month’s revenue times 12. That is a pace, and it is only as good as the guess that the pace repeats.",
    });
    expect(view.goDeeper?.title).toBe("Put the loss next to the revenue.");
    expect(view.goDeeper?.sentence).toBe("For every $1 of revenue it recorded in those six months, WeWork lost about 59 cents.");
    expect(view.goDeeper?.bars).toEqual([
      { label: "Revenue recorded", kind: "recorded", valueText: "$1.00", widthPercent: 100 },
      { label: "Net loss on it", kind: "loss", valueText: "−$0.59", widthPercent: 58.8 },
    ]);
  });

  it("marks 'Yes, it is revenue' wrong, and the first tap of either option opens Go deeper", () => {
    const view = weworkView(answerCall(toBeat5(), "revenue"));
    expect(view.call?.answer).toEqual({
      optionId: "revenue",
      verdict: "wrong",
      feedback: "Recorded revenue for the half-year was $1.54bn. The $3bn is the latest month multiplied by 12.",
    });
    expect(view.goDeeper?.bars.map((b) => b.valueText)).toEqual(["$1.00", "−$0.59"]);
  });

  it("keeps the first call: a later tap does not change it", () => {
    const answered = answerCall(toBeat5(), "revenue");
    expect(answerCall(answered, "pace")).toEqual(answered);
  });

  it("resets the call on Start again", () => {
    const view = weworkView(startAgain());
    expect(view.card.number).toBe(1);
    expect(view.call).toBeNull();
    expect(view.goDeeper).toBeNull();
  });
});

describe("loss per dollar of revenue", () => {
  it("puts WeWork's six-month loss next to its revenue: 905 ÷ 1,540 is 58.8%, about 59 cents a dollar", () => {
    expect(perDollarOfRevenue(1.54, -0.905)).toEqual({ lossPerDollar: -0.59, cents: 59, lossWidthPercent: 58.8 });
  });

  it("works for other figures, a loss of $0.5bn on $2bn being 25 cents a dollar", () => {
    expect(perDollarOfRevenue(2, -0.5)).toEqual({ lossPerDollar: -0.25, cents: 25, lossWidthPercent: 25 });
  });
});
