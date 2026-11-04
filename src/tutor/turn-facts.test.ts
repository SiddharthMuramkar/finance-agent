import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { QuizCheck } from "@/course/map";
import { navigate } from "@/course/navigator";
import { ensureTopicStarted, loadProgress, saveFinishedStep } from "@/learner/memory";
import { checkTabNow, type OpenQuiz } from "@/learner/quiz";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { submitQuizAnswers } from "./check-results";
import { GO_DEEPER } from "./chips";
import { openQuizItems, replyCheckContext, replyKindOf, turnFacts } from "./turn-facts";

/**
 * The facts code works out once per Tutor Turn (spec #229, ticket #238): the step and its word limit, the Topic's
 * currencies, and, at an open quiz Check, the open attempt's and the next attempt's questions with their blocked numbers.
 */

/** Present value without its Insight: Check 1 is a quiz of six questions, three per attempt. */
const map = presentValueOnly({ withoutInsight: true });
const check = map.check("pv-quiz-discounting") as QuizCheck;
const prompt = (id: string) => map.question(id)!.prompt.trim();

const placeOf = async (db: Db) => navigate(map, await loadProgress(db, OWNER_LEARNER_ID));

async function toQuiz(db: Db): Promise<OpenQuiz> {
  await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  return (await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).quiz!;
}

describe("turn facts", () => {
  it("with no quiz open: no open items, no blocked numbers, the step's word limit and the rupee default", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
    await saveFinishedStep(db, map, "story", new Date(), OWNER_LEARNER_ID);
    const facts = await turnFacts(db, map, OWNER_LEARNER_ID, await placeOf(db));
    expect(facts).toMatchObject({ step: "concept", cap: 80, quizOpen: false, openItems: [], blockedNumbers: [], exampleCurrency: "INR" });
    // The Case's story gives its jackpot in dollars.
    expect(facts.caseCurrencies).toEqual(["USD"]);
    expect(facts.internalWords).toEqual(expect.arrayContaining(["present-value", "pv-quiz-discounting", "pv-q-one-year"]));
  });

  it("while a quiz attempt is open: its questions and the next attempt's, each with its choices and the right choice's text", async () => {
    const db = await testDb();
    const quiz = await toQuiz(db);
    expect(quiz.questions.map((q) => q.id)).toEqual(["pv-q-today-vs-later", "pv-q-one-year", "pv-q-two-years"]);
    const facts = await turnFacts(db, map, OWNER_LEARNER_ID, await placeOf(db));
    expect(facts).toMatchObject({ step: "check", cap: 80, quizOpen: true });
    expect(facts.openItems.map((i) => i.prompt)).toEqual(
      ["pv-q-today-vs-later", "pv-q-one-year", "pv-q-two-years", "pv-q-rate-rises", "pv-q-annuity-total", "pv-q-five-percent"].map(prompt),
    );
    expect(facts.openItems[1]).toEqual({ prompt: prompt("pv-q-one-year"), choices: ["$1,000", "$990", "$1,010", "$1,100"], answer: "$1,000" });
    // The open attempt's numbers and the next attempt's.
    expect(facts.blockedNumbers).toEqual(expect.arrayContaining(["1100", "10", "1210", "5000", "4535"]));
    // Reading the facts never makes an attempt.
    expect((await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).quiz!.attemptId).toBe(quiz.attemptId);
  });

  it("after a miss, with no attempt open: only the next attempt's questions", async () => {
    const db = await testDb();
    const quiz = await toQuiz(db);
    const wrong = Object.fromEntries(quiz.questions.map((q) => [q.id, q.choices.find((c) => c.id !== map.question(q.id)!.answer)!.id]));
    await submitQuizAnswers(db, map, quiz.attemptId, wrong, new Date(), OWNER_LEARNER_ID);
    const items = await openQuizItems(db, map, OWNER_LEARNER_ID, check);
    expect(items.map((i) => i.prompt)).toEqual(["pv-q-rate-rises", "pv-q-annuity-total", "pv-q-five-percent"].map(prompt));
    expect(items[2].answer).toBe("$4,535");
    // Still nothing made: the Check tab shows the missed attempt until Try again.
    expect((await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).quiz).toBeNull();
  });

  it("before the quiz is first shown: the first attempt's questions, which open when the Check tab draws", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    const items = await openQuizItems(db, map, OWNER_LEARNER_ID, check);
    expect(items.map((i) => i.prompt)).toEqual(["pv-q-today-vs-later", "pv-q-one-year", "pv-q-two-years"].map(prompt));
    expect((await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).quiz!.attemptNo).toBe(0);
  });

  it("skips a question id that neither the Course Map nor the Question Bank holds", async () => {
    const db = await testDb();
    await toQuiz(db);
    // The next attempt would show the missing question first, then two that exist.
    const questions = [...check.questions.slice(0, 3), "bank:gone", ...check.questions.slice(3)];
    const items = await openQuizItems(db, map, OWNER_LEARNER_ID, { ...check, questions });
    expect(items.map((i) => i.prompt)).toEqual(
      ["pv-q-today-vs-later", "pv-q-one-year", "pv-q-two-years", "pv-q-rate-rises", "pv-q-annuity-total"].map(prompt),
    );
  });

  it("a Go deeper turn has the long word limit", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
    await saveFinishedStep(db, map, "story", new Date(), OWNER_LEARNER_ID);
    const facts = await turnFacts(db, map, OWNER_LEARNER_ID, await placeOf(db), { learnerText: GO_DEEPER });
    expect(facts).toMatchObject({ step: "concept", replyKind: "go_deeper", cap: 120 });
  });

  it("with every Topic passed: no step, the long limit, nothing blocked", async () => {
    const db = await testDb();
    expect(await turnFacts(db, map, OWNER_LEARNER_ID, null)).toMatchObject({ step: "none", cap: 120, quizOpen: false, openItems: [], internalWords: [] });
  });
});

describe("the Reply kind of a Learner message", () => {
  it("reads Go deeper and a request for something simpler, and nothing else", () => {
    expect(replyKindOf(GO_DEEPER)).toBe("go_deeper");
    expect(replyKindOf("Explain that more simply.")).toBe("simpler");
    expect(replyKindOf("can you make it simpler")).toBe("simpler");
    expect(replyKindOf("What is a basis point?")).toBeUndefined();
    expect(replyKindOf(undefined)).toBeUndefined();
  });
});

describe("the reply-check context", () => {
  it("carries the facts the checks read, and the Reply kind and Widget validator the caller gives", async () => {
    const db = await testDb();
    await toQuiz(db);
    const facts = await turnFacts(db, map, OWNER_LEARNER_ID, await placeOf(db));
    const widgetOk = () => null;
    expect(replyCheckContext(facts, { replyKind: "hint", widgetOk })).toEqual({
      step: "check",
      replyKind: "hint",
      exampleCurrency: "INR",
      caseCurrencies: ["USD"],
      openItems: facts.openItems,
      internalWords: facts.internalWords,
      widgetOk,
    });
    expect(replyCheckContext(facts).replyKind).toBeUndefined();
  });
});
