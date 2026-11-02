import { describe, expect, it } from "vitest";
import { parseCourseMap, type QuizCheck } from "./map";
import { markAttempt, publicQuestions, selectQuestions } from "./quiz";

const question = (n: number) => `
  - id: q${n}
    prompt: Question ${n}?
    choices: [{ id: a, text: Right ${n} }, { id: b, text: Wrong ${n} }]
    answer: a
    explanation: Because ${n}.
    source: Source ${n}`;

function quizMap(pool: number, perAttempt: number | null, correct: number) {
  const ids = Array.from({ length: pool }, (_, i) => i + 1);
  const { map, errors } = parseCourseMap([
    {
      name: "t.yaml",
      text: `
id: t
title: T
stage: foundation
path: 1
cases: [{ id: c, title: C, asOf: 2018-10-24, story: S, reveal: R }]
concept: C
principle: P
questions:${ids.map(question).join("")}
checks:
  - id: quiz
    kind: quiz
    questions: [${ids.map((i) => `q${i}`).join(", ")}]
    ${perAttempt ? `perAttempt: ${perAttempt}` : ""}
    passRule: { correct: ${correct} }
`,
    },
  ]);
  if (!map) throw new Error(errors.join("\n"));
  return { map, check: map.check("quiz") as QuizCheck & { topicId: string } };
}

describe("quiz question selection", () => {
  it("shows the number of questions the pass rule or perAttempt asks for", () => {
    const { check } = quizMap(4, null, 2);
    expect(selectQuestions(check, 0)).toEqual(["q1", "q2"]);
    const wide = quizMap(4, 3, 2).check;
    expect(selectQuestions(wide, 0)).toHaveLength(3);
  });

  it("uses different questions on a retry where the pool is bigger than one attempt", () => {
    const { check } = quizMap(4, null, 2);
    expect(selectQuestions(check, 1)).toEqual(["q3", "q4"]);
    const overlapping = quizMap(4, 3, 2).check;
    const first = selectQuestions(overlapping, 0);
    const second = selectQuestions(overlapping, 1);
    expect(second).not.toEqual(first);
    expect(second.some((q) => !first.includes(q))).toBe(true);
  });

  it("reuses the same questions when there are no others", () => {
    const { check } = quizMap(2, null, 2);
    expect(selectQuestions(check, 1).sort()).toEqual(["q1", "q2"]);
  });
});

describe("quiz marking", () => {
  it("sends the browser the prompts and choices only, never the key", () => {
    const { map } = quizMap(2, null, 2);
    const shown = publicQuestions(map, ["q1", "q2"]);
    expect(shown[0]).toEqual({ id: "q1", prompt: "Question 1?", choices: [{ id: "a", text: "Right 1" }, { id: "b", text: "Wrong 1" }] });
    const text = JSON.stringify(shown);
    expect(text).not.toContain("answer");
    expect(text).not.toContain("explanation");
    expect(text).not.toContain("Because");
    expect(text).not.toContain("Source");
  });

  it("marks each answer and applies the pass rule from the Course Map", () => {
    const { map, check } = quizMap(3, 3, 2);
    const ids = ["q1", "q2", "q3"];
    const two = markAttempt(map, check, ids, { q1: "a", q2: "a", q3: "b" });
    expect(two.correctCount).toBe(2);
    expect(two.passed).toBe(true);
    const one = markAttempt(map, check, ids, { q1: "a", q2: "b", q3: "b" });
    expect(one.passed).toBe(false);
    expect(one.questions.find((q) => q.id === "q2")).toMatchObject({ correct: false, chosen: "b", answer: "a", explanation: "Because 2." });
  });

  it("counts a missing or unknown answer as wrong", () => {
    const { map, check } = quizMap(2, null, 1);
    const result = markAttempt(map, check, ["q1", "q2"], { q1: "zzz" });
    expect(result.correctCount).toBe(0);
    expect(result.questions.map((q) => q.chosen)).toEqual([null, null]);
  });
});

describe("quiz questions from the Question Bank", () => {
  const bankQuestion = {
    id: "bank:eab:MBA-FIN-CF-0002",
    prompt: "What is $2.0M worth in 5 years at 6%?",
    choices: [
      { id: "A", text: "$2,600,000" },
      { id: "B", text: "$2,676,451" },
    ],
    answer: "B",
    explanation: "FV = 2,000,000 x 1.06^5.",
    credit: "Executive Assessment Bank, CC BY 4.0",
    verified: false,
  };

  function mixed() {
    const { map, check } = quizMap(3, 3, 2);
    const lookup = { question: (id: string) => (id === bankQuestion.id ? bankQuestion : map.question(id)) };
    return { lookup, check, ids: ["q1", bankQuestion.id, "q2"] };
  }

  it("selects bank IDs from a Check's list like any other, and a retry rotates to different ones", () => {
    const { check } = quizMap(4, 2, 2);
    const withBank = { ...check, questions: ["q1", "bank:a", "bank:b", "bank:c"] };
    expect(selectQuestions(withBank, 0)).toEqual(["q1", "bank:a"]);
    expect(selectQuestions(withBank, 1)).toEqual(["bank:b", "bank:c"]);
  });

  it("keeps the key, the explanation and the credit out of what the browser receives", () => {
    const { lookup, ids } = mixed();
    const text = JSON.stringify(publicQuestions(lookup, ids));
    expect(text).toContain("What is $2.0M worth");
    for (const secret of ["2,676,451 x", "FV =", "Executive Assessment Bank", "verified", '"answer"']) expect(text).not.toContain(secret);
  });

  it("marks bank questions with the Check's pass rule and returns the credit and verified flag with the marking", () => {
    const { lookup, check, ids } = mixed();
    const result = markAttempt(lookup, check, ids, { q1: "a", [bankQuestion.id]: "B", q2: "b" });
    expect(result.passed).toBe(true);
    expect(result.questions.find((q) => q.id === bankQuestion.id)).toMatchObject({ correct: true, credit: bankQuestion.credit, verified: false });
    expect(result.questions.find((q) => q.id === "q1")).toMatchObject({ verified: true });
  });

  it("fails clearly when a question cannot be found", () => {
    const { check } = quizMap(2, null, 2);
    expect(() => publicQuestions({ question: () => undefined }, ["bank:gone"])).toThrow(/bank:gone/);
    expect(() => markAttempt({ question: () => undefined }, check, ["bank:gone"], {})).toThrow(/bank:gone/);
  });
});
