import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
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
import * as schema from "./schema";
import type { Db } from "./types";
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

const EXPAND = "_learners_expand";

const temp: string[] = [];
const clients: PGlite[] = [];
afterAll(async () => {
  await Promise.allSettled(clients.map((c) => c.close()));
  await Promise.allSettled(temp.map((d) => rm(d, { recursive: true, force: true })));
});

/** A Postgres migrated up to just before the expand migration: the database as production has it today. */
async function databaseBeforeExpand(): Promise<{ client: PGlite; db: Db }> {
  const dir = await mkdtemp(join(tmpdir(), "finance-agent-before-expand-"));
  temp.push(dir);
  await cp("drizzle", dir, { recursive: true });
  const journalFile = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalFile, "utf8")) as { entries: { tag: string }[] };
  const at = journal.entries.findIndex((e) => e.tag.endsWith(EXPAND));
  expect(at).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, at);
  await writeFile(journalFile, JSON.stringify(journal));
  const client = new PGlite({ extensions: { vector } });
  clients.push(client);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: dir });
  return { client, db: db as unknown as Db };
}

/** Rows written the way the code live before the expand wrote them: with no Learner id, which didn't exist. */
async function rowsFromBefore(client: PGlite) {
  await client.exec(`
    INSERT INTO sessions (instructions, tools, model, effort, fingerprint) VALUES ('i', '[]', 'm', 'medium', 'f'), ('i', '[]', 'm', 'medium', 'g');
    INSERT INTO turns (session_id, turn_seq, status) VALUES (1, 0, 'finished');
    INSERT INTO learner_state (id, current_topic_id) VALUES (1, 'present-value');
    INSERT INTO topic_progress (topic_id, step, status) VALUES ('present-value', 'concept', 'in_progress');
    INSERT INTO check_results (topic_id, check_id, passed) VALUES ('present-value', 'pv-quiz', true);
    INSERT INTO quiz_attempts (check_id, attempt_no, question_ids) VALUES ('pv-quiz', 0, '["q1"]');
    INSERT INTO misconceptions (topic_id, description, model, tool_call_id) VALUES ('present-value', 'd', 'm', 'toolu_1');
    INSERT INTO insight_attempts (topic_id, reported, released, words, tool_call_id) VALUES ('present-value', 'found', 'found', 'w', 'toolu_2');
    INSERT INTO review_cards (question_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state) VALUES ('q1', now(), 1, 1, 0, 0, 0, 0, 0, 0);
    INSERT INTO review_log (question_id, rating, source, reviewed_at) VALUES ('q1', 3, 'quiz', now());
    INSERT INTO note_items (topic_id, kind, text) VALUES ('present-value', 'line', 'my line');
    INSERT INTO learner_profile (id, work) VALUES (1, 'teacher');
    INSERT INTO pasted_texts (turn_id, session_id, text, words) VALUES (1, 1, 'pasted', 1);
  `);
}

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

    await migrate(drizzle({ client, schema }), { migrationsFolder: "./drizzle" });

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

  it("rows written by today's code, which never names a Learner, belong to the owner, and its Sessions are Older", async () => {
    const db = await testDb();
    const map = presentValueOnly({ withoutInsight: true });
    const text = (t: string) => ({ content: [{ type: "text", text: t }] });
    const { client } = scriptedClient([text("A story."), text("Your quiz is below."), text("Read it.")]);
    const run = async (input: Parameters<typeof runTutorTurn>[1]) => {
      for await (const e of runTutorTurn({ db, client, map }, input)) void e;
    };

    await run("Hello");
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
    await run({ continue: true });
    const quiz = (await openQuiz(db, map))!;
    await submitQuiz(db, map, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, map.question(q.id)!.answer])));
    await reviewState(db, map); // the Review panel enrolls the passed questions
    await saveMisconception(db, map, { topicId: "present-value", description: "d", model: "m", toolCallId: "toolu_x" });
    await saveProfile(db, { work: "teacher", location: null, loan: null, savingFor: null });
    await addLine(db, map, "present-value", "my line");
    await run({ message: "Look at this", paste: "A pasted passage." });

    const owners = await ownersOf(db);
    for (const [name, ids] of Object.entries(owners)) {
      if (name === "insight_attempts") continue; // the map has no Insight, so today's code writes none
      expect(ids.length, name).toBeGreaterThan(0);
      expect(new Set(ids), name).toEqual(new Set([OWNER_LEARNER_ID]));
    }
    expect(new Set((await db.select({ older: sessions.older, topicId: sessions.topicId }).from(sessions)).map((s) => JSON.stringify(s)))).toEqual(
      new Set([JSON.stringify({ older: true, topicId: null })]),
    );
  });

  it("allows one live Session per Learner and Topic, but leaves Older Sessions and Sessions with no Topic unconstrained", async () => {
    const db = await testDb();
    const session = (values: Partial<typeof sessions.$inferInsert>) =>
      db.insert(sessions).values({ instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f", ...values });

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
    const [s] = await db.insert(sessions).values({ instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f", topicId: "percent", older: false }).returning();

    await db.insert(sessionItems).values([
      { sessionId: s.id, afterSeq: 3, kind: "step_divider", data: { step: "concept" } },
      { sessionId: s.id, afterSeq: 1, kind: "check_result", data: { passed: true } },
    ]);
    expect(await db.select({ learnerId: sessionItems.learnerId, afterSeq: sessionItems.afterSeq, kind: sessionItems.kind }).from(sessionItems).orderBy(sessionItems.afterSeq)).toEqual([
      { learnerId: OWNER_LEARNER_ID, afterSeq: 1, kind: "check_result" },
      { learnerId: OWNER_LEARNER_ID, afterSeq: 3, kind: "step_divider" },
    ]);

    await db.insert(widgetState).values({ sessionId: s.id, widgetKey: "pv-annuity", values: { rate: 3.33 }, ticked: ["zero"] });
    await expect(db.insert(widgetState).values({ sessionId: s.id, widgetKey: "pv-annuity", values: {}, ticked: [] })).rejects.toThrow();
    expect(await db.select().from(widgetState)).toEqual([
      { sessionId: s.id, widgetKey: "pv-annuity", learnerId: OWNER_LEARNER_ID, values: { rate: 3.33 }, ticked: ["zero"], updatedAt: expect.any(Date) },
    ]);

    await db.insert(learnerState).values({ id: 1, shownSessionId: s.id }).onConflictDoUpdate({ target: learnerState.id, set: { shownSessionId: s.id } });
    expect(await db.select({ shown: learnerState.shownSessionId, learnerId: learnerState.learnerId }).from(learnerState)).toEqual([{ shown: s.id, learnerId: OWNER_LEARNER_ID }]);
  });
});
