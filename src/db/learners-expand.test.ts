import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  OWNER_LEARNER_ID,
  checkResults,
  insightAttempts,
  learnerProfile,
  learnerState,
  learners,
  misconceptions,
  noteItems,
  pastedTexts,
  quizAttempts,
  reviewCards,
  reviewLog,
  sessionItems,
  sessions,
  topicProgress,
  turns,
  widgetState,
} from "./schema";
import type { Db } from "./types";
import { closeBeforeExpand, databaseBeforeExpand, migrateToLatest, rowsFromBefore } from "@/test/before-expand";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { presentValueOnly } from "@/test/present-value-map";
import { runTutorTurn } from "@/tutor/turn";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { saveFinishedStep, saveMisconception } from "@/learner/memory";
import { saveProfile } from "@/learner/profile";
import { addLine } from "@/learner/notes";
import { reviewState } from "@/learner/review";

/** Every table that holds one Learner's data (spec #119, "Learner-owned data"). */
const learnerOwned = {
  learner_state: learnerState,
  topic_progress: topicProgress,
  check_results: checkResults,
  quiz_attempts: quizAttempts,
  misconceptions,
  insight_attempts: insightAttempts,
  review_cards: reviewCards,
  review_log: reviewLog,
  note_items: noteItems,
  learner_profile: learnerProfile,
  pasted_texts: pastedTexts,
  sessions,
  turns,
};

afterAll(closeBeforeExpand);

async function ownersOf(db: Db) {
  const out: Record<string, number[]> = {};
  for (const [name, table] of Object.entries(learnerOwned)) {
    const rows = (await db.select({ learnerId: table.learnerId }).from(table)) as { learnerId: number }[];
    out[name] = rows.map((r) => r.learnerId);
  }
  return out;
}

