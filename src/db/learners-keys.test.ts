import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { insightAttempts, learnerProfile, learnerState, learners, noteItems, OWNER_LEARNER_ID, quizAttempts, reviewCards, topicProgress, turns } from "./schema";
import * as schema from "./schema";
import type { Db } from "./types";
import { testDb } from "@/test/pglite";

/** The per-Learner keys migration (spec #119, "Keys that change"). */

const KEYS = "_learners_keys";

const temp: string[] = [];
const clients: PGlite[] = [];
afterAll(async () => {
  await Promise.allSettled(clients.map((c) => c.close()));
  await Promise.allSettled(temp.map((d) => rm(d, { recursive: true, force: true })));
});

/** A Postgres migrated up to just before the keys migration: the database as production has it before this change. */
async function databaseBeforeKeys(): Promise<{ client: PGlite; db: Db }> {
  const dir = await mkdtemp(join(tmpdir(), "finance-agent-before-keys-"));
  temp.push(dir);
  await cp("drizzle", dir, { recursive: true });
  const journalFile = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalFile, "utf8")) as { entries: { tag: string }[] };
  const at = journal.entries.findIndex((e) => e.tag.endsWith(KEYS));
  expect(at).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, at);
  await writeFile(journalFile, JSON.stringify(journal));
  const client = new PGlite({ extensions: { vector } });
  clients.push(client);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: dir });
  return { client, db: db as unknown as Db };
}

describe("database: per-Learner keys", () => {
  it("keeps every owner row as it was", async () => {
    const { client, db } = await databaseBeforeKeys();
    await client.exec(`
      INSERT INTO learner_state (id, current_topic_id) VALUES (1, 'present-value');
      INSERT INTO topic_progress (topic_id, step, status) VALUES ('present-value', 'concept', 'in_progress'), ('percent', 'principle', 'passed');
      INSERT INTO quiz_attempts (check_id, attempt_no, question_ids) VALUES ('pv-quiz', 0, '["q1"]'), ('pv-quiz', 1, '["q2"]');
      INSERT INTO insight_attempts (topic_id, reported, released, words, tool_call_id) VALUES ('present-value', 'found', 'found', 'w', 'toolu_1');
      INSERT INTO turns (status) VALUES ('running');
      INSERT INTO review_cards (question_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state) VALUES ('q1', now(), 1, 1, 0, 0, 0, 0, 0, 0);
      INSERT INTO learner_profile (id, work) VALUES (1, 'teacher');
    `);

    await migrate(drizzle({ client, schema }), { migrationsFolder: "./drizzle" });

    expect(await db.select({ learnerId: learnerState.learnerId, topic: learnerState.currentTopicId }).from(learnerState)).toEqual([
      { learnerId: OWNER_LEARNER_ID, topic: "present-value" },
    ]);
    expect((await db.select({ learnerId: topicProgress.learnerId, topicId: topicProgress.topicId }).from(topicProgress)).length).toBe(2);
    expect((await db.select().from(quizAttempts)).map((a) => [a.learnerId, a.attemptNo])).toEqual([
      [OWNER_LEARNER_ID, 0],
      [OWNER_LEARNER_ID, 1],
    ]);
    expect((await db.select().from(insightAttempts)).length).toBe(1);
    expect((await db.select().from(turns)).map((t) => t.status)).toEqual(["running"]);
    expect((await db.select().from(reviewCards)).map((c) => [c.learnerId, c.questionId])).toEqual([[OWNER_LEARNER_ID, "q1"]]);
    expect((await db.select().from(learnerProfile)).map((p) => [p.learnerId, p.work])).toEqual([[OWNER_LEARNER_ID, "teacher"]]);
  });

  it("lets two Learners hold the same Topic, attempt number, settled Insight, running turn, Review card and saved item, but not one Learner twice", async () => {
    const db = await testDb();
    const [second] = await db.insert(learners).values({ name: "second" }).returning();
    const both = [OWNER_LEARNER_ID, second.id];
    const twiceRefused = async (insert: (learnerId: number) => Promise<unknown>) => {
      for (const learnerId of both) await insert(learnerId);
      await expect(insert(OWNER_LEARNER_ID)).rejects.toThrow();
    };

    await twiceRefused((learnerId) => db.insert(topicProgress).values({ learnerId, topicId: "percent", step: "story", status: "in_progress" }));
    await twiceRefused((learnerId) => db.insert(quizAttempts).values({ learnerId, checkId: "pv-quiz", attemptNo: 0, questionIds: [] }));
    let call = 0;
    await twiceRefused((learnerId) =>
      db.insert(insightAttempts).values({ learnerId, topicId: "present-value", reported: "found", released: "found", words: "w", toolCallId: `toolu_${call++}` }),
    );
    await twiceRefused((learnerId) => db.insert(turns).values({ learnerId, status: "running" }));
    const card = { due: new Date(), stability: 1, difficulty: 1, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, learningSteps: 0, state: 0 };
    await twiceRefused((learnerId) => db.insert(reviewCards).values({ learnerId, questionId: "q1", ...card }));
    await twiceRefused((learnerId) => db.insert(noteItems).values({ learnerId, topicId: "percent", kind: "reply", sessionId: null, turnSeq: 3 }));
    // The place on the Course Map and the Learner Profile: one row per Learner.
    for (const learnerId of both) await db.insert(learnerState).values({ id: learnerId, learnerId });
    await expect(db.insert(learnerState).values({ id: 99, learnerId: second.id })).rejects.toThrow();
    for (const learnerId of both) await db.insert(learnerProfile).values({ id: learnerId, learnerId });
    await expect(db.insert(learnerProfile).values({ id: 99, learnerId: second.id })).rejects.toThrow();
  });
});
