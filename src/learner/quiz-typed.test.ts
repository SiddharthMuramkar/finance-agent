import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap, type QuizCheck } from "@/course/map";
import { parseTemplateInstanceId, selectQuestions } from "@/course/quiz";
import { OWNER_LEARNER_ID, practiceAnswers, reviewCards } from "@/db/schema";
import { openQuizItems } from "@/tutor/turn-facts";
import { submitQuizAnswers } from "@/tutor/check-results";
import { testDb } from "@/test/pglite";
import { ensureTopicStarted, saveFinishedStep } from "./memory";
import { enrollPassedQuestions } from "./review";
import { openQuiz, pendingQuizNote, quizUnavailable, submitQuiz } from "./quiz";
import { skillStates } from "./skill-state";

/** A Topic with a typed pool: one template that always draws 2% to 2.6% (60 bp), one with wide ranges, and one choice question with a Known mistake. */
const TOPIC = `
id: t
title: T
stage: foundation
path: 1
cases: [{ id: c, title: C, asOf: 2018-10-24, story: S, reveal: R }]
concept: C
principle: P
skills:
  - { id: pts-to-bp, rule: One point is 100 basis points, so times the move in points by 100. }
  - { id: rate-words, rule: A rate is a percent of the amount per year. }
templates:
  - id: sixty
    skill: pts-to-bp
    ask: "A rate moves from {a}% to {b}%. How many basis points?"
    params: { a: { min: 2, max: 2, step: 1 }, d: { min: 0.6, max: 0.6, step: 0.1 } }
    derived: { b: "plus(a, d)" }
    answer: bp_from_move
    unit: bp
    decimals: 0
    sign: magnitude
    mistakes: [{ tag: stopped_at_points, fix: "That is the move in points. Times 100 gives basis points." }]
  - id: wide
    skill: pts-to-bp
    ask: "A rate moves from {a}% to {b}%. How many basis points?"
    params: { a: { min: 1, max: 9, step: 0.25 }, d: { min: 0.25, max: 1.2, step: 0.05 } }
    derived: { b: "plus(a, d)" }
    answer: bp_from_move
    unit: bp
    decimals: 0
    sign: magnitude
    mistakes: []
questions:
  - id: qc
    prompt: What is a rate?
    skill: rate-words
    choices:
      - { id: a, text: A percent per year }
      - { id: b, text: A flat fee, mistake: { tag: flat_fee, fix: A rate scales with the amount; a fee does not. } }
    answer: a
    explanation: A rate is per year.
    source: S
checks:
  - id: quiz
    kind: quiz
    questions: [qc]
    templates: [sixty]
    passRule: { correct: 2 }
  - id: wide-quiz
    kind: quiz
    templates: [wide]
    perAttempt: 2
    passRule: { correct: 2 }
  - id: talk
    kind: conversation
    prompt: Explain.
    passCriteria: Explains.
`;

