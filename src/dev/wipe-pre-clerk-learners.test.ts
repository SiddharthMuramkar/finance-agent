import type { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { dryRun, fkEdges, parseArgs, run, survey, uncoveredTables, wipe, WIPE_STEPS, type WipeClient } from "../../scripts/ops/wipe-pre-clerk-learners.mjs";
import { testDb } from "@/test/pglite";

/**
 * The one-off fresh-start wipe (issue #33, Phase 6): every Learner with no Clerk user goes, with every row of theirs,
 * and the Clerk-linked Learners keep everything. Seeded with one row per Learner in every table the wipe touches.
 */

async function freshClient(): Promise<PGlite> {
  const db = await testDb();
  return (db as unknown as { $client: PGlite }).$client;
}

const n = async (c: PGlite, text: string, params: unknown[] = []) => Number((await c.query<{ n: number }>(text, params)).rows[0].n);

/** One Learner with one row in every table that holds Learner data (its name keeps the unique tool call ids apart). */
async function seedLearner(c: PGlite, name: string, clerkUserId: string | null) {
  const id = async (text: string, params: unknown[]) => (await c.query<{ id: number }>(text, params)).rows[0].id;
  const learner = await id("insert into learners (name, clerk_user_id) values ($1, $2) returning id", [name, clerkUserId]);
  const session = await id(
    "insert into sessions (learner_id, instructions, tools, model, effort, fingerprint, topic_id, older) values ($1, 'i', '[]', 'm', 'medium', 'f', 'present-value', false) returning id",
    [learner],
  );
  const turn = await id("insert into turns (learner_id, session_id, turn_seq, status) values ($1, $2, 1, 'finished') returning id", [learner, session]);
  const tag = `${name}-call`;
  const rows: [string, unknown[]][] = [
    ["insert into messages (session_id, seq, role, content) values ($1, 1, 'user', '\"hi\"'::jsonb)", [session]],
    [
      "insert into usage (session_id, turn_seq, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, tools, duration_ms) values ($1, 1, 'turn', 'm', 1, 1, 0, 0, '[]', 5)",
      [session],
    ],
    ["insert into reply_checks (session_id, turn_seq, words, cap, shown_text) values ($1, 1, 3, 100, 'shown')", [session]],
    ["insert into topic_restarts (learner_id, topic_id, session_id, attempt_no, snapshot) values ($1, 'present-value', $2, 1, '{}')", [learner, session]],
    ["insert into learner_state (id, learner_id, current_topic_id, shown_session_id) values ($1, $1, 'present-value', $2)", [learner, session]],
    ["insert into topic_progress (learner_id, topic_id, step, status) values ($1, 'present-value', 'concept', 'in_progress')", [learner]],
    ["insert into check_results (learner_id, topic_id, check_id, passed, tool_call_id) values ($1, 'present-value', 'pv-quiz', true, $2)", [learner, `${tag}-check`]],
    ["insert into misconceptions (learner_id, topic_id, description, model, tool_call_id) values ($1, 'present-value', 'd', 'm', $2)", [learner, `${tag}-misc`]],
    [
      "insert into insight_attempts (learner_id, topic_id, reported, released, words, tool_call_id, turn_id) values ($1, 'present-value', 'found', 'found', 'w', $2, $3)",
      [learner, `${tag}-insight`, turn],
    ],
    ["insert into quiz_attempts (learner_id, check_id, attempt_no, question_ids) values ($1, 'pv-quiz', 0, '[\"q1\"]')", [learner]],
    [
      "insert into review_cards (learner_id, question_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state) values ($1, 'q1', now(), 1, 1, 0, 0, 0, 0, 0, 0)",
      [learner],
    ],
    ["insert into review_log (learner_id, question_id, rating, source, reviewed_at) values ($1, 'q1', 3, 'quiz', now())", [learner]],
    ["insert into pasted_texts (learner_id, turn_id, session_id, text, words) values ($1, $2, $3, 'words from an article', 4)", [learner, turn, session]],
    ["insert into learner_profile (id, learner_id, work) values ($1, $1, 'teacher')", [learner]],
    ["insert into note_items (learner_id, topic_id, kind, text) values ($1, 'present-value', 'line', 'my private line')", [learner]],
    ["insert into session_items (learner_id, session_id, after_seq, kind, data, turn_id, stored_by) values ($1, $2, 0, 'step_divider', '{}', $3, 'code')", [learner, session, turn]],
    ["insert into widget_state (session_id, widget_key, learner_id) values ($1, 'pv-annuity', $2)", [session, learner]],
    ["insert into skill_state (learner_id, topic_id, skill_id) values ($1, 'present-value', 'discount')", [learner]],
    [
      "insert into practice_answers (learner_id, topic_id, skill_id, session_id, item_key, item_id, input, verdict, source) values ($1, 'present-value', 'discount', $2, 'k1', 'i1', '5', 'right', 'quick_try')",
      [learner, session],
    ],
    ["insert into tutor_incidents (learner_id, session_id, turn_id, kind) values ($1, $2, $3, 'replay_stripped_after_refusal')", [learner, session, turn]],
    ["insert into skip_ahead_attempts (learner_id, topic_id, day) values ($1, 'present-value', '2026-11-15')", [learner]],
    ["insert into tool_calls (tool_call_id, name, result, is_error, turn_id) values ($1, 'record_check', 'ok', false, $2)", [`${tag}-tool`, turn]],
  ];
  for (const [text, params] of rows) await c.query(text, params);
  return { learner, session, turn };
}

/** The migrated database's own Learner 1 (no Clerk user), a Clerk-linked Learner and a pre-Clerk one, and two settings. */
async function seeded() {
  const c = await freshClient();
  const kept = await seedLearner(c, "clerk-person", "user_clerk_kept");
  const gone = await seedLearner(c, "old-person", null);
  await c.query("insert into settings (key, value) values ('signup_open', 'off'), ('tutor_model', 'm')");
  return { c, kept, gone };
}

/** Rows per table, for every table the wipe touches. */
async function totals(c: PGlite) {
  const out: Record<string, number> = {};
  for (const s of WIPE_STEPS) out[s.table] = await n(c, `select count(*)::int as n from "${s.table}"`);
  return out;
}

const LEARNER_TABLES = WIPE_STEPS.map((s) => s.table).filter((t) => !["tool_calls", "messages", "usage", "reply_checks", "learners", "settings"].includes(t));
const SESSION_ONLY_TABLES = ["messages", "usage", "reply_checks"];

describe("wipe-pre-clerk-learners: the plan", () => {
  it("has a step for every table that points at learners, directly or through other tables", async () => {
    const c = await freshClient();
    const edges = await fkEdges(c);
    expect(uncoveredTables(edges)).toEqual([]);
    // And no step for a table that does not point at learners, apart from the three it names on purpose.
    const reach = new Set(["learners"]);
    for (let size = 0; size !== reach.size; ) {
      size = reach.size;
      for (const e of edges) if (reach.has(e.parent)) reach.add(e.child);
    }
    expect(WIPE_STEPS.map((s) => s.table).filter((t) => !reach.has(t))).toEqual(["tool_calls", "settings"]);
  });

  it("sees a table added later that points at learners, and refuses to run", async () => {
    const { c } = await seeded();
    await c.query("create table later_learner_rows (id serial primary key, learner_id integer not null references learners(id))");
    await c.query("insert into later_learner_rows (learner_id) select id from learners where clerk_user_id is null");
    const s = await survey(c);
    expect(s.uncovered).toEqual(["later_learner_rows"]);
    const before = await totals(c);
    await expect(wipe(c, { snapshot: "snap" })).rejects.toThrow(/later_learner_rows/);
    expect(await totals(c)).toEqual(before);
  });
});

describe("wipe-pre-clerk-learners: dry run", () => {
  it("counts each table's rows now, to delete and after, and deletes nothing", async () => {
    const { c } = await seeded();
    const before = await totals(c);
    const s = await dryRun(c);
    expect(s.learners).toEqual({ total: 3, withClerk: 1, withoutClerk: 2 });
    for (const step of s.steps) {
      const gone = step.table === "learners" ? 2 : 1; // Learner 1 from the migrations has no rows, only itself.
      expect([step.table, step.before, step.gone, step.after]).toEqual([step.table, before[step.table], gone, 1]);
    }
    expect(s.blockers).toEqual([]);
    expect(s.uncovered).toEqual([]);
    expect(await totals(c)).toEqual(before);
  });
});

describe("wipe-pre-clerk-learners: execute", () => {
  it("leaves only the Clerk-linked Learner's rows, as many as the dry run said, untouched", async () => {
    const { c, kept } = await seeded();
    const planned = await dryRun(c);
    const result = await wipe(c, { snapshot: "before-wipe" });

    expect(result.deleted.map((d) => d.rows)).toEqual(planned.steps.map((s) => s.gone));
    expect(result.after.map((a) => a.rows)).toEqual(planned.steps.map((s) => s.after));
    expect(await totals(c)).toEqual(Object.fromEntries(planned.steps.map((s) => [s.table, s.after])));

    expect((await c.query("select id, clerk_user_id from learners")).rows).toEqual([{ id: kept.learner, clerk_user_id: "user_clerk_kept" }]);
    for (const t of LEARNER_TABLES) expect(await n(c, `select count(*)::int as n from "${t}" where learner_id <> $1`, [kept.learner]), t).toBe(0);
    for (const t of SESSION_ONLY_TABLES) expect(await n(c, `select count(*)::int as n from "${t}" where session_id <> $1`, [kept.session]), t).toBe(0);
    expect(await n(c, "select count(*)::int as n from tool_calls where turn_id <> $1", [kept.turn])).toBe(0);
    expect((await c.query("select key from settings order by key")).rows).toEqual([{ key: "tutor_model" }]);
    // The kept rows still point where they did: nothing of theirs was set null.
    expect((await c.query("select turn_id from session_items")).rows).toEqual([{ turn_id: kept.turn }]);
    expect((await c.query("select turn_id from tutor_incidents")).rows).toEqual([{ turn_id: kept.turn }]);
  });

  it("refuses while no Learner has a Clerk user, unless allowed (a rehearsal before Clerk is live)", async () => {
    const c = await freshClient();
    await seedLearner(c, "old-person", null);
    const before = await totals(c);
    await expect(wipe(c, { snapshot: "snap" })).rejects.toThrow(/No Learner has a Clerk user/);
    expect(await totals(c)).toEqual(before);

    await wipe(c, { snapshot: "snap", allowEmpty: true });
    expect(Object.values(await totals(c)).every((rows) => rows === 0)).toBe(true);
  });

  it("refuses without a snapshot name", async () => {
    const { c } = await seeded();
    const before = await totals(c);
    await expect(wipe(c, { snapshot: undefined })).rejects.toThrow(/--i-took-a-snapshot/);
    expect(await totals(c)).toEqual(before);
  });

  it("refuses, deleting nothing, when a kept row points at a row the wipe would delete", async () => {
    const { c, kept, gone } = await seeded();
    await c.query("insert into note_items (learner_id, topic_id, kind, session_id, turn_seq) values ($1, 'present-value', 'reply', $2, 1)", [kept.learner, gone.session]);
    const s = await survey(c);
    expect(s.blockers).toEqual([{ child: "note_items", column: "session_id", parent: "sessions", rows: 1 }]);
    const before = await totals(c);
    await expect(wipe(c, { snapshot: "snap" })).rejects.toThrow(/note_items\.session_id point at sessions/);
    expect(await totals(c)).toEqual(before);
  });

  it("is one transaction: a failure half-way through deletes nothing", async () => {
    const { c } = await seeded();
    const before = await totals(c);
    let deletes = 0;
    const failing: WipeClient = {
      query: async (text) => {
        if (text.startsWith("with gone as (delete") && ++deletes === 10) throw new Error("connection lost");
        return c.query(text);
      },
    };
    await expect(wipe(failing, { snapshot: "snap" })).rejects.toThrow(/connection lost/);
    expect(deletes).toBe(10);
    expect(await totals(c)).toEqual(before);
  });
});

describe("wipe-pre-clerk-learners: the command", () => {
  const env = { DATABASE_URL_UNPOOLED: "postgres://owner:s3cret-pass@ep-main.example.neon.tech/neondb" };

  it("dry-runs by default, printing the host and counts only: no password, URL or row content", async () => {
    const { c } = await seeded();
    const lines: string[] = [];
    await run({ argv: [], env, log: (l) => lines.push(l), connect: async () => c });
    const out = lines.join("\n");
    expect(out).toContain("Database target: ep-main.example.neon.tech");
    expect(out).toContain("DRY RUN");
    for (const secret of ["s3cret-pass", "postgres://", "old-person", "clerk-person", "user_clerk_kept", "my private line", "words from an article"]) expect(out).not.toContain(secret);
    expect(await n(c, "select count(*)::int as n from learners")).toBe(3);
  });

  it("checks the flags and the host before it connects", async () => {
    let connected = false;
    const connect = async () => {
      connected = true;
      throw new Error("should not connect");
    };
    const quiet = () => {};
    await expect(run({ argv: ["--execute"], env, log: quiet, connect })).rejects.toThrow(/--i-took-a-snapshot/);
    await expect(run({ argv: ["--execute", "--i-took-a-snapshot", "s"], env, log: quiet, connect })).rejects.toThrow(/--database-host ep-main\.example\.neon\.tech/);
    await expect(run({ argv: ["--execute", "--i-took-a-snapshot", "s", "--database-host", "ep-branch.example"], env, log: quiet, connect })).rejects.toThrow(/names ep-branch\.example/);
    await expect(run({ argv: [], env: { DATABASE_URL: env.DATABASE_URL_UNPOOLED }, log: quiet, connect })).rejects.toThrow(/DATABASE_URL_UNPOOLED is not set/);
    expect(connected).toBe(false);
  });

  it("deletes with --execute, the snapshot named and the host confirmed", async () => {
    const { c } = await seeded();
    const lines: string[] = [];
    await run({ argv: ["--execute", "--i-took-a-snapshot", "pre-wipe", "--database-host", "ep-main.example.neon.tech"], env, log: (l) => lines.push(l), connect: async () => c });
    expect(lines.join("\n")).toContain("Committed.");
    expect(await n(c, "select count(*)::int as n from learners where clerk_user_id is null")).toBe(0);
  });

  it("parses its flags and refuses anything else", () => {
    expect(parseArgs(["--execute", "--i-took-a-snapshot", "snap", "--database-host", "h", "--allow-empty"])).toEqual({
      execute: true,
      allowEmpty: true,
      snapshot: "snap",
      databaseHost: "h",
    });
    expect(() => parseArgs(["--i-took-a-snapshot"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--i-took-a-snapshot", "--execute"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--yes"])).toThrow(/Unknown argument/);
  });
});
