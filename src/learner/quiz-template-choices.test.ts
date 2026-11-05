import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap, type QuizCheck } from "@/course/map";
import { parseTemplateInstanceId, selectQuestions, templateDraws } from "@/course/quiz";
import { OWNER_LEARNER_ID, practiceAnswers, reviewCards, topicProgress } from "@/db/schema";
import { openQuizItems } from "@/tutor/turn-facts";
import { submitQuizAnswers } from "@/tutor/check-results";
import { testDb } from "@/test/pglite";
import { ensureTopicStarted, saveFinishedStep } from "./memory";
import { enrollPassedQuestions } from "./review";
import { openQuiz, pendingQuizNote, quizUnavailable, submitQuiz } from "./quiz";
import { skillStates } from "./skill-state";

/** A Topic with a template pool: one template that always draws 2% to 2.6% (60 bp), one with wide ranges, and one written choice question with a Known mistake. */
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
    mistakes: [{ tag: stopped_at_points, fix: "That is the move in points. Times 100 gives basis points." }]
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
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  // A converted Your turn ends only through fluency (ticket #243), so the test puts the Learner at the Check directly.
  await db.update(topicProgress).set({ step: "check" }).where(eq(topicProgress.learnerId, OWNER_LEARNER_ID));
  return { db, map };
}

const WIDE_FIRST = TOPIC.replace("questions: [qc]\n    templates: [sixty]", "questions: []\n    templates: [wide]").replace("perAttempt: 2\n    passRule", "perAttempt: 2\n    passRule");

const FIX = "That is the move in points. Times 100 gives basis points.";

/** The template slot of an open quiz: the question whose id is an instance id. */
const slotOf = (open: { questions: { id: string; prompt: string; choices: { id: string; text: string }[] }[] }) => open.questions.find((q) => parseTemplateInstanceId(q.id))!;
const pick = (q: { choices: { id: string; text: string }[] }, text: string) => q.choices.find((c) => c.text === text)!.id;

