import { describe, expect, it } from "vitest";
import { markAnswer, markChoice, type FixedItem } from ".";

/** Quick try A3 of the Percent Topic: a fall, so 30 and -30 are both right. */
const fallOf30: FixedItem = {
  id: "A3",
  skill: "pts_to_bp",
  ask: "A rate falls from 7.5% to 7.2%. How many basis points?",
  kind: "number",
  answer: -30,
  unit: "bp",
  sign: "either",
  mistakes: [
    { answer: -0.3, tag: "stopped_at_points", fix: "That is the move in points. Times 100 gives basis points." },
    { answer: -3, tag: "used_x10", fix: "A point is 100 basis points, not 10." },
  ],
};

describe("marking a fixed Quick try", () => {
  it("marks 30, 30bp, 30 bp and -30 right for a fall of 30 basis points", () => {
    for (const input of ["30", "30bp", "30 bp", "-30", "a fall of 30 bp"]) {
      expect(markAnswer(fallOf30, input), input).toEqual({ verdict: "right", expected: "30 bp (a fall)" });
    }
  });

  it("gives 0.3 for that item the stopped-at-points Known mistake and its fix", () => {
    expect(markAnswer(fallOf30, "0.3")).toEqual({
      verdict: "known_mistake",
      tag: "stopped_at_points",
      fix: "That is the move in points. Times 100 gives basis points.",
      expected: "30 bp (a fall)",
    });
    expect(markAnswer(fallOf30, "-0.3 points").verdict).toBe("known_mistake");
  });

  it("marks a wrong answer that matches no Known mistake as wrong, and so is anything unreadable", () => {
    expect(markAnswer(fallOf30, "40")).toEqual({ verdict: "wrong", expected: "30 bp (a fall)" });
    expect(markAnswer(fallOf30, "30.4").verdict).toBe("wrong");
    expect(markAnswer(fallOf30, "0.34").verdict).toBe("wrong");
    expect(markAnswer(fallOf30, "no idea")).toEqual({ verdict: "wrong", expected: "30 bp (a fall)" });
  });

  it("holds the sign for a rise under either, and for any answer under signed", () => {
    const rise: FixedItem = { id: "A2", skill: "pts_to_bp", ask: "3% to 3.5%. How many basis points?", kind: "number", answer: 50, unit: "bp", sign: "either" };
    expect(markAnswer(rise, "50").verdict).toBe("right");
    expect(markAnswer(rise, "-50").verdict).toBe("wrong");
    const signed: FixedItem = { ...fallOf30, sign: "signed", mistakes: [] };
    expect(markAnswer(signed, "-30").verdict).toBe("right");
    expect(markAnswer(signed, "fell 30").verdict).toBe("right");
    expect(markAnswer(signed, "30")).toEqual({ verdict: "wrong", expected: "-30 bp" });
    const size: FixedItem = { ...rise, sign: "magnitude" };
    expect(markAnswer(size, "-50").verdict).toBe("right");
  });

  it("defaults to the answer's own decimals and the either rule", () => {
    const toPoints: FixedItem = { id: "A4", skill: "bp_to_pts", ask: "120 bp is how many points?", kind: "number", answer: 1.2, unit: "points" };
    expect(markAnswer(toPoints, "1.2")).toEqual({ verdict: "right", expected: "1.2 points" });
    expect(markAnswer(toPoints, "1.20 points").verdict).toBe("right");
    expect(markAnswer(toPoints, "1.24").verdict).toBe("wrong");
    expect(markAnswer(toPoints, "-1.2").verdict).toBe("wrong");
  });

  it("rounds a longer typed answer to the decimals the ask states", () => {
    const pct: FixedItem = { id: "B9", skill: "pct_change", ask: "3% to 3.25%. Percent change, to two decimal places?", kind: "number", answer: 8.33, unit: "percent", decimals: 2 };
    expect(markAnswer(pct, "8.33%").verdict).toBe("right");
    expect(markAnswer(pct, "8.333").verdict).toBe("right");
    expect(markAnswer(pct, "8.3").verdict).toBe("wrong");
  });

  it("names a fixed Known mistake without a tag by its item and place", () => {
    const item: FixedItem = { id: "A1", skill: "pts", ask: "3% to 3.5%. How many points?", kind: "number", answer: 0.5, unit: "points", mistakes: [{ answer: 50, fix: "That is basis points. Divide by 100 for points." }] };
    expect(markAnswer(item, "50 bp")).toEqual({ verdict: "known_mistake", tag: "A1#0", fix: "That is basis points. Divide by 100 for points.", expected: "0.5 points" });
  });
});

describe("marking a True or False Quick try", () => {
  const b4: FixedItem = {
    id: "B4",
    skill: "wording",
    ask: '4% to 6%. "Rates up 200%." True or false?',
    kind: "truth",
    answer: false,
    mistakes: [{ answer: true, tag: "mixed_percent_points", fix: "The move is 2 points, which is 50% of 4." }],
  };

  it("reads true, false, yes, no, t and f", () => {
    for (const input of ["false", "False", "F", "no", " NO "]) expect(markAnswer(b4, input).verdict, input).toBe("right");
    expect(markAnswer(b4, "True")).toEqual({ verdict: "known_mistake", tag: "mixed_percent_points", fix: "The move is 2 points, which is 50% of 4.", expected: "False" });
    expect(markAnswer(b4, "maybe")).toEqual({ verdict: "wrong", expected: "False" });
  });
});

describe("marking a tapped choice", () => {
  const a2: FixedItem = {
    id: "pb-try-a2",
    skill: "pts-to-bp",
    ask: "Same move, 3% to 3.5%. How many basis points did it move?",
    kind: "number",
    answer: 50,
    unit: "bp",
    mistakes: [{ answer: 5, fix: "One point is 100 basis points, so multiply by 100, not 10.", tag: "used_x10" }],
  };
  const noFix: FixedItem = { ...a2, mistakes: [{ answer: 5, fix: "f", tag: "used_x10" }, { answer: 7, fix: "g" }] };

  it("marks the right id right", () => {
    expect(markChoice(a2, "50")).toEqual({ verdict: "right", expected: "50 bp" });
  });

  it("marks a wrong id with a mistake as that Known mistake, and one with none as wrong", () => {
    expect(markChoice(a2, "5")).toEqual({ verdict: "known_mistake", tag: "used_x10", fix: "One point is 100 basis points, so multiply by 100, not 10.", expected: "50 bp" });
    expect(markChoice({ ...a2, mistakes: [] }, "5")).toEqual({ verdict: "wrong", expected: "50 bp" });
    expect(markChoice(noFix, "7")).toMatchObject({ verdict: "known_mistake", tag: "pb-try-a2#1" });
  });

  it("marks an unknown id wrong", () => {
    expect(markChoice(a2, "99")).toEqual({ verdict: "wrong", expected: "50 bp" });
    expect(markChoice(a2, "")).toEqual({ verdict: "wrong", expected: "50 bp" });
  });

  it("marks True and False items and written choices by id", () => {
    const truth: FixedItem = { id: "t", skill: "s", ask: "q", kind: "truth", answer: true, mistakes: [{ answer: false, fix: "A point is 100 bp.", tag: "pt" }] };
    expect(markChoice(truth, "true").verdict).toBe("right");
    expect(markChoice(truth, "false")).toMatchObject({ verdict: "known_mistake", tag: "pt" });
  });
});