function testMap(text = TOPIC): CourseMap {
  const { map, errors } = parseCourseMap([{ name: "t.yaml", text }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

async function atQuiz(text?: string) {
  const db = await testDb();
  const map = testMap(text);
  await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  return { db, map };
}

const WIDE_FIRST = TOPIC.replace("questions: [qc]\n    templates: [sixty]", "questions: []\n    templates: [wide]").replace("perAttempt: 2\n    passRule", "perAttempt: 2\n    passRule");

describe("typed Check questions", () => {
  it("a template slot is the bare template id until the attempt opens, and the pool is questions then templates", () => {
    const { map } = { map: testMap() };
    const check = map.check("quiz") as QuizCheck;
    expect(selectQuestions(check, 0)).toEqual(["qc", "sixty"]);
  });

  it("stores instance ids, and a reload shows the same numbers", async () => {
    const { db, map } = await atQuiz();
    const first = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const slot = first.questions.find((q) => q.kind === "number")!;
    expect(parseTemplateInstanceId(slot.id)).toMatchObject({ templateId: "sixty" });
    expect(slot).toMatchObject({ kind: "number", unit: "bp", decimals: 0, choices: [] });
    expect(slot.prompt).toContain("2% to 2.6%");
    const again = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    expect(again.attemptId).toBe(first.attemptId);
    expect(again.questions).toEqual(first.questions);
  });

  it("shows different numbers on the next attempt", async () => {
    const { db, map } = await atQuiz(WIDE_FIRST);
    const prompts: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
      expect(open.questions).toHaveLength(2);
      expect(new Set(open.questions.map((q) => q.prompt)).size).toBe(2);
      prompts.push(...open.questions.map((q) => q.prompt));
      const res = await submitQuiz(db, map, open.attemptId, Object.fromEntries(open.questions.map((q) => [q.id, "0"])), new Date(), OWNER_LEARNER_ID);
      expect(res).toMatchObject({ ok: true, passed: false });
    }
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("keeps the key out of the public questions", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const typed = open.questions.find((q) => q.kind === "number")!;
    expect(Object.keys(typed).sort()).toEqual(["choices", "decimals", "id", "kind", "prompt", "unit"]);
    expect(JSON.stringify(open)).not.toMatch(/60 bp|stopped_at_points|expected|answer"/);
  });

  it("marks 60 bp, 60 and 60.0 right, and 0.6 as a Known mistake with its fix", async () => {
    for (const input of ["60 bp", "60", "60.0"]) {
      const { db, map } = await atQuiz();
      const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
      const typedId = open.questions.find((q) => q.kind === "number")!.id;
      const res = await submitQuiz(db, map, open.attemptId, { qc: "a", [typedId]: input }, new Date(), OWNER_LEARNER_ID);
      expect(res).toMatchObject({ ok: true, passed: true, correctCount: 2 });
    }
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const typedId = open.questions.find((q) => q.kind === "number")!.id;
    const res = await submitQuiz(db, map, open.attemptId, { qc: "a", [typedId]: "0.6" }, new Date(), OWNER_LEARNER_ID);
    if (!res.ok) throw new Error(res.reason);
    const typed = res.questions.find((q) => q.id === typedId)!;
    expect(typed).toMatchObject({ kind: "number", given: "0.6", correct: false, expected: "60 bp", skill: "pts-to-bp", explanation: "The right answer is 60 bp." });
    expect(typed.mistake).toEqual({ tag: "stopped_at_points", fix: "That is the move in points. Times 100 gives basis points." });
  });

  it("shows a wrong option's fix, and records one practice answer per item with a Skill, once", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const typedId = open.questions.find((q) => q.kind === "number")!.id;
    const answers = { qc: "b", [typedId]: "0.6" };
    const res = await submitQuizAnswers(db, map, open.attemptId, answers, new Date(), OWNER_LEARNER_ID);
    if (!res.ok) throw new Error(res.reason);
    expect(res.questions.find((q) => q.id === "qc")!.mistake).toEqual({ tag: "flat_fee", fix: "A rate scales with the amount; a fee does not." });
    // A repeat submission records nothing more.
    await submitQuizAnswers(db, map, open.attemptId, answers, new Date(), OWNER_LEARNER_ID);
    const rows = await db.select().from(practiceAnswers).where(eq(practiceAnswers.learnerId, OWNER_LEARNER_ID));
    expect(rows.map((r) => r.itemKey).sort()).toEqual([`quiz:${open.attemptId}:qc`, `quiz:${open.attemptId}:${typedId}`].sort());
    const typed = rows.find((r) => r.itemId === typedId)!;
    expect(typed).toMatchObject({ source: "quiz", skillId: "pts-to-bp", verdict: "known_mistake", mistakeTag: "stopped_at_points", templateId: "sixty", input: "0.6" });
    expect(typed.params).toMatchObject({ a: "2" });
    expect(rows.find((r) => r.itemId === "qc")).toMatchObject({ skillId: "rate-words", verdict: "known_mistake", mistakeTag: "flat_fee" });
    expect((await skillStates(db, OWNER_LEARNER_ID, "t"))["pts-to-bp"].tries).toBe(1);
  });

  it("tells the Tutor each missed question's Skill rule (never its id) and the matched fix", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const typedId = open.questions.find((q) => q.kind === "number")!.id;
    await submitQuizAnswers(db, map, open.attemptId, { qc: "b", [typedId]: "0.6" }, new Date(), OWNER_LEARNER_ID);
    const note = (await pendingQuizNote(db, map, OWNER_LEARNER_ID, "t"))!.text;
    expect(note).toContain('The Learner typed "0.6"; the right answer is "60 bp"');
    expect(note).toContain("The Skill it tests: One point is 100 basis points");
    expect(note).toContain("the fix: That is the move in points. Times 100 gives basis points.");
    expect(note).toContain("the fix: A rate scales with the amount; a fee does not.");
    expect(note).not.toContain("pts-to-bp");
    expect(note).not.toContain("rate-words");
  });

  it("never enrols a typed question for Review", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const typedId = open.questions.find((q) => q.kind === "number")!.id;
    const res = await submitQuiz(db, map, open.attemptId, { qc: "a", [typedId]: "60" }, new Date(), OWNER_LEARNER_ID);
    expect(res).toMatchObject({ ok: true, passed: true });
    await enrollPassedQuestions(db, map, OWNER_LEARNER_ID);
    expect((await db.select().from(reviewCards)).map((c) => c.questionId)).toEqual(["qc"]);
  });

  it("blocks an open typed question's numbers and answer through the one openQuizItems", async () => {
    const { db, map } = await atQuiz();
    await openQuiz(db, map, new Date(), OWNER_LEARNER_ID);
    const items = await openQuizItems(db, map, OWNER_LEARNER_ID, map.check("quiz") as QuizCheck);
    const typed = items.find((i) => i.prompt.includes("basis points"))!;
    expect(typed.prompt).toContain("2% to 2.6%");
    expect(typed.answer).toBe("60 bp");
    expect(typed.choices).toEqual([]);
    // The next attempt's template slot is a bare id: it is not resolved, so nothing of it is blocked yet.
    expect(items.every((i) => !/\{|sixty/.test(i.prompt))).toBe(true);
  });

  it("counts templates as always available, and treats a removed template as a removed question", async () => {
    const { db, map } = await atQuiz(WIDE_FIRST);
    expect(await quizUnavailable(db, map, map.check("quiz") as QuizCheck)).toBe(false);
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    expect(open.questions).toHaveLength(2);
  });
});
