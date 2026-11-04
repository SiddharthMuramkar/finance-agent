import { describe, expect, it } from "vitest";
import { blockedNumbersFrom, capFor, countWords, splitAsk, type OpenItem, type StepKind } from "./reply-checks";

/** Percent's Check 1 questions, as an open attempt holds them. */
const BP_DEFINITION: OpenItem = {
  prompt: "How many basis points are there in 0.6 of a percentage point?",
  choices: ["6", "60", "600", "0.6"],
  answer: "60",
};
const WRONG_DESCRIPTION: OpenItem = {
  prompt: "A central bank moves its rate from 4.00% to 4.50%. Which description of this move is wrong?",
  choices: ["The rate is up 50 basis points", "The rate is up half of a percentage point", "The rate is up 50 percent", "The rate is up 12.5 percent of its old level"],
  answer: "The rate is up 50 percent",
};
const BOND_120: OpenItem = {
  prompt: "A bond yield rises by 120 basis points. How many percentage points is that?",
  choices: ["12 percentage points", "1.2 percentage points", "0.12 percentage points", "120 percentage points"],
  answer: "1.2 percentage points",
};
const CHECK_1 = [BP_DEFINITION, WRONG_DESCRIPTION, BOND_120];

describe("countWords", () => {
  it("counts the words a Learner reads", () => {
    expect(countWords("A savings rate goes from 4% to 5%.")).toBe(8);
  });

  it("ignores Widget fences, Citation markers and Markdown symbols", () => {
    const text = [
      "## Points",
      "The Fed moved by **25 bp**.[1](/passages/12?blocks=0-2)",
      "",
      "```openui-lang",
      'root = Widget("One rate change", [old, new])',
      "```",
      "- 5 − 4 = 1",
    ].join("\n");
    // Points, The, Fed, moved, by, 25, bp, 5, 4, 1
    expect(countWords(text)).toBe(10);
  });
});

describe("capFor", () => {
  it("is 80 words at Concept, Your turn and Check", () => {
    for (const step of ["concept", "your_turn", "check"] as StepKind[]) expect(capFor(step)).toBe(80);
  });

  it("is 120 words at Story, Explore, Reveal and Principle, and with no step", () => {
    for (const step of ["story", "explore", "reveal", "principle", "none"] as StepKind[]) expect(capFor(step)).toBe(120);
  });

  it("rises to 120 for a worked example and a Go deeper reply at any step", () => {
    expect(capFor("concept", "worked_example")).toBe(120);
    expect(capFor("check", "go_deeper")).toBe(120);
    expect(capFor("your_turn", "worked_example")).toBe(120);
  });

  it("keeps the step's cap for every other Reply kind", () => {
    for (const kind of ["feedback", "rule", "quick_try", "reteach", "hint", "answer_question", "offer_park", "simpler"] as const) {
      expect(capFor("concept", kind)).toBe(80);
      expect(capFor("story", kind)).toBe(120);
    }
  });
});

describe("splitAsk", () => {
  it("takes a last line that asks a question as the ask", () => {
    expect(splitAsk("Points are the new rate minus the old rate.\n\nA rate goes from 3% to 3.5%: how many points did it move?")).toEqual({
      message: "Points are the new rate minus the old rate.",
      ask: "A rate goes from 3% to 3.5%: how many points did it move?",
    });
  });

  it("takes a last line that tells the Learner what to do as the ask", () => {
    expect(splitAsk("That is the whole rule.\nPress Next when you are ready.").ask).toBe("Press Next when you are ready.");
  });

  it("has no ask when the last line only tells", () => {
    expect(splitAsk("Points are the new rate minus the old rate.\nThat is all there is to it.")).toEqual({
      message: "Points are the new rate minus the old rate.\nThat is all there is to it.",
      ask: null,
    });
  });

  it("keeps only the last sentence of a long last line as the ask", () => {
    expect(splitAsk("Good. A rate goes from 3% to 3.5%. How many points did it move?")).toEqual({
      message: "Good. A rate goes from 3% to 3.5%.",
      ask: "How many points did it move?",
    });
  });

  it("looks past a Widget fence and Citation markers to the last line", () => {
    const { ask } = splitAsk('Rates moved.[1](/passages/3?blocks=0-1)\nWhich number is the move in basis points?\n```openui-lang\nroot = Widget("x", [])\n```');
    expect(ask).toBe("Which number is the move in basis points?");
  });
});

describe("blockedNumbersFrom", () => {
  it("is every number in the open questions and their choices", () => {
    expect(new Set(blockedNumbersFrom(CHECK_1))).toEqual(new Set(["0.6", "6", "60", "600", "4", "4.5", "50", "12.5", "120", "12", "1.2", "0.12"]));
  });

  it("normalises 4.5, 4.50 and 4.50% to one number", () => {
    expect(blockedNumbersFrom([{ prompt: "From 4.50% to 4.5 and then 4.50", choices: [] }])).toEqual(["4.5"]);
  });

  it("reads rupee amounts, Indian commas and falls", () => {
    expect(new Set(blockedNumbersFrom([{ prompt: "A fee of ₹1,00,000 falls by −30 bp", choices: ["$2.50"] }]))).toEqual(new Set(["100000", "30", "2.5"]));
  });

  it("is empty when no quiz is open", () => {
    expect(blockedNumbersFrom([])).toEqual([]);
  });
});
