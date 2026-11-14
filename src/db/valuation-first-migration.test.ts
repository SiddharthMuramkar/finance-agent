import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, sessions, skipAheadAttempts, turns, tutorIncidents } from "./schema";
import { closeBeforeExpand, databaseBefore, migrateToLatest } from "@/test/before-expand";
import { testDb } from "@/test/pglite";

/** The one add-only migration for the valuation-first spec (2026-11-12): turns' failure and timing columns, Tutor incidents and Skip ahead. */

afterAll(closeBeforeExpand);

describe("the valuation-first migration", () => {
  it("keeps every turn as it was and leaves the new columns empty", async () => {
    const { client, db } = await databaseBefore("_valuation_first");
    await client.exec(`
      INSERT INTO sessions (learner_id, instructions, tools, model, effort, fingerprint) VALUES (1, 'i', '[]', 'm', 'medium', 'f');
      INSERT INTO turns (learner_id, session_id, turn_seq, status, error) VALUES (1, 1, 0, 'failed', '400 invalid_request_error');
    `);

    await migrateToLatest(client);

    const [turn] = await db.select().from(turns);
    expect(turn).toMatchObject({ status: "failed", error: "400 invalid_request_error", turnSeq: 0 });
    expect([turn.failureRef, turn.providerError, turn.providerRequestId, turn.providerStatus, turn.replyKind]).toEqual([null, null, null, null, null]);
    expect([turn.firstEventMs, turn.firstWordMs, turn.totalMs]).toEqual([null, null, null]);
  });

  it("keeps an incident when its turn is dropped, and allows one Skip ahead per Topic a day", async () => {
    const db = await testDb();
    const [session] = await db
      .insert(sessions)
      .values({ learnerId: OWNER_LEARNER_ID, instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f" })
      .returning();
    const [turn] = await db
      .insert(turns)
      .values({ learnerId: OWNER_LEARNER_ID, sessionId: session.id, status: "failed", failureRef: "T-7Q2K", providerStatus: 400, replyKind: "answer_question", firstEventMs: 2300 })
      .returning();
    expect(turn).toMatchObject({ failureRef: "T-7Q2K", providerStatus: 400, replyKind: "answer_question", firstEventMs: 2300, totalMs: null });

    await db.insert(tutorIncidents).values({ learnerId: OWNER_LEARNER_ID, sessionId: session.id, turnId: turn.id, kind: "thinking_prefix_mismatch", detail: { movedTo: 27 } });
    await db.delete(turns).where(eq(turns.id, turn.id)); // a dropped turn (a refused Next) must not be blocked by its incident
    expect(await db.select({ turnId: tutorIncidents.turnId, kind: tutorIncidents.kind }).from(tutorIncidents)).toEqual([{ turnId: null, kind: "thinking_prefix_mismatch" }]);

    const attempt = { learnerId: OWNER_LEARNER_ID, topicId: "percent", day: "2026-11-13" };
    const [first] = await db.insert(skipAheadAttempts).values(attempt).returning();
    expect(first).toMatchObject({ questions: [], answers: null, correctCount: null, passed: null, finishedAt: null });
    await expect(db.insert(skipAheadAttempts).values(attempt)).rejects.toThrow();
    await db.insert(skipAheadAttempts).values({ ...attempt, day: "2026-11-14" });
    await db.insert(skipAheadAttempts).values({ ...attempt, topicId: "present-value" });
    expect(await db.select().from(skipAheadAttempts)).toHaveLength(3);
  });
});
