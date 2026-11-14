import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { loadCourseMap } from "@/course/map";
import { learnerState, messages, OWNER_LEARNER_ID, sessions as sessionsTable } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep, saveJump } from "@/learner/memory";
import { navigate } from "@/course/navigator";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { ENGINE_INSTRUCTIONS } from "./instructions";
import { TUTOR_MODEL } from "./model";
import { closedInFavourOf, refreezeIfChanged, retireLegacySessions, saveShownSession, type Shown } from "./session-log";
import { loadCurrentSession, loadSession } from "./transcript";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { startTurn, updateTurn } from "./turn-status";

// The Companion Widget is off here: this file tests which Session a turn runs in.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

/**
 * The switch to OpenAI (ADR 0015): a Session frozen for a Claude model is closed (Older, still readable) when the
 * Learner's next turn or visit reaches it, and a fresh gpt-6.1-sol Session takes over at the saved step. Nothing of a
 * Claude-era conversation is ever sent to OpenAI.
 */

const map = presentValueOnly({ real: loadCourseMap(), withoutQuiz: true, withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], shown?: Shown) {
  const { client, requests } = scriptedClient(replies);
  const events = await collect(runTutorTurn({ db, client, map, shown, learnerId: OWNER_LEARNER_ID }, input));
  return { events, requests };
}

const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);
const allSessions = (db: Db) => db.select().from(sessionsTable).where(eq(sessionsTable.learnerId, OWNER_LEARNER_ID)).orderBy(sessionsTable.id);

/** A Topic conversation as the Claude build left it: a live Session frozen for Opus, with a signed thinking block. */
async function claudeEraSession(db: Db): Promise<number> {
  await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
  await turn(db, "Tell me about the lottery.", [say("Picture October 2018.")]);
  const [session] = await allSessions(db);
  await db.update(sessionsTable).set({ model: "claude-opus-5-5", tools: [{ type: "code_execution_20260521", name: "code_execution" }] }).where(eq(sessionsTable.id, session.id));
  await db.insert(messages).values({ sessionId: session.id, seq: 99, role: "assistant", content: [{ type: "thinking", thinking: "Anthropic thinking.", signature: "sig==" }, { type: "text", text: "Claude said this." }] });
  return session.id;
}

