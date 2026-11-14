import { describe, expect, it } from "vitest";
import { nextMove, nextNamedIn, saysGoOn, turnBody } from "./learner-moves";

// How the owner's test tools drive the app as a Learner now does: choosing a Topic (the page starts the opener),
// Next, Finish this reply, or a typed message. None of them ever sends Continue.

const base = { first: false, cutShort: false, afterQuiz: false, tutorText: "What would you take, and why?", step: "story" };

describe("the simulated Learner's next move", () => {
  it("starts by choosing the Topic, whose page starts the opener", () => {
    expect(nextMove({ ...base, first: true, tutorText: "" })).toEqual({ kind: "opener" });
    expect(turnBody({ kind: "opener" })).toEqual({ opener: true });
  });

  it("presses Finish this reply under a reply cut off at its length limit", () => {
    expect(nextMove({ ...base, cutShort: true })).toEqual({ kind: "finish" });
    expect(turnBody({ kind: "finish" })).toEqual({ finish: true });
  });

  it("presses Next after a quiz, and when the Tutor said nothing, naming the step it stands on first", () => {
    expect(nextMove({ ...base, afterQuiz: true, step: "reveal" })).toEqual({ kind: "next", step: "reveal" });
    expect(nextMove({ ...base, tutorText: "", step: "concept" })).toEqual({ kind: "next", step: "concept" });
    expect(turnBody({ kind: "next", step: "concept" })).toEqual({ next: "concept" });
  });

  it("otherwise types a reply, and a plain 'Okay, go on.' is pressing Next", () => {
    expect(nextMove(base)).toEqual({ kind: "message" });
    expect(turnBody({ kind: "message" }, "I'd take the cash.")).toEqual({ message: "I'd take the cash." });
    expect(saysGoOn("Okay, go on.")).toBe(true);
    expect(saysGoOn("ok go on")).toBe(true);
    expect(saysGoOn("Okay, go on: but why 5%?")).toBe(false);
  });

  it("never sends Continue", () => {
    const moves = [nextMove({ ...base, first: true }), nextMove({ ...base, cutShort: true }), nextMove({ ...base, afterQuiz: true }), nextMove(base)];
    for (const move of moves) expect(JSON.stringify(turnBody(move, "Hi"))).not.toMatch(/continue/i);
  });
});

describe("a refused Next", () => {
  it("names the step the chip offers, so the Learner presses that one", () => {
    expect(nextNamedIn('Next names "concept", not "story".')).toBe("concept");
    expect(nextNamedIn('Next names "complete", not "principle".')).toBe("complete");
  });

  it("names nothing when no Next is on offer (a Check is open, or Explore is unsettled)", () => {
    expect(nextNamedIn("A Check is open: only a saved pass moves past it.")).toBeNull();
    expect(nextNamedIn("Explore is not settled: the Learner has not found the Insight or been told it.")).toBeNull();
  });
});