describe("template Check questions are served as choices", () => {
  it("a template slot is the bare template id until the attempt opens, and the pool is questions then templates", () => {
    const { map } = { map: testMap() };
    const check = map.check("quiz") as QuizCheck;
    expect(selectQuestions(check, 0)).toEqual(["qc", "sixty"]);
  });

  it("stores instance ids, serves 2 to 4 choices and no typed number, and a reload shows the same numbers and order", async () => {
    const { db, map } = await atQuiz();
    const first = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const slot = slotOf(first);
    expect(parseTemplateInstanceId(slot.id)).toMatchObject({ templateId: "sixty" });
    expect(slot.choices.map((c) => c.text).sort()).toEqual(["0.6 bp", "60 bp"]);
    expect(slot).not.toHaveProperty("kind");
    expect(slot).not.toHaveProperty("unit");
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
      const res = await submitQuiz(db, map, open.attemptId, Object.fromEntries(open.questions.map((q) => [q.id, "none"])), new Date(), OWNER_LEARNER_ID);
      expect(res).toMatchObject({ ok: true, passed: false });
    }
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("keeps the key out of the public questions", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const slot = slotOf(open);
    expect(Object.keys(slot).sort()).toEqual(["choices", "id", "prompt"]);
    expect(Object.keys(slot.choices[0]).sort()).toEqual(["id", "text"]);
    expect(JSON.stringify(open)).not.toMatch(/stopped_at_points|expected|answer"|That is the move in points/);
  });

  it("marks the 60 bp choice right, and the 0.6 bp choice as the stopped-at-points Known mistake with its fix", async () => {
    {
      const { db, map } = await atQuiz();
      const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
      const res = await submitQuiz(db, map, open.attemptId, { qc: "a", [slotOf(open).id]: pick(slotOf(open), "60 bp") }, new Date(), OWNER_LEARNER_ID);
      expect(res).toMatchObject({ ok: true, passed: true, correctCount: 2 });
    }
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const slot = slotOf(open);
    const res = await submitQuiz(db, map, open.attemptId, { qc: "a", [slot.id]: pick(slot, "0.6 bp") }, new Date(), OWNER_LEARNER_ID);
    if (!res.ok) throw new Error(res.reason);
    const marked = res.questions.find((q) => q.id === slot.id)!;
    expect(marked).toMatchObject({ kind: "choice", given: "0.6 bp", correct: false, expected: "60 bp", skill: "pts-to-bp", explanation: "The right answer is 60 bp." });
    expect(marked.mistake).toEqual({ tag: "stopped_at_points", fix: FIX });
  });

  it("shows a wrong option's fix, and records one practice answer per item with a Skill, once", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const slot = slotOf(open);
    const answers = { qc: "b", [slot.id]: pick(slot, "0.6 bp") };
    const res = await submitQuizAnswers(db, map, open.attemptId, answers, new Date(), OWNER_LEARNER_ID);
    if (!res.ok) throw new Error(res.reason);
    expect(res.questions.find((q) => q.id === "qc")!.mistake).toEqual({ tag: "flat_fee", fix: "A rate scales with the amount; a fee does not." });
    // A repeat submission records nothing more.
    await submitQuizAnswers(db, map, open.attemptId, answers, new Date(), OWNER_LEARNER_ID);
    const rows = await db.select().from(practiceAnswers).where(eq(practiceAnswers.learnerId, OWNER_LEARNER_ID));
    expect(rows.map((r) => r.itemKey).sort()).toEqual([`quiz:${open.attemptId}:qc`, `quiz:${open.attemptId}:${slot.id}`].sort());
    const drawn = rows.find((r) => r.itemId === slot.id)!;
    expect(drawn).toMatchObject({ source: "quiz", skillId: "pts-to-bp", verdict: "known_mistake", mistakeTag: "stopped_at_points", templateId: "sixty", input: "0.6 bp" });
    expect(drawn.params).toMatchObject({ a: "2" });
    expect(rows.find((r) => r.itemId === "qc")).toMatchObject({ skillId: "rate-words", verdict: "known_mistake", mistakeTag: "flat_fee" });
    expect((await skillStates(db, OWNER_LEARNER_ID, "t"))["pts-to-bp"].tries).toBe(1);
  });

  it("tells the Tutor each missed question's Skill rule (never its id) and the matched fix", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const slot = slotOf(open);
    await submitQuizAnswers(db, map, open.attemptId, { qc: "b", [slot.id]: pick(slot, "0.6 bp") }, new Date(), OWNER_LEARNER_ID);
    const note = (await pendingQuizNote(db, map, OWNER_LEARNER_ID, "t"))!.text;
    expect(note).toContain('The Learner chose "0.6 bp"; the right answer is "60 bp"');
    expect(note).toContain("The Skill it tests: One point is 100 basis points");
    expect(note).toContain(`the fix: ${FIX}`);
    expect(note).toContain("the fix: A rate scales with the amount; a fee does not.");
    expect(note).not.toContain("pts-to-bp");
    expect(note).not.toContain("rate-words");
  });

  it("never enrols a template slot for Review", async () => {
    const { db, map } = await atQuiz();
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const slot = slotOf(open);
    const res = await submitQuiz(db, map, open.attemptId, { qc: "a", [slot.id]: pick(slot, "60 bp") }, new Date(), OWNER_LEARNER_ID);
    expect(res).toMatchObject({ ok: true, passed: true });
    await enrollPassedQuestions(db, map, OWNER_LEARNER_ID);
    expect((await db.select().from(reviewCards)).map((c) => c.questionId)).toEqual(["qc"]);
  });

  it("blocks an open slot's numbers and answer through the one openQuizItems", async () => {
    const { db, map } = await atQuiz();
    await openQuiz(db, map, new Date(), OWNER_LEARNER_ID);
    const items = await openQuizItems(db, map, OWNER_LEARNER_ID, map.check("quiz") as QuizCheck);
    const slot = items.find((i) => i.prompt.includes("basis points"))!;
    expect(slot.prompt).toContain("2% to 2.6%");
    expect(slot.answer).toBe("60 bp");
    expect(slot.choices.slice().sort()).toEqual(["0.6 bp", "60 bp"]);
    // The next attempt's template slot is a bare id: it is not resolved, so nothing of it is blocked yet.
    expect(items.every((i) => !/\{|sixty/.test(i.prompt))).toBe(true);
  });

  it("counts templates as always available, and treats a removed template as a removed question", async () => {
    const { db, map } = await atQuiz(WIDE_FIRST);
    expect(await quizUnavailable(db, map, map.check("quiz") as QuizCheck)).toBe(false);
    const open = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    expect(open.questions).toHaveLength(2);
  });

  it("leaves a template with no Known mistake out: it makes one choice, so code never shows it", async () => {
    const noMistakes = TOPIC.replace(/(id: wide[\s\S]*?sign: magnitude\n    mistakes: )\[[^\n]*\]/, "$1[]");
    const { map } = await atQuiz(noMistakes);
    expect(templateDraws(map, "wide")).toBe(false);
    expect(templateDraws(map, "sixty")).toBe(true);
  });
});