describe("database expand: Learners", () => {
  it("creates the owner as the only Learner and gives every existing row to the owner, marking every Session Older", async () => {
    const { client, db } = await databaseBeforeExpand();
    await rowsFromBefore(client);

    await migrateToLatest(client);

    expect(await db.select().from(learners)).toEqual([
      { id: OWNER_LEARNER_ID, name: "owner", archivedAt: null, showDeveloperDetails: false, createdAt: expect.any(Date) },
    ]);
    const owners = await ownersOf(db);
    for (const [name, ids] of Object.entries(owners)) {
      expect(ids.length, name).toBeGreaterThan(0);
      expect(new Set(ids), name).toEqual(new Set([OWNER_LEARNER_ID]));
    }
    expect(await db.select({ topicId: sessions.topicId, older: sessions.older, refrozenAtSeq: sessions.refrozenAtSeq }).from(sessions)).toEqual([
      { topicId: null, older: true, refrozenAtSeq: null },
      { topicId: null, older: true, refrozenAtSeq: null },
    ]);
    expect(await db.select({ shown: learnerState.shownSessionId }).from(learnerState)).toEqual([{ shown: null }]);
  });

  it("rows written by today's code belong to the Learner it names, never the owner, and its Sessions belong to their Topic", async () => {
    const db = await testDb();
    const [learner] = await db.insert(learners).values({ name: "test" }).returning();
    const map = presentValueOnly({ withoutInsight: true });
    const text = (t: string) => ({ content: [{ type: "text", text: t }] });
    const { client } = scriptedClient([text("A story."), text("Your quiz is below."), text("Read it.")]);
    const run = async (input: Parameters<typeof runTutorTurn>[1]) => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: learner.id }, input)) void e;
    };

    await run("Hello");
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), learner.id);
    await run("Go on.");
    const quiz = (await openQuiz(db, map, new Date(), learner.id))!;
    await submitQuiz(db, map, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, map.question(q.id)!.answer])), new Date(), learner.id);
    await reviewState(db, map, new Date(), learner.id); // the Review panel enrolls the passed questions
    await saveMisconception(db, map, { topicId: "present-value", description: "d", model: "m", toolCallId: "toolu_x" }, new Date(), learner.id);
    await saveProfile(db, { work: "teacher", location: null, loan: null, savingFor: null }, new Date(), learner.id);
    await addLine(db, map, "present-value", "my line", new Date(), learner.id);
    await run({ message: "Look at this", paste: "A pasted passage." });

    const owners = await ownersOf(db);
    for (const [name, ids] of Object.entries(owners)) {
      if (name === "insight_attempts") continue; // the map has no Insight, so today's code writes none
      expect(ids.length, name).toBeGreaterThan(0);
      expect(new Set(ids), name).toEqual(new Set([learner.id]));
    }
    expect(new Set((await db.select({ older: sessions.older, topicId: sessions.topicId }).from(sessions)).map((s) => JSON.stringify(s)))).toEqual(
      new Set([JSON.stringify({ older: false, topicId: "present-value" })]),
    );
  });

  it("allows one live Session per Learner and Topic, but leaves Older Sessions and Sessions with no Topic unconstrained", async () => {
    const db = await testDb();
    const session = (values: Partial<typeof sessions.$inferInsert>) =>
      db.insert(sessions).values({ learnerId: OWNER_LEARNER_ID, instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f", ...values });

    await session({ topicId: "percent", older: false });
    await expect(session({ topicId: "percent", older: false })).rejects.toThrow();
    await session({ topicId: "present-value", older: false });
    await session({ topicId: "percent", older: true });
    await session({ topicId: "percent", older: true });
    await session({ topicId: null, older: false });
    await session({ topicId: null, older: false });

    const [other] = await db.insert(learners).values({ name: "test" }).returning();
    await session({ topicId: "percent", older: false, learnerId: other.id });
  });

  it("keeps one active Learner per name; an archived one frees the name", async () => {
    const db = await testDb();
    await expect(db.insert(learners).values({ name: "owner" })).rejects.toThrow();
    await db.update(learners).set({ archivedAt: new Date() }).where(eq(learners.id, OWNER_LEARNER_ID));
    const [fresh] = await db.insert(learners).values({ name: "owner" }).returning();
    expect(fresh.id).not.toBe(OWNER_LEARNER_ID);
    expect(fresh.showDeveloperDetails).toBe(false);
  });

  it("stores display-only Session items in order and one Widget state per Session and Widget key", async () => {
    const db = await testDb();
    const [s] = await db.insert(sessions).values({ learnerId: OWNER_LEARNER_ID, instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f", topicId: "percent", older: false }).returning();

    await db.insert(sessionItems).values([
      { learnerId: OWNER_LEARNER_ID, sessionId: s.id, afterSeq: 3, kind: "step_divider", data: { step: "concept" } },
      { learnerId: OWNER_LEARNER_ID, sessionId: s.id, afterSeq: 1, kind: "check_result", data: { passed: true } },
    ]);
    expect(await db.select({ learnerId: sessionItems.learnerId, afterSeq: sessionItems.afterSeq, kind: sessionItems.kind }).from(sessionItems).orderBy(sessionItems.afterSeq)).toEqual([
      { learnerId: OWNER_LEARNER_ID, afterSeq: 1, kind: "check_result" },
      { learnerId: OWNER_LEARNER_ID, afterSeq: 3, kind: "step_divider" },
    ]);

    await db.insert(widgetState).values({ learnerId: OWNER_LEARNER_ID, sessionId: s.id, widgetKey: "pv-annuity", values: { rate: 3.33 }, ticked: ["zero"] });
    await expect(db.insert(widgetState).values({ learnerId: OWNER_LEARNER_ID, sessionId: s.id, widgetKey: "pv-annuity", values: {}, ticked: [] })).rejects.toThrow();
    expect(await db.select().from(widgetState)).toEqual([
      { sessionId: s.id, widgetKey: "pv-annuity", learnerId: OWNER_LEARNER_ID, values: { rate: 3.33 }, ticked: ["zero"], updatedAt: expect.any(Date) },
    ]);

    await db.insert(learnerState).values({ learnerId: OWNER_LEARNER_ID, id: 1, shownSessionId: s.id }).onConflictDoUpdate({ target: learnerState.id, set: { shownSessionId: s.id } });
    expect(await db.select({ shown: learnerState.shownSessionId, learnerId: learnerState.learnerId }).from(learnerState)).toEqual([{ shown: s.id, learnerId: OWNER_LEARNER_ID }]);
  });
});
