import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { Db } from "../db/types";

const EXPAND = "_learners_expand";

const temp: string[] = [];
const clients: PGlite[] = [];

/** Closes every database databaseBeforeExpand made and removes its copied migrations; call it in afterAll. */
export async function closeBeforeExpand(): Promise<void> {
  await Promise.allSettled(clients.splice(0).map((c) => c.close()));
  await Promise.allSettled(temp.splice(0).map((d) => rm(d, { recursive: true, force: true })));
}

/** A Postgres migrated up to just before the expand migration (spec #119): the database as production had it then. */
export async function databaseBeforeExpand(): Promise<{ client: PGlite; db: Db }> {
  return databaseBefore(EXPAND);
}

/** A Postgres migrated up to just before the migration whose tag ends with `tagEnd` (tags, not numbers: numbers move on rebase). */
export async function databaseBefore(tagEnd: string): Promise<{ client: PGlite; db: Db }> {
  const dir = await mkdtemp(join(tmpdir(), "finance-agent-before-expand-"));
  temp.push(dir);
  await cp("drizzle", dir, { recursive: true });
  const journalFile = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalFile, "utf8")) as { entries: { tag: string }[] };
  const at = journal.entries.findIndex((e) => e.tag.endsWith(tagEnd));
  if (at <= 0) throw new Error(`The ${tagEnd} migration is not in the journal.`);
  journal.entries = journal.entries.slice(0, at);
  await writeFile(journalFile, JSON.stringify(journal));
  const client = new PGlite({ extensions: { vector } });
  clients.push(client);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: dir });
  return { client, db: db as unknown as Db };
}

/** Applies every migration from the expand on, as production did. */
export async function migrateToLatest(client: PGlite): Promise<void> {
  await migrate(drizzle({ client, schema }), { migrationsFolder: "./drizzle" });
}

/** Rows written the way the code live before the expand wrote them: with no Learner id, which didn't exist. */
export async function rowsFromBefore(client: PGlite): Promise<void> {
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
