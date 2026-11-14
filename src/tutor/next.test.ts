import { describe, expect, it, vi } from "vitest";
import type { CourseMap } from "@/course/map";
import type { TeachingStep } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { loadThread, type ThreadEntry } from "./transcript";
import { latestTurn, runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { turnKind } from "./turn-status";
import { nextOfferNow, type NextName } from "./next";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { NOT_THE_LEARNERS_ATTEMPT, PACING_REJECTION, VERDICT_PACING_REJECTION } from "./tools";
import { withoutChoices } from "@/test/choices";

// The Companion Widget code adds to a reply with none (E4a) is off here: this file tests other behaviour, and
// src/tutor/companion-turn.test.ts tests the companion.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

/**
 * Seam 1, Tutor Turn: the Learner's Next. Code checks the move is allowed, advances the Course Navigator,
 * stores the step divider and runs a fresh Tutor turn from a code-written note that is never a Learner bubble.
 */

/** Present value with no quiz and no Insight: Story, Concept, Your turn, Check, Reveal, Principle. */
const plain = presentValueOnly({ withoutQuiz: true, withoutInsight: true });

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], map: CourseMap = plain, now?: () => Date) {
  const { client, requests } = scriptedClient(replies);
  const events = await collect(runTutorTurn({ db, client, map, now, learnerId: OWNER_LEARNER_ID }, input));
  return { events, requests };
}

/** What the Learner sees, without the usage and save data that have their own tests. */
// The reply's Choices (D3a) have their own tests (choices-turn.test.ts): this file reads its items without them.
const seen = (entries: ThreadEntry[]) => withoutChoices(entries).map((e) => (e.role === "item" ? e : { role: e.role, text: e.text, ...(e.more && { more: true }) }));
const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);

async function saveSteps(db: Db, map: CourseMap, steps: TeachingStep[]) {
  for (const step of steps) {
    const moved = await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    if (!moved.ok) throw new Error(moved.reason);
  }
}

