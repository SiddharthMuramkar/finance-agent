import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { checkTabNow, retryQuiz, type OpenQuiz } from "@/learner/quiz";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { submitQuizAnswers } from "./check-results";
import { nextOfferNow } from "./next";
import { loadThread, type ThreadEntry } from "./transcript";
import { latestTurn, runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { turnKind } from "./turn-status";
import { withoutChoices } from "@/test/choices";

// The Companion Widget code adds to a reply with none (E4a) is off here: this file tests other behaviour, and
// src/tutor/companion-turn.test.ts tests the companion.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

/**
 * Seam 1, Tutor Turn: Check results in the conversation. Submitting a quiz stores a result card (a Session item
 * the model never sees); a miss runs a quiz follow-up turn from a code-written note, and the next attempt is
 * made only when the Learner presses Try again. A conversation Check's verdict stores its own card.
 */

/** Present value without its Insight: Story, Concept, Your turn, Check 1 (a quiz), Concept, Your turn, Check 2 (in conversation), Reveal, Principle. */
const map = presentValueOnly({ withoutInsight: true });

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[]) {
  const { client, requests } = scriptedClient(replies);
  const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, input));
  return { events, requests };
}

// The reply's Choices (D3a) have their own tests (choices-turn.test.ts): this file reads its items without them.
const seen = (entries: ThreadEntry[]) => withoutChoices(entries).map((e) => (e.role === "item" ? e : { role: e.role, text: e.text }));
const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);

/** Starts the Topic and walks to the quiz Check (Check 1 of 2); returns the Session and the open quiz. */
async function atQuiz(db: Db) {
  const first = await turn(db, "Hi", [say("Once, a lottery winner had a choice.")]);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  const tab = await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID);
  return { sessionId: sessionOf(first.events), quiz: tab.quiz! };
}

const right = (quiz: OpenQuiz) => Object.fromEntries(quiz.questions.map((q) => [q.id, map.question(q.id)!.answer]));
/** Answers every question right except the ones at these positions (from 1). */
function missing(quiz: OpenQuiz, ...positions: number[]) {
  return Object.fromEntries(
    quiz.questions.map((q, i) => {
      const answer = map.question(q.id)!.answer;
      return [q.id, positions.includes(i + 1) ? q.choices.find((c) => c.id !== answer)!.id : answer];
    }),
  );
}

