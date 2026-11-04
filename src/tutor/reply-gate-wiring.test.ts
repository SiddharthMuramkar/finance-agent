import { describe, expect, it } from "vitest";
import { FENCE_IN_ENGINE, judgeReply } from "./reply-gate";
import type { TurnFacts } from "./turn-facts";

/** The reply gate holds the Learner's saved rule and a Widget to the checks (ticket #248, from T14 and T15). */

const facts: TurnFacts = {
  step: "check",
  cap: 80,
  exampleCurrency: "INR",
  caseCurrencies: [],
  quizOpen: true,
  openItems: [{ prompt: "What is 100 at 10% for 2 years?", choices: ["110", "121"], answer: "121" }],
  blockedNumbers: ["100", "10", "2", "110", "121"],
  internalWords: [],
};
const OK = "Interest earns interest too, which is why waiting helps.\nWhat do you think grows faster?";
const FENCE = "```openui-lang\nroot = Stack([])\n```";

describe("the saved rule in the reply check", () => {
  it("fails V5 when the rule the Learner saved gives away an open answer", () => {
    const judged = judgeReply(OK, [], facts, { engine: true, savedRule: "100 at 10% for 2 years is 121" });
    expect(judged.problems.map((p) => p.rule)).toContain("V5");
  });
  it("passes when no rule is saved or the rule gives nothing away", () => {
    expect(judgeReply(OK, [], facts, { engine: true }).problems).toEqual([]);
    expect(judgeReply(OK, [], facts, { engine: true, savedRule: "Interest earns interest" }).problems).toEqual([]);
  });
});

describe("the Widget check in the reply check", () => {
  it("fails V4 for a fence in an engine Session", () => {
    const judged = judgeReply(`${OK}\n${FENCE}`, [], facts, { engine: true, writtenAhead: [] });
    expect(judged.problems.find((p) => p.rule === "V4")?.message).toContain(FENCE_IN_ENGINE);
  });
  it("lets an old Session's fence pass when the engine is off", () => {
    const judged = judgeReply(`${OK}\n${FENCE}`, [], facts, { engine: false, writtenAhead: [] });
    expect(judged.problems.filter((p) => p.rule === "V4")).toEqual([]);
  });
  it("fails V4 for a written-ahead Widget this Topic does not have", () => {
    const judged = judgeReply(OK, [{ kind: "written", id: "nope" }], facts, { engine: true, writtenAhead: [{ id: "other", code: "" }] });
    expect(judged.problems.map((p) => p.rule)).toContain("V4");
  });
});