describe("Claude-era Sessions after the switch to OpenAI", () => {
  it("a typed message closes the Topic's Claude-era Session and replies in a fresh gpt-6.1-sol Session; nothing of the old one is sent", async () => {
    const db = await testDb();
    const oldId = await claudeEraSession(db);
    await saveShownSession(db, OWNER_LEARNER_ID, oldId);

    const { events, requests } = await turn(db, "Go on.", [say("A fresh start at the story.")], { sessionId: oldId });
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe(TUTOR_MODEL);
    expect(requests[0].instructions).toBe(ENGINE_INSTRUCTIONS);
    expect(sent(requests[0])).not.toContain("Picture October 2018.");
    expect(sent(requests[0])).not.toContain("Claude said this.");
    expect(sent(requests[0])).not.toContain("thinking");
    // The fresh Session opens with code's context, so the Tutor still knows where the Learner stands.
    expect(sent(requests[0])).toContain("Course Navigator");

    const [old, fresh] = await allSessions(db);
    expect(old).toMatchObject({ id: oldId, older: true, model: "claude-opus-5-5", restartedAt: null });
    expect(fresh).toMatchObject({ older: false, model: TUTOR_MODEL, topicId: "present-value" });
    // The page is told the new Session, and shows only its conversation; the old one still reads back whole.
    expect(events.at(-1)).toMatchObject({ type: "done", shown: { sessionId: fresh.id } });
    expect((await loadCurrentSession(db, map, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["Go on.", "A fresh start at the story."]);
    const oldLines = (await loadSession(db, oldId, map, OWNER_LEARNER_ID)).map((l) => l.text);
    expect(oldLines[0]).toBe("Tell me about the lottery.");
    expect(oldLines.join("\n")).toContain("Picture October 2018.");
  });

  it("the locked Session of 11 November (spec A2): a Claude-era Session whose thinking the API refused opens fresh at the same step, progress kept", async () => {
    const db = await testDb();
    const oldId = await claudeEraSession(db);
    // Locked as Learner `test`'s was: a later step, and a thinking block "bound to a different conversation" in its history.
    await saveFinishedStep(db, map, "story", new Date(), OWNER_LEARNER_ID);
    await db.insert(messages).values({ sessionId: oldId, seq: 100, role: "assistant", content: [{ type: "thinking", thinking: "Bound elsewhere.", signature: "stale==" }, { type: "text", text: "A basis point is a smaller ruler." }] });
    const before = navigate(map, await loadProgress(db, OWNER_LEARNER_ID));
    expect(before?.step).toBe("concept");

    const { events, requests } = await turn(db, "What does that word mean?", [say("A rupee today beats a rupee next year.")], { sessionId: oldId });
    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(requests).toHaveLength(1);
    expect(sent(requests[0])).not.toContain("Bound elsewhere.");
    expect(sent(requests[0])).not.toContain("thinking");
    // Same Topic, same step: nothing is started over.
    const after = navigate(map, await loadProgress(db, OWNER_LEARNER_ID));
    expect(after).toMatchObject({ topic: { id: "present-value" }, step: "concept" });
    const [old, fresh] = await allSessions(db);
    expect(old).toMatchObject({ id: oldId, older: true, restartedAt: null });
    expect(fresh).toMatchObject({ older: false, model: TUTOR_MODEL, topicId: "present-value" });
  });

  it("a Retry of a turn left unfinished in a Claude-era Session runs afresh, from its saved message, in the new Session", async () => {
    const db = await testDb();
    const oldId = await claudeEraSession(db);
    const unfinished = (await startTurn(db, new Date(), "What did the winner choose?", OWNER_LEARNER_ID))!;
    await updateTurn(db, unfinished.id, { status: "cut_off", sessionId: oldId, turnSeq: 2 });

    const { requests } = await turn(db, { resume: true }, [say("The lump sum.")]);
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe(TUTOR_MODEL);
    expect(sent(requests[0])).toContain("What did the winner choose?");
    expect(sent(requests[0])).not.toContain("Picture October 2018.");
    const [old, fresh] = await allSessions(db);
    expect(old.older).toBe(true);
    expect((await loadSession(db, fresh.id, map, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["What did the winner choose?", "The lump sum."]);
  });

  it("a Widget Retry from a tab still showing the closed Session, after its turn finished, draws that turn's reply; a new message from it is still stale", async () => {
    const db = await testDb();
    const oldId = await claudeEraSession(db);
    await saveShownSession(db, OWNER_LEARNER_ID, oldId);
    // The tab let go of the stream before "done" (Widget Retry while the turn ran), so it still shows the closed Session.
    await turn(db, "Go on.", [say("A fresh start at the story.")], { sessionId: oldId });
    const [, fresh] = await allSessions(db);

    const { events, requests } = await turn(db, { resume: true }, [], { sessionId: oldId });
    expect(requests).toHaveLength(0);
    expect(events.some((e) => e.type === "stale")).toBe(false);
    expect(events.find((e) => e.type === "replay")).toMatchObject({ type: "replay", text: expect.stringContaining("A fresh start at the story.") });
    expect(events.at(-1)).toMatchObject({ type: "done", shown: { sessionId: fresh.id } });

    // A typed message from a tab that never drew that reply is refused as before.
    const typed = await turn(db, "And then?", [say("Not sent.")], { sessionId: oldId });
    expect(typed.requests).toHaveLength(0);
    expect(typed.events.some((e) => e.type === "stale")).toBe(true);
  });

  it("a Claude-era Session with no message yet is refrozen in place, so no empty Older Session appears", async () => {
    const db = await testDb();
    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    const [empty] = await db
      .insert(sessionsTable)
      .values({ learnerId: OWNER_LEARNER_ID, topicId: "present-value", older: false, instructions: "Old instructions.", tools: [], model: "claude-opus-5-5", effort: "medium", fingerprint: "old", createdAt: new Date() })
      .returning();

    const { requests } = await turn(db, "Hello.", [say("Hello again.")]);
    expect(requests[0].model).toBe(TUTOR_MODEL);
    const rows = await allSessions(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: empty.id, older: false, model: TUTOR_MODEL, instructions: ENGINE_INSTRUCTIONS });
  });

  it("closing on a visit: marks the Session older, unpins it from the workspace, never marks it a Start-over, and does nothing twice", async () => {
    const db = await testDb();
    const oldId = await claudeEraSession(db);
    await saveShownSession(db, OWNER_LEARNER_ID, oldId);

    expect(await retireLegacySessions(db, OWNER_LEARNER_ID, "present-value")).toBe(true);
    const [old] = await allSessions(db);
    expect(old).toMatchObject({ older: true, restartedAt: null });
    const [state] = await db.select().from(learnerState).where(eq(learnerState.learnerId, OWNER_LEARNER_ID));
    expect(state.shownSessionId).toBeNull();
    // Another Topic's, or the same one again: nothing to close.
    expect(await retireLegacySessions(db, OWNER_LEARNER_ID, "present-value")).toBe(false);
    expect(await retireLegacySessions(db, OWNER_LEARNER_ID, null)).toBe(false);
  });

  it("a tab still showing the closed Session counts as showing its replacement, for the same Topic only", async () => {
    const db = await testDb();
    const oldId = await claudeEraSession(db);
    await turn(db, "Go on.", [say("A fresh start.")]);
    const [, fresh] = await allSessions(db);
    expect(await closedInFavourOf(db, OWNER_LEARNER_ID, oldId, fresh.id)).toBe(true);
    expect(await closedInFavourOf(db, OWNER_LEARNER_ID, fresh.id, fresh.id)).toBe(false);
    expect(await closedInFavourOf(db, OWNER_LEARNER_ID, oldId, null)).toBe(false);
    await db.update(sessionsTable).set({ topicId: "bonds" }).where(and(eq(sessionsTable.id, oldId)));
    expect(await closedInFavourOf(db, OWNER_LEARNER_ID, oldId, fresh.id)).toBe(false);
  });

  it("refuses to refreeze a Claude-era Session: it must be closed instead", async () => {
    const db = await testDb();
    const oldId = await claudeEraSession(db);
    const [old] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, oldId));
    await expect(refreezeIfChanged(db, old)).rejects.toThrow(/should have been retired/);
  });
});