describe("a quiz result card", () => {
  it("after a miss: stores \"not passed yet\", the follow-up turn goes over it with no Learner bubble, and no attempt exists until Try again", async () => {
    const db = await testDb();
    const { sessionId, quiz } = await atQuiz(db);
    expect(quiz.questions).toHaveLength(3);

    const result = await submitQuizAnswers(db, map, quiz.attemptId, missing(quiz, 2, 3), new Date(), OWNER_LEARNER_ID);
    const card = { kind: "check_result", data: { check: 1, passed: false, label: "1 of 3 — not passed yet · let's look at question 2" } };
    expect(result).toMatchObject({ ok: true, passed: false, item: card });

    // Code runs the follow-up turn: a code-written note, no Learner message, and the Tutor hears the missed questions.
    const followUp = await turn(db, { quizFollowUp: true }, [say("Let's look at question 2 together.")]);
    expect(followUp.events.at(-1)).toMatchObject({ type: "done" });
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("quiz_follow_up");
    const request = sent(followUp.requests[0]);
    expect(request).toContain("Quiz follow-up by code:");
    expect(request).toContain("Quiz result by code");
    expect(request).toContain("Missed:");
    // The card is drawn, never sent.
    expect(request).not.toContain("not passed yet · let's look at question");
    expect(seen(await loadThread(db, sessionId, map, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      { role: "item", ...card },
      { role: "assistant", text: "Let's look at question 2 together." },
    ]);

    // The Check tab shows the result; the next attempt is made only when the Learner presses Try again.
    const tab = await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID);
    expect(tab.quiz).toBeNull();
    expect(tab.missed).toMatchObject({ attemptId: quiz.attemptId, checkNumber: 1, checkCount: 2, result: { correctCount: 1, shown: 3, passed: false } });
    expect(await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).toEqual(tab);
    expect(await nextOfferNow(db, map, OWNER_LEARNER_ID, new Date())).toBeNull();

    const retried = await retryQuiz(db, map, new Date(), OWNER_LEARNER_ID);
    expect(retried).toMatchObject({ attemptNo: 1, checkNumber: 1 });
    expect(retried!.attemptId).not.toBe(quiz.attemptId);
    expect(await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).toEqual({ quiz: retried, missed: null });
  });

  it("after a miss: the follow-up note covers the first missed question only, as one slip, one fix and one new question", async () => {
    const db = await testDb();
    const { quiz } = await atQuiz(db);
    await submitQuizAnswers(db, map, quiz.attemptId, missing(quiz, 2, 3), new Date(), OWNER_LEARNER_ID);
    const [, second, third] = quiz.questions.map((q) => map.question(q.id)!);
    const chosen = second.choices.find((c) => c.id !== second.answer)!.text;

    await turn(db, { quizFollowUp: true }, [say("You took 4.5% for 45 points.")]);
    const note = (await latestTurn(db, OWNER_LEARNER_ID))!.input!;
    expect(note).toMatch(/^Quiz follow-up by code:/);
    // Code names the first missed question, the Learner's choice and the right answer; the second miss is left to the Check tab.
    expect(note).toContain(second.prompt);
    expect(note).toContain(chosen);
    expect(note).toContain(second.choices.find((c) => c.id === second.answer)!.text);
    expect(note).not.toContain(third.prompt);
    // One slip (the Known mistake when the marking names one), one fix, one similar question on new numbers, in 60 words.
    expect(note).toContain("Known mistake");
    expect(note).toContain("one-line fix");
    expect(note).toContain("new numbers");
    expect(note).toContain("60 words");
    expect(note).not.toContain("one at a time");
    expect(note).not.toContain("Do not write new quiz questions");
    expect(note).toContain("only when the Learner presses Try again");
  });

  it("after a pass: stores \"passed ✓\" (naming a missed question), runs no turn, and Next names the step not yet begun", async () => {
    const db = await testDb();
    const { sessionId, quiz } = await atQuiz(db);
    const result = await submitQuizAnswers(db, map, quiz.attemptId, missing(quiz, 3), new Date(), OWNER_LEARNER_ID);
    const card = { kind: "check_result", data: { check: 1, passed: true, label: "2 of 3 — passed ✓ · let's look at question 3" } };
    expect(result).toMatchObject({ ok: true, passed: true, item: card });
    expect(seen(await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).at(-1)).toEqual({ role: "item", ...card });
    expect(await nextOfferNow(db, map, OWNER_LEARNER_ID, new Date())).toEqual({ kind: "next", step: "concept", label: "Next: Concept", advances: false });
    expect(await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).toEqual({ quiz: null, missed: null });

    // A follow-up is only for a miss.
    const refused = await turn(db, { quizFollowUp: true }, [say("Should not run.")]);
    expect(refused.events).toEqual([{ type: "not_allowed", message: "There is no missed quiz to go over." }]);
    expect(refused.requests).toHaveLength(0);
  });

  it("after a pass, a typed message gets the divider for the step not yet begun, before the reply that teaches it", async () => {
    const db = await testDb();
    const { sessionId, quiz } = await atQuiz(db);
    await submitQuizAnswers(db, map, quiz.attemptId, right(quiz), new Date(), OWNER_LEARNER_ID);
    const typed = await turn(db, "What comes now?", [say("The second concept.")]);

    const divider = { role: "item", kind: "step", data: { step: "concept", number: 5, label: "Step 5 of 9 · Concept" } };
    // The browser draws it as it is stored, before the reply, as a reload does.
    expect(withoutChoices(typed.events).filter((e) => e.type === "item")).toEqual([{ type: "item", item: { kind: divider.kind, data: divider.data } }]);
    expect(seen(await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).slice(-3)).toEqual([{ role: "user", text: "What comes now?" }, divider, { role: "assistant", text: "The second concept." }]);
    expect(sent(typed.requests[0])).not.toContain("Step 5 of 9");

    // The next message is in the middle of that step: no second divider.
    await turn(db, "Go on.", [say("Money later is worth less.")]);
    expect((await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).filter((e) => e.role === "item" && e.kind === "step")).toHaveLength(1);
  });

  it("with every question right reads \"3 of 3 — passed ✓\", and a repeat submission stores no second card", async () => {
    const db = await testDb();
    const { sessionId, quiz } = await atQuiz(db);
    const first = await submitQuizAnswers(db, map, quiz.attemptId, right(quiz), new Date(), OWNER_LEARNER_ID);
    expect(first).toMatchObject({ item: { kind: "check_result", data: { label: "3 of 3 — passed ✓" } } });
    const again = await submitQuizAnswers(db, map, quiz.attemptId, right(quiz), new Date(), OWNER_LEARNER_ID);
    expect(again).toMatchObject({ ok: true, passed: true });
    expect(again).not.toHaveProperty("item");
    expect(withoutChoices(await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).filter((e) => e.role === "item")).toHaveLength(1);
  });
});

describe("a conversation Check's result card", () => {
  const verdict = (id: string, v: "pass" | "not_yet", checkId: string): ScriptedReply => ({
    content: [{ type: "tool_use", id, name: "record_check_verdict", input: { check_id: checkId, verdict: v, reasons: "Reasoned it through." } }],
  });

  it("is stored when the Tutor records a verdict: \"Check 2 — not passed yet\", then \"Check 2 — passed ✓\"; neither is sent to the model", async () => {
    const db = await testDb();
    const { sessionId, quiz } = await atQuiz(db);
    await submitQuizAnswers(db, map, quiz.attemptId, right(quiz), new Date(), OWNER_LEARNER_ID);
    await turn(db, { next: "concept" }, [say("The second concept.")]);
    for (const step of ["concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    const checkId = map.topic("present-value")!.checks[1].id;
    await turn(db, "Ready.", [say("Explain why money later is worth less.")]);

    await turn(db, "Because of risk.", [verdict("toolu_v1", "not_yet", checkId), say("Not quite yet.")]);
    const miss = { role: "item", kind: "check_result", data: { check: 2, passed: false, label: "Check 2 — not passed yet" } };
    expect(seen(await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).slice(-2)).toEqual([miss, { role: "assistant", text: "Not quite yet." }]);

    const passed = await turn(db, "Because it could earn interest meanwhile.", [verdict("toolu_v2", "pass", checkId), say("Exactly.")]);
    const pass = { role: "item", kind: "check_result", data: { check: 2, passed: true, label: "Check 2 — passed ✓" } };
    // The pass moves the Learner on, so the divider for the new step follows the card: a finished step can be scrolled back to.
    const divider = { role: "item", kind: "step", data: { step: "reveal", number: 8, label: "Step 8 of 9 · Reveal" } };
    expect(withoutChoices(passed.events).filter((e) => e.type === "item")).toEqual([
      { type: "item", item: { kind: pass.kind, data: pass.data } },
      { type: "item", item: { kind: divider.kind, data: divider.data } },
    ]);
    expect(seen(await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).slice(-3)).toEqual([pass, divider, { role: "assistant", text: "Exactly." }]);
    expect(sent(passed.requests.at(-1)!)).not.toContain("Check 2 — not passed yet");
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"]).toMatchObject({ step: "reveal" });
  });
});