describe("the Learner's Next", () => {
  it("advances, stores the step divider and runs a Tutor turn from a code-written note, with no Learner bubble", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", [say("Once, a lottery winner had a choice.")]);
    const next = await turn(db, { next: "concept" }, [say("Now the concept: money today is worth more.")]);

    const divider = { kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } };
    // The browser hears the divider first, so it draws it before the new reply.
    expect(next.events.map((e) => e.type)).toEqual(["item", "text", "item", "done"]);
    expect(next.events[0]).toEqual({ type: "item", item: divider });
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"]).toMatchObject({ step: "concept" });

    expect(seen(await loadThread(db, sessionOf(first.events), plain, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      { role: "item", ...divider },
      { role: "assistant", text: "Now the concept: money today is worth more." },
    ]);
    const request = sent(next.requests[0]);
    expect(request).toContain("Next by code:");
    expect(request).toContain("Teaching Step: concept (Check 1 of 1");
    expect(request).not.toContain("Step 2 of 6");
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("next");
  });

  /** A Next that must be refused: nothing moves, nothing is stored or sent, and the Learner can still send at once. */
  async function expectRefused(db: Db, map: CourseMap, named: NextName, reason: string) {
    const before = await loadProgress(db, OWNER_LEARNER_ID);
    const sessionId = (await latestTurn(db, OWNER_LEARNER_ID))!.sessionId!;
    const thread = await loadThread(db, sessionId, map, OWNER_LEARNER_ID);
    const refused = await turn(db, { next: named }, [say("Should not run.")], map);
    expect(refused.events).toEqual([{ type: "not_allowed", message: reason }]);
    expect(refused.requests).toHaveLength(0);
    expect(await loadProgress(db, OWNER_LEARNER_ID)).toEqual(before);
    expect(await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).toEqual(thread);
    const after = await turn(db, "Can I ask something?", [say("Of course.")], map);
    expect(after.events.at(-1)).toMatchObject({ type: "done" });
  }

  it("is refused while a conversation Check is open, and after a miss there", async () => {
    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")]);
    await saveSteps(db, plain, ["story", "concept", "your_turn"]);
    await expectRefused(db, plain, "reveal", "A Check is open: only a saved pass moves past it.");

    const check = plain.topic("present-value")!.checks[0];
    const missed = await saveCheckResult(db, plain, { checkId: check.id, passed: false, evidence: "Not yet." }, new Date(), OWNER_LEARNER_ID);
    expect(missed.ok).toBe(true);
    await expectRefused(db, plain, "reveal", "A Check is open: only a saved pass moves past it.");
  });

  it("is refused at an Explore whose Insight is not yet found or told", async () => {
    const map = presentValueOnly({ withoutQuiz: true });
    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")], map);
    await saveSteps(db, map, ["story", "concept"]);
    await expectRefused(db, map, "your_turn", "Explore is not settled: the Learner has not found the Insight or been told it.");
  });

  it("after a quiz pass, the step reached has not begun: Next stores its divider and teaches it without moving on", async () => {
    const map = presentValueOnly({ withoutInsight: true });
    const db = await testDb();
    const first = await turn(db, "Hi", [say("Once upon a time.")], map);
    await saveSteps(db, map, ["story", "concept", "your_turn"]);
    const quiz = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    await submitQuiz(db, map, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, map.question(q.id)!.answer])), new Date(), OWNER_LEARNER_ID);

    // Check 2's Concept, reached by code: the chip names it and does not move on.
    expect(await nextOfferNow(db, map, OWNER_LEARNER_ID, new Date())).toEqual({ kind: "next", step: "concept", label: "Next: Concept", advances: false });
    const taught = await turn(db, { next: "concept" }, [say("Now the second concept.")], map);
    expect(taught.events[0]).toEqual({ type: "item", item: { kind: "step", data: { step: "concept", number: 5, label: "Step 5 of 9 · Concept" } } });
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"]).toMatchObject({ step: "concept" });
    const request = sent(taught.requests[0]);
    expect(request).toContain("has not begun; code did not move them on");
    expect(request).toContain("Quiz result by code");
    expect(seen(await loadThread(db, sessionOf(first.events), map, OWNER_LEARNER_ID)).slice(-2)).toEqual([
      { role: "item", kind: "step", data: { step: "concept", number: 5, label: "Step 5 of 9 · Concept" } },
      { role: "assistant", text: "Now the second concept." },
    ]);

    // Now taught, the chip moves on again.
    expect(await nextOfferNow(db, map, OWNER_LEARNER_ID, new Date())).toEqual({ kind: "next", step: "your_turn", label: "Next: Your turn", advances: true });
  });

  it("runs a fresh turn: the Tutor teaches the step and cannot finish it, record a verdict or record an Insight attempt in that reply", async () => {
    const tool = (name: string, input: object) => ({ content: [{ type: "text", text: "Taught." }, { type: "tool_use", id: `toolu_${name}`, name, input }] });
    /** The tool result the Tutor got back in the Next turn. */
    const resultOf = (requests: { messages: unknown[] }[]) => JSON.stringify(requests.at(-1)!.messages.at(-1));

    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")]);
    const finish = await turn(db, { next: "concept" }, [tool("finish_teaching_step", { step: "concept" }), say("Over to you.")]);
    expect(resultOf(finish.requests)).toContain(PACING_REJECTION);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"]).toMatchObject({ step: "concept" });

    const check = plain.topic("present-value")!.checks[0];
    await saveSteps(db, plain, ["concept"]);
    const verdict = await turn(db, { next: "check" }, [tool("record_check_verdict", { check_id: check.id, verdict: "pass", reasons: "Said it." }), say("Over to you.")]);
    expect(resultOf(verdict.requests)).toContain(VERDICT_PACING_REJECTION);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"]).toMatchObject({ step: "check", passedChecks: [] });

    const map = presentValueOnly({ withoutQuiz: true });
    const other = await testDb();
    await turn(other, "Hi", [say("Once upon a time.")], map);
    await saveSteps(other, map, ["story"]);
    await turn(other, "Go on.", [say("The concept.")], map);
    const attempt = await turn(other, { next: "explore" }, [tool("record_insight_attempt", { outcome: "found", learner_words: "Rates matter." }), say("Try the Widget.")], map);
    // A Next's note is written by code, so it is never an attempt, before pacing is even asked.
    expect(resultOf(attempt.requests)).toContain(NOT_THE_LEARNERS_ATTEMPT);
    expect((await loadProgress(other, OWNER_LEARNER_ID)).topics["present-value"].insight).toBeUndefined();
  });

  it("a failed Next's Retry re-runs the Next from its note, without moving on a second time", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", [say("Once upon a time.")]);
    const failed = await turn(db, { next: "concept" }, [{ error: new Error("overloaded") }]);
    expect(failed.events.at(-1)).toMatchObject({ type: "error" });

    const retried = await turn(db, { resume: true }, [say("Now the concept.")]);
    expect(sent(retried.requests[0])).toContain("Next by code: the Learner pressed Next: Concept");
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("next");
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"]).toMatchObject({ step: "concept" });
    expect(seen(await loadThread(db, sessionOf(first.events), plain, OWNER_LEARNER_ID)).slice(2)).toEqual([
      { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } },
      { role: "assistant", text: "Now the concept." },
    ]);
  });

  it("Complete this Topic passes the Topic at its Principle and closes it in the same Session, with no divider", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", [say("Once upon a time.")]);
    await saveSteps(db, plain, ["story", "concept", "your_turn"]);
    const check = plain.topic("present-value")!.checks[0];
    await saveCheckResult(db, plain, { checkId: check.id, passed: true, evidence: "Explained it." }, new Date(), OWNER_LEARNER_ID);
    await saveSteps(db, plain, ["reveal"]);
    expect(await nextOfferNow(db, plain, OWNER_LEARNER_ID, new Date())).toEqual({ kind: "complete", label: "Complete this Topic" });

    const failed = await turn(db, { next: "complete" }, [{ error: new Error("overloaded") }]);
    expect(failed.events.map((e) => e.type)).toEqual(["error"]);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"]).toMatchObject({ status: "passed" });

    // Its Retry still runs in the passed Topic's Session, told only to stop.
    const closed = await turn(db, { resume: true }, [say("Well done: that is the Topic.")]);
    const done = closed.events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    expect(done.ref.sessionId).toBe(sessionOf(first.events));
    expect(done.shown).toEqual({ sessionId: sessionOf(first.events) });
    const request = sent(closed.requests[0]);
    expect(request).toContain("the Learner pressed Complete this Topic. Topic complete: stop here.");
    expect(request).not.toContain("every Topic on the Course Map is passed");
    // No step divider: the Topic complete card ends the conversation instead.
    expect(seen(await loadThread(db, sessionOf(first.events), plain, OWNER_LEARNER_ID)).slice(-3)).toEqual([
      { role: "assistant", text: "Once upon a time." },
      { role: "assistant", text: "Well done: that is the Topic." },
      { role: "item", kind: "topic_complete", data: expect.objectContaining({ title: "Present value" }) },
    ]);
  });

  it("after a break, stores the Picking up divider the page drew first, then the step divider", async () => {
    const db = await testDb();
    const t0 = new Date("2026-11-01T09:00:00Z");
    const later = new Date(t0.getTime() + 7 * 3600_000);
    const first = await turn(db, "Hi", [say("Once upon a time.")], plain, () => t0);
    const next = await turn(db, { next: "concept" }, [say("Now the concept.")], plain, () => later);
    expect(next.events.map((e) => e.type)).toEqual(["item", "item", "text", "item", "done"]);
    expect(seen(await loadThread(db, sessionOf(first.events), plain, OWNER_LEARNER_ID)).slice(2)).toEqual([
      { role: "item", kind: "picking_up", data: expect.objectContaining({ label: "Picking up where you left off · Step 1 of 6 · Story" }) },
      { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } },
      { role: "assistant", text: "Now the concept." },
    ]);
  });

  it("is refused when it names a step other than the one on offer", async () => {
    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")]);
    await expectRefused(db, plain, "your_turn", 'Next names "concept", not "your_turn".');
  });
});
