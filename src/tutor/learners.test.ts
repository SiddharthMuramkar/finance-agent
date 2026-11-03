import { describe, expect, it } from "vitest";
import type { CourseMap } from "@/course/map";
import { importCaseData } from "@/case-data/import";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { dismissProfileOffer, loadProfile, profileInput, saveProfile, shouldOfferProfile } from "@/learner/profile";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { latestTurn, runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { listSessions, loadCurrentSession, loadSession } from "./transcript";
import { loadPastes, pasteSummary } from "./pasted";
import { loadSessionSummaries } from "./session-summary";

/**
 * Tutor Turn tests for two Learners using the app at once (spec #119, "Learners and sign-in"): each
 * turn names its Learner, and nothing one Learner does is seen by, or gets in the way of, the other.
 * Scripted Anthropic client, in-memory Postgres with the real migrations.
 */

/** Present value without its quiz Check or Insight: story, concept, your turn, one conversation Check, reveal, principle. */
const plain = presentValueOnly({ withoutQuiz: true, withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** A second Learner beside the owner (or a third, by another name). */
async function secondLearner(db: Db, name = "second"): Promise<number> {
  const [row] = await db.insert(learners).values({ name }).returning();
  return row.id;
}

function turnFor(db: Db, learnerId: number, input: TurnInput, replies: ScriptedReply[], extra: { map?: CourseMap; timeBudgetMs?: number } = {}) {
  const scripted = scriptedClient(replies);
  return { ...scripted, events: collect(runTutorTurn({ db, client: scripted.client, map: plain, ...extra, learnerId }, input)) };
}

/** Everything a request sent the model, as one string. */
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);

describe("two Learners in the Tutor Turn", () => {
  it("each runs a turn at the same time: the one-running-turn lock is per Learner", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const owner = turnFor(db, OWNER_LEARNER_ID, "Owner's message", [{ ...say("Owner's slow reply."), hold }]);
    await new Promise((r) => setTimeout(r, 20));

    const other = turnFor(db, second, "Second's message", [say("Second's reply.")]);
    expect((await other.events).at(-1)).toMatchObject({ type: "done" });
    // The owner's own second send is still turned away while their first runs.
    const again = turnFor(db, OWNER_LEARNER_ID, "Owner again", [say("Should not run.")]);
    expect(await again.events).toEqual([{ type: "busy", message: expect.stringMatching(/turn is in progress/i) }]);

    release();
    expect((await owner.events).at(-1)).toMatchObject({ type: "done" });
    expect((await loadCurrentSession(db, plain, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["Owner's message", "Owner's slow reply."]);
    expect((await loadCurrentSession(db, plain, second)).map((l) => l.text)).toEqual(["Second's message", "Second's reply."]);
  });

  it("each Learner's Sessions are their own: listed, read and summarised only for them", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    await turnFor(db, OWNER_LEARNER_ID, "Owner's question", [say("Owner's answer.")]).events;
    await turnFor(db, second, "Second's question", [say("Second's answer.")]).events;

    const [ownerSession] = await listSessions(db, OWNER_LEARNER_ID);
    const [secondSession] = await listSessions(db, second);
    expect(ownerSession.id).not.toBe(secondSession.id);
    expect((await listSessions(db, second)).map((s) => s.id)).toEqual([secondSession.id]);
    expect(await loadSession(db, ownerSession.id, plain, second)).toEqual([]);
    expect((await loadSession(db, ownerSession.id, plain, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["Owner's question", "Owner's answer."]);
    expect([...(await loadSessionSummaries(db, second)).keys()]).toEqual([secondSession.id]);
  });

  it("a second Learner's resume never picks up the first Learner's cut-off turn, which the first Learner can still resume", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const cut = turnFor(db, OWNER_LEARNER_ID, "A long question", [{ ...say("Too slow."), delayMs: 400 }], { timeBudgetMs: 100 });
    expect((await cut.events).at(-1)).toEqual({ type: "cut_off" });

    const other = turnFor(db, second, { resume: true }, [say("Should not run.")]);
    expect((await other.events).map((e) => e.type)).not.toContain("replay");
    expect(other.requests).toHaveLength(0);
    expect(await latestTurn(db, second)).toBeUndefined();
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "cut_off" });

    const resumed = turnFor(db, OWNER_LEARNER_ID, { resume: true }, [say("Here is the answer.")]);
    expect((await resumed.events).at(-1)).toMatchObject({ type: "done" });
    expect((await loadCurrentSession(db, plain, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["A long question", "Here is the answer."]);
    expect(await loadCurrentSession(db, plain, second)).toEqual([]);
  });

  it("the turn before a Learner's turn is their own: another Learner's turn in between doesn't hide their declined reply", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const refused = turnFor(db, second, "Something odd", [{ ...say("I can't"), stop_reason: "refusal" }]);
    expect(await refused.events).toContainEqual(expect.objectContaining({ type: "refusal" }));
    await turnFor(db, OWNER_LEARNER_ID, "Hello", [say("Hi.")]).events;

    const next = turnFor(db, second, "Let me ask another way", [say("Sure.")]);
    expect(await next.events).toContainEqual({ type: "session", reason: "refused" });
    // The owner's own Session carries on.
    const owner = turnFor(db, OWNER_LEARNER_ID, "And again", [say("Still here.")]);
    expect((await owner.events).map((e) => e.type)).not.toContain("session");
  });

  it("each Learner gets quiz attempt 0 for the same Check, and hears only their own result", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const map = presentValueOnly({ withoutInsight: true });
    for (const learnerId of [OWNER_LEARNER_ID, second]) {
      for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), learnerId);
    }

    const ownerQuiz = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    const secondQuiz = (await openQuiz(db, map, new Date(), second))!;
    expect([ownerQuiz.attemptNo, secondQuiz.attemptNo]).toEqual([0, 0]);
    expect(secondQuiz.attemptId).not.toBe(ownerQuiz.attemptId);
    expect(secondQuiz.checkId).toBe(ownerQuiz.checkId);

    const right = Object.fromEntries(ownerQuiz.questions.map((q) => [q.id, map.question(q.id)!.answer]));
    expect(await submitQuiz(db, map, ownerQuiz.attemptId, right, new Date(), OWNER_LEARNER_ID)).toMatchObject({ ok: true, passed: true });
    // One Learner can't submit another's attempt.
    expect(await submitQuiz(db, map, ownerQuiz.attemptId, right, new Date(), second)).toEqual({ ok: false, reason: "No such quiz attempt.", notFound: true });
    expect(await openQuiz(db, map, new Date(), second)).toMatchObject({ attemptId: secondQuiz.attemptId, attemptNo: 0 });

    const secondTurn = turnFor(db, second, "Is my quiz done?", [say("Not yet.")], { map });
    await secondTurn.events;
    expect(sent(secondTurn.requests[0])).not.toContain("Quiz result by code");
    const ownerTurn = turnFor(db, OWNER_LEARNER_ID, "How did I do?", [say("You passed.")], { map });
    await ownerTurn.events;
    expect(sent(ownerTurn.requests[0])).toContain(`Quiz result by code, Check ${ownerQuiz.checkId}, attempt 1`);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"].passedChecks).toEqual([ownerQuiz.checkId]);
    expect((await loadProgress(db, second)).topics["present-value"].passedChecks).toEqual([]);
  });

  it("each Learner settles the same Insight on their own", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const map = presentValueOnly({ withoutQuiz: true });
    for (const learnerId of [OWNER_LEARNER_ID, second]) {
      for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), learnerId);
    }
    const found = (id: string, words: string): ScriptedReply => ({
      content: [{ type: "tool_use", id, name: "record_insight_attempt", input: { outcome: "found", learner_words: words } }],
      stop_reason: "tool_use",
    });
    const words = "A higher rate shrinks later payments, so cash now can be worth more.";

    const ownerTurn = turnFor(db, OWNER_LEARNER_ID, words, [found("toolu_owner", words), say("Yes.")], { map });
    await ownerTurn.events;
    const secondTurn = turnFor(db, second, words, [found("toolu_second", words), say("Yes.")], { map });
    await secondTurn.events;

    const result = (request: { messages: unknown[] }) => sent(request);
    expect(result(ownerTurn.requests[1])).toContain("the Learner found the Insight");
    expect(result(secondTurn.requests[1])).toContain("the Learner found the Insight");
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"].insight).toBe("found");
    expect((await loadProgress(db, second)).topics["present-value"].insight).toBe("found");
  });

  it("one Learner's reveal shows another nothing extra: the Tutor's Case Data context follows the turn's own Learner", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const caseId = plain.topic("present-value")!.cases[0].id;
    const dataset = (id: string, points: [string, number][]) => ({
      caseId,
      id,
      label: `Label ${id}`,
      unit: "USD",
      source: `Source of ${id}`,
      sourceUrl: "https://example.org/source",
      checkedOn: "2026-11-02",
      checkNote: "Compared with the source.",
      points: points.map(([date, value]) => ({ date, value })),
    });
    await importCaseData(db, [dataset("cash-option", [["2018-10-23", 877_800_000]]), dataset("winner-choice", [["2019-03-04", 877_784_124]])]);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, plain, step, new Date(), OWNER_LEARNER_ID);
    await saveCheckResult(db, plain, { checkId: plain.topic("present-value")!.checks[0].id, passed: true }, new Date(), OWNER_LEARNER_ID);

    const ownerTurn = turnFor(db, OWNER_LEARNER_ID, "What happened next?", [say("Here it is.")]);
    await ownerTurn.events;
    expect(sent(ownerTurn.requests[0])).toContain(`${caseId}/winner-choice`);

    const secondTurn = turnFor(db, second, "Where do we start?", [say("With a story.")]);
    await secondTurn.events;
    expect(sent(secondTurn.requests[0])).toContain(`${caseId}/cash-option`);
    expect(sent(secondTurn.requests[0])).not.toContain("winner-choice");
    expect(sent(secondTurn.requests[0])).not.toContain("2019-03-04");
  });

  it("each Learner's Session opens with their own Learner Profile, and one with none shared gets no profile block", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const third = await secondLearner(db, "third");
    await saveProfile(db, profileInput.parse({ work: "Nurse", location: "Pune" }), new Date(), OWNER_LEARNER_ID);
    await saveProfile(db, profileInput.parse({ work: "Teacher" }), new Date(), second);
    expect(await loadProfile(db, OWNER_LEARNER_ID)).toMatchObject({ work: "Nurse", location: "Pune" });
    expect(await loadProfile(db, second)).toMatchObject({ work: "Teacher", location: null });
    expect(shouldOfferProfile(await loadProfile(db, third))).toBe(true);

    const ownerTurn = turnFor(db, OWNER_LEARNER_ID, "Hi", [say("Hello.")]);
    await ownerTurn.events;
    const secondTurn = turnFor(db, second, "Hi", [say("Hello.")]);
    await secondTurn.events;
    const thirdTurn = turnFor(db, third, "Hi", [say("Hello.")]);
    await thirdTurn.events;
    expect(sent(ownerTurn.requests[0])).toContain("- Work: Nurse");
    expect(sent(ownerTurn.requests[0])).not.toContain("Teacher");
    expect(sent(secondTurn.requests[0])).toContain("- Work: Teacher");
    expect(sent(secondTurn.requests[0])).not.toContain("Nurse");
    expect(sent(thirdTurn.requests[0])).not.toContain("Learner Profile");

    // "Not now" on one Learner's card doesn't hide another's.
    await dismissProfileOffer(db, new Date(), third);
    expect(shouldOfferProfile(await loadProfile(db, third))).toBe(false);
    expect((await loadProfile(db, second)).work).toBe("Teacher");
  });

  it("a pasted passage is stored and listed for the Learner who pasted it only", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const passage = "The cash option was smaller than the advertised jackpot.";
    await turnFor(db, second, { message: "Here it is.", paste: passage }, [say("Thanks.")]).events;
    await turnFor(db, OWNER_LEARNER_ID, "Hi", [say("Hello.")]).events;
    const [secondSession] = await listSessions(db, second);
    const [ownerSession] = await listSessions(db, OWNER_LEARNER_ID);

    expect(await loadPastes(db, secondSession.id, second)).toEqual([expect.objectContaining({ learnerId: second, text: passage })]);
    expect(await loadPastes(db, secondSession.id, OWNER_LEARNER_ID)).toEqual([]);
    expect(await loadPastes(db, ownerSession.id, OWNER_LEARNER_ID)).toEqual([]);
    expect(await pasteSummary(db, secondSession.id, OWNER_LEARNER_ID)).toEqual({ count: 0, words: 0 });
    expect((await pasteSummary(db, secondSession.id, second)).count).toBe(1);
  });
});
