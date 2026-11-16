import type { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import { closeBeforeExpand, databaseBefore, migrateToLatest } from "@/test/before-expand";

/**
 * The Clerk contract step (issue #33, PR C, migration 0040_clerk_contract): it drops the Better Auth tables, the invite
 * list, the old model comparison tables and `learners.auth_user_id`, even when they hold rows, and keeps
 * `login_failures` (the test door) and every Learner.
 */

afterAll(closeBeforeExpand);

const DROPPED = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
  "email_link_sends",
  "invites",
  "access_denials",
  "model_comparison_runs",
  "model_comparison_answers",
];

/** One row in every table the migration drops, a Learner linked to the Better Auth `user`, and a Clerk-linked Learner with a row of its own. */
async function rowsEverywhere(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO "user" (id, name, email) VALUES ('u1', 'Ana', 'ana@example.com');
    INSERT INTO session (id, expires_at, token, updated_at, user_id) VALUES ('s1', now(), 't1', now(), 'u1');
    INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES ('a1', 'g1', 'google', 'u1', now());
    INSERT INTO verification (id, identifier, value, expires_at) VALUES ('v1', 'state', 'v', now());
    INSERT INTO access_denials (user_id) VALUES ('u1');
    INSERT INTO invites (email, learner_name) VALUES ('ben@example.com', 'ben');
    INSERT INTO rate_limit (id, key, count, last_request) VALUES ('r1', '1.2.3.4/sign-in', 1, 1794700000000);
    INSERT INTO email_link_sends (email_hash) VALUES ('hmac');
    INSERT INTO model_comparison_runs (models, grader_model, fingerprint, report, recommendation, total_cost_usd)
      VALUES ('["m1"]', 'g', 'f', 'report', 'keep m1', 1.5);
    INSERT INTO model_comparison_answers (run_id, question_id, source, model, turns, answer, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, turn_count, cost_usd, duration_ms, correctness, give_away, past_only, reasons, grader_cost_usd)
      SELECT id, 'q1', 'own', 'm1', '[]', 'a', 1, 1, 0, 0, 1, 0.1, 10, 'pass', 'pass', 'pass', 'r', 0.01 FROM model_comparison_runs;
    INSERT INTO learners (name, auth_user_id) VALUES ('google-ana', 'u1');
    INSERT INTO learners (name, clerk_user_id, show_developer_details) VALUES ('clerk-cara', 'user_clerk_1', true);
    INSERT INTO note_items (learner_id, topic_id, kind, text) SELECT id, 'present-value', 'line', 'my line' FROM learners WHERE name = 'clerk-cara';
    INSERT INTO login_failures (ip, at) VALUES ('1.2.3.4', now()), ('5.6.7.8', now());
  `);
}

const count = async (client: PGlite, query: string) => (await client.query<{ n: number }>(query)).rows[0].n;
const tablesLeft = async (client: PGlite) =>
  (await client.query<{ t: string }>(`select t from unnest($1::text[]) as t where to_regclass(format('public.%I', t)) is not null order by t`, [DROPPED])).rows.map((r) => r.t);
const learnerColumns = async (client: PGlite) =>
  (await client.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'learners' order by 1`)).rows.map((r) => r.c);
const learnerRows = (client: PGlite) =>
  client
    .query<Record<string, unknown>>(`select id, name, archived_at, show_developer_details, clerk_user_id, created_at from learners order by id`)
    .then((r) => r.rows);
const loginFailureRows = (client: PGlite) => client.query(`select id, ip, at from login_failures order by id`).then((r) => r.rows);

describe("the Clerk contract migration (issue #33, PR C)", () => {
  it("drops the ten tables and learners.auth_user_id with rows in them, and keeps login_failures and every Learner", async () => {
    const { client } = await databaseBefore("_clerk_contract");
    await rowsEverywhere(client);
    const learnersBefore = await learnerRows(client);
    const failuresBefore = await loginFailureRows(client);
    expect(learnersBefore).toHaveLength(3); // owner (made by the expand migration), google-ana, clerk-cara
    expect(await tablesLeft(client)).toEqual([...DROPPED].sort());
    expect(await learnerColumns(client)).toContain("auth_user_id");

    await migrateToLatest(client);

    expect(await tablesLeft(client)).toEqual([]);
    expect(await learnerColumns(client)).not.toContain("auth_user_id");
    expect(await count(client, `select count(*)::int as n from pg_constraint where conname = 'learners_auth_user_id_user_id_fk'`)).toBe(0);
    expect(await count(client, `select count(*)::int as n from pg_indexes where indexname = 'learners_one_active_per_auth_user'`)).toBe(0);

    // Every Learner keeps every column it still has; the Clerk-linked one also keeps its own rows.
    expect(await learnerRows(client)).toEqual(learnersBefore);
    const clerkLinked = (rows: Record<string, unknown>[]) => rows.filter((r) => r.clerk_user_id !== null);
    expect(clerkLinked(await learnerRows(client))).toEqual(clerkLinked(learnersBefore));
    expect(clerkLinked(learnersBefore)).toHaveLength(1);
    expect(await count(client, `select count(*)::int as n from note_items n join learners l on l.id = n.learner_id where l.clerk_user_id = 'user_clerk_1'`)).toBe(1);
    expect(await count(client, `select count(*)::int as n from learners where clerk_user_id is null and name = 'google-ana'`)).toBe(1);

    // The test door's table, its index and its rows stay.
    expect(await loginFailureRows(client)).toEqual(failuresBefore);
    expect(await count(client, `select count(*)::int as n from pg_indexes where indexname = 'login_failures_at'`)).toBe(1);
  });

  it("fails closed with no CASCADE: an unknown object on a dropped table rolls the whole migration back", async () => {
    const { client } = await databaseBefore("_clerk_contract");
    await rowsEverywhere(client);
    await client.exec(`CREATE VIEW invite_emails AS SELECT email FROM invites;`);
    const applied = await count(client, `select count(*)::int as n from drizzle.__drizzle_migrations`);

    const error = await migrateToLatest(client).then(
      () => undefined,
      (e: unknown) => e as { message?: string; cause?: { message?: string } },
    );
    expect(`${error?.message ?? ""} ${error?.cause?.message ?? ""}`).toMatch(/DROP TABLE "invites"[\s\S]*cannot drop table invites because other objects depend on it/);

    expect(await tablesLeft(client)).toEqual([...DROPPED].sort());
    expect(await learnerColumns(client)).toContain("auth_user_id");
    expect(await count(client, `select count(*)::int as n from learners where auth_user_id = 'u1'`)).toBe(1);
    expect(await count(client, `select count(*)::int as n from invites`)).toBe(1);
    expect(await count(client, `select count(*)::int as n from drizzle.__drizzle_migrations`)).toBe(applied);
  });
});
