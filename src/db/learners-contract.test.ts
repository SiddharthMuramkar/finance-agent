import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "./schema";

/**
 * The contract step (spec #119, "Database changes: expand, then contract"): the owner defaults are
 * dropped, so no row of a Learner's data is ever written without a Learner.
 */

const clients: PGlite[] = [];
afterAll(async () => {
  await Promise.allSettled(clients.map((c) => c.close()));
});

async function migrated() {
  const client = new PGlite({ extensions: { vector } });
  clients.push(client);
  await migrate(drizzle({ client, schema }), { migrationsFolder: "./drizzle" });
  // A Session and a turn for the rows below to point at, written with the owner named.
  await client.exec(`
    INSERT INTO sessions (learner_id, instructions, tools, model, effort, fingerprint) VALUES (1, 'i', '[]', 'm', 'medium', 'f');
    INSERT INTO turns (learner_id, session_id, turn_seq, status) VALUES (1, 1, 0, 'finished');
  `);
  return client;
}

/** One row per Learner-owned table, written as code that forgot the Learner would write it. */
const withoutALearner: Record<string, string> = {
  sessions: `INSERT INTO sessions (instructions, tools, model, effort, fingerprint) VALUES ('i', '[]', 'm', 'medium', 'f')`,
  turns: `INSERT INTO turns (session_id, turn_seq, status) VALUES (1, 1, 'finished')`,
  learner_state: `INSERT INTO learner_state (id, current_topic_id) VALUES (1, 'present-value')`,
  topic_progress: `INSERT INTO topic_progress (topic_id, step, status) VALUES ('present-value', 'concept', 'in_progress')`,
  check_results: `INSERT INTO check_results (topic_id, check_id, passed) VALUES ('present-value', 'pv-quiz', true)`,
  quiz_attempts: `INSERT INTO quiz_attempts (check_id, attempt_no, question_ids) VALUES ('pv-quiz', 0, '["q1"]')`,
  misconceptions: `INSERT INTO misconceptions (topic_id, description, model, tool_call_id) VALUES ('present-value', 'd', 'm', 'toolu_1')`,
  insight_attempts: `INSERT INTO insight_attempts (topic_id, reported, released, words, tool_call_id) VALUES ('present-value', 'found', 'found', 'w', 'toolu_2')`,
  review_cards: `INSERT INTO review_cards (question_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state) VALUES ('q1', now(), 1, 1, 0, 0, 0, 0, 0, 0)`,
  review_log: `INSERT INTO review_log (question_id, rating, source, reviewed_at) VALUES ('q1', 3, 'quiz', now())`,
  note_items: `INSERT INTO note_items (topic_id, kind, text) VALUES ('present-value', 'line', 'my line')`,
  learner_profile: `INSERT INTO learner_profile (id, work) VALUES (1, 'teacher')`,
  pasted_texts: `INSERT INTO pasted_texts (turn_id, session_id, text, words) VALUES (1, 1, 'pasted', 1)`,
  session_items: `INSERT INTO session_items (session_id, after_seq, kind, data) VALUES (1, 0, 'step_divider', '{}')`,
  widget_state: `INSERT INTO widget_state (session_id, widget_key, values, ticked) VALUES (1, 'pv-annuity', '{}', '[]')`,
};

describe("database contract: no row without a Learner", () => {
  it("refuses a row of any Learner's data that names no Learner", async () => {
    const client = await migrated();
    for (const [table, insert] of Object.entries(withoutALearner)) {
      await expect(client.exec(insert), table).rejects.toThrow(/learner_id/);
    }
  });

  it("still takes the same rows when they name their Learner", async () => {
    const client = await migrated();
    for (const [table, insert] of Object.entries(withoutALearner)) {
      const named = insert.replace(/\(([a-z_, ]+)\) VALUES \(/, "(learner_id, $1) VALUES (1, ");
      await expect(client.exec(named), table).resolves.toBeDefined();
    }
  });
});
