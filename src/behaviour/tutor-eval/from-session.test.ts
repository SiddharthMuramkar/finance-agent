import { describe, expect, it } from "vitest";
import { CODE_WRITTEN_PREFIXES } from "@/tutor/turn-status";
import { parseCase } from "./case";
import { caseFromSession, type SessionRows } from "./from-session";

const at = (min: number) => new Date(Date.UTC(2026, 10, 3, 10, min)).toISOString();

/** A Session at the open Check 1 quiz: the opener, one message turn, the quiz opened, then the Learner's message. */
const rows: SessionRows = {
  topicId: "num-percent-bps",
  checkIds: ["pb-quiz-language", "pb-fed-language"],
  turn: { turnSeq: 6, input: "can you show me nice widget to explain this", startedAt: at(30) },
  turns: [
    { turnSeq: 0, input: `${CODE_WRITTEN_PREFIXES[0]} the Learner opened the Topic.` },
    { turnSeq: 2, input: "what is a basis point" },
  ],
  messages: [
    { seq: 0, role: "user", content: "note" },
    { seq: 1, role: "assistant", content: [{ type: "text", text: "Welcome." }] },
    { seq: 2, role: "user", content: "what is a basis point" },
    { seq: 3, role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "A basis point is " }] },
    { seq: 4, role: "user", content: [{ type: "tool_result" }] },
    { seq: 5, role: "assistant", content: [{ type: "text", text: "one hundredth of a point." }] },
  ],
  items: [
    { afterSeq: -1, kind: "step", data: { step: "story", number: 1 } },
    { afterSeq: 5, kind: "step", data: { step: "check", number: 4 } },
  ],
  quizAttempts: [{ checkId: "pb-quiz-language", questionIds: ["pb-q-bp-definition", "pb-q-bond-140", "pb-q-newspaper"], createdAt: at(20), submittedAt: null, correctCount: null, passed: null }],
  practice: [],
  skillMethods: [],
};

describe("a case from a stored Session turn", () => {
  it("takes the Learner's message and their state then: the step, the Check, the open quiz and the message turns before it", () => {
    const c = caseFromSession(rows, { id: "T12" });
    expect(c).toMatchObject({
      id: "T12",
      kind: "live",
      topic: "num-percent-bps",
      message: "can you show me nice widget to explain this",
      state: { step: "check", check: 1, quiz: { state: "open", questions: ["pb-q-bp-definition", "pb-q-bond-140", "pb-q-newspaper"] } },
    });
    // The opener is code's note, not the Learner's: it is left out; a turn's reply joins its loop steps.
    expect(c.state.history).toEqual([{ learner: "what is a basis point", tutor: "A basis point is one hundredth of a point." }]);
  });

  it("writes a valid case file that the suite reads", () => {
    const c = caseFromSession(rows, { id: "T12" });
    expect(parseCase(JSON.stringify(c), "T12.json").errors).toEqual([]);
  });

  it("reads a quiz submitted and missed before the turn, the next Check after a pass, and the Skill answers before it", () => {
    const missed = caseFromSession(
      { ...rows, quizAttempts: [{ ...rows.quizAttempts[0], submittedAt: at(25), correctCount: 0, passed: false }] },
      { id: "T13" },
    );
    expect(missed.state.quiz).toEqual({ state: "missed", questions: rows.quizAttempts[0].questionIds, correct: 0 });

    const later = caseFromSession(
      {
        ...rows,
        items: [...rows.items, { afterSeq: 5, kind: "check_result", data: { check: 1, passed: true } }, { afterSeq: 5, kind: "step", data: { step: "your_turn", number: 6 } }],
        practice: [
          { skillId: "pct_change", verdict: "known_mistake", createdAt: at(21) },
          { skillId: "pct_change", verdict: "right", createdAt: at(22) },
          { skillId: "pct_change", verdict: "wrong", createdAt: at(40) },
        ],
        skillMethods: [{ skillId: "pct_change", methodsUsed: ["restate", "not-a-method"] }],
      },
      { id: "T14" },
    );
    expect(later.state).toMatchObject({ step: "your_turn", check: 2, skills: [{ skill: "pct_change", answers: ["wrong", "right"], methodsUsed: ["restate"] }] });
    expect(later.state.quiz).toBeUndefined();
  });
});
