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
    const judged = judgeReply(OK, [], facts, { savedRule: "100 at 10% for 2 years is 121" });
    expect(judged.problems.map((p) => p.rule)).toContain("V5");
  });
  it("passes when no rule is saved or the rule gives nothing away", () => {
    expect(judgeReply(OK, [], facts).problems).toEqual([]);
    expect(judgeReply(OK, [], facts, { savedRule: "Interest earns interest" }).problems).toEqual([]);
  });
});

describe("the Learner's own words in the reply check", () => {
  it("are exempt from V7 (a dollar sign in a rupee Topic) and V6 (an app word), since the Tutor cannot change them", () => {
    const judged = judgeReply(OK, [], facts, { savedRule: "I think $50 grows, and the Check tab helps" });
    expect(judged.problems.filter((p) => p.rule === "V6" || p.rule === "V7")).toEqual([]);
  });
});

describe("the Widget check in the reply check", () => {
  it("fails V4 for a fence: the Tutor writes no Widget code", () => {
    const judged = judgeReply(`${OK}\n${FENCE}`, [], facts, { writtenAhead: [] });
    expect(judged.problems.find((p) => p.rule === "V4")?.message).toContain(FENCE_IN_ENGINE);
  });
  it("fails V4 for a written-ahead Widget this Topic does not have", () => {
    const judged = judgeReply(OK, [{ kind: "written", id: "nope" }], facts, { writtenAhead: [{ id: "other", code: "" }] });
    expect(judged.problems.map((p) => p.rule)).toContain("V4");
  });
});
