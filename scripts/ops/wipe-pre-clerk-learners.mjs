// One-off data wipe for the Clerk fresh start (issue #33, Phase 6). NOT a migration: a migration would also run on every
// test database, where the seeded Learner 1 has no Clerk user. Run by hand, once, after Clerk is live in production,
// the owner has signed in through Clerk, and a Neon snapshot is taken. Runbook: docs/runbooks/wipe-pre-clerk.md.
//
//   node --env-file=<file> scripts/ops/wipe-pre-clerk-learners.mjs                        dry run: counts only
//   node --env-file=<file> scripts/ops/wipe-pre-clerk-learners.mjs --execute \
//     --i-took-a-snapshot <snapshot name> --database-host <host the dry run printed> [--allow-empty]
//
// It deletes every Learner with no Clerk user (clerk_user_id is null: the passcode Learners and the Better Auth ones),
// every row of theirs in the tables that point at learners (directly, or through their Sessions and turns), and the
// Sign-up switch (settings.signup_open). Every delete runs in one transaction, checked before it commits. It reads
// DATABASE_URL_UNPOOLED only and never prints it, and it prints row counts only, never a row.
import { pathToFileURL } from "node:url";

export const USAGE = [
  "Usage: node --env-file=<file> scripts/ops/wipe-pre-clerk-learners.mjs [--execute --i-took-a-snapshot <name> --database-host <host> [--allow-empty]]",
  "  (no flags)              dry run: prints row counts before and after, deletes nothing",
  "  --execute               deletes, in one transaction",
  "  --i-took-a-snapshot     the Neon snapshot taken just before (required with --execute)",
  "  --database-host         the host the dry run printed, to confirm the database (required with --execute)",
  "  --allow-empty           run even though no Learner has a Clerk user yet (a rehearsal before Clerk is live)",
].join("\n");

/** The Learners this wipe deletes: every one with no Clerk user. */
const GONE_LEARNERS = "select id from learners where clerk_user_id is null";
const GONE_SESSIONS = `select id from sessions where learner_id in (${GONE_LEARNERS})`;
const GONE_TURNS = `select id from turns where learner_id in (${GONE_LEARNERS})`;
const BY_LEARNER = `learner_id in (${GONE_LEARNERS})`;
const BY_SESSION = `session_id in (${GONE_SESSIONS})`;

/**
 * Every delete, in an order the foreign keys allow (none of them cascades). Each step names its rows through the gone
 * Learners, so a step runs before the table its subquery reads is emptied: the rows that point at turns go before
 * `turns`, the rows that point at Sessions before `sessions`, and every Learner's row before `learners`.
 * `tool_calls` has no foreign key: its rows are tied to a Learner only through `turn_id`.
 */
export const WIPE_STEPS = [
  { table: "tool_calls", where: `turn_id in (${GONE_TURNS})` },
  { table: "pasted_texts", where: BY_LEARNER },
  { table: "session_items", where: BY_LEARNER },
  { table: "tutor_incidents", where: BY_LEARNER },
  { table: "messages", where: BY_SESSION },
  { table: "usage", where: BY_SESSION },
  { table: "reply_checks", where: BY_SESSION },
  { table: "topic_restarts", where: BY_LEARNER },
  { table: "learner_state", where: BY_LEARNER },
  { table: "note_items", where: BY_LEARNER },
  { table: "widget_state", where: BY_LEARNER },
  { table: "practice_answers", where: BY_LEARNER },
  { table: "turns", where: BY_LEARNER },
  { table: "topic_progress", where: BY_LEARNER },
  { table: "check_results", where: BY_LEARNER },
  { table: "misconceptions", where: BY_LEARNER },
  { table: "insight_attempts", where: BY_LEARNER },
  { table: "quiz_attempts", where: BY_LEARNER },
  { table: "review_cards", where: BY_LEARNER },
  { table: "review_log", where: BY_LEARNER },
  { table: "learner_profile", where: BY_LEARNER },
  { table: "skill_state", where: BY_LEARNER },
  { table: "skip_ahead_attempts", where: BY_LEARNER },
  { table: "sessions", where: BY_LEARNER },
  { table: "learners", where: "clerk_user_id is null" },
  { table: "settings", where: "key = 'signup_open'", label: "settings (signup_open)" },
];

const PLANNED = new Map(WIPE_STEPS.map((s) => [s.table, s]));

/** A quoted SQL identifier; refuses anything but a plain lowercase name, since these are spliced into SQL. */
function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Refusing an unexpected table or column name: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

async function count(client, text) {
  const { rows } = await client.query(text);
  return Number(rows[0].n);
}

/** Every foreign key in the public schema, one column each (the schema has no composite ones). */
export async function fkEdges(client) {
  const { rows } = await client.query(`
    select ch.relname as child, ca.attname as column, pa.relname as parent, pac.attname as parent_column
    from pg_constraint c
    join pg_class ch on ch.oid = c.conrelid
    join pg_class pa on pa.oid = c.confrelid
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
    join pg_attribute pac on pac.attrelid = c.confrelid and pac.attnum = c.confkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    order by 1, 2`);
  return rows.map((r) => ({ child: String(r.child), column: String(r.column), parent: String(r.parent), parentColumn: String(r.parent_column) }));
}

/** The tables that point at learners, directly or through other tables, that this wipe has no step for (schema drift). */
export function uncoveredTables(edges) {
  const reach = new Set(["learners"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) {
      if (reach.has(e.parent) && !reach.has(e.child)) {
        reach.add(e.child);
        grew = true;
      }
    }
  }
  return [...reach].filter((t) => !PLANNED.has(t)).sort();
}

/**
 * Row counts only: the Learners with and without a Clerk user, each step's rows now and to delete, the tables the wipe
 * would miss, and the kept rows that point at a row the wipe deletes (a foreign key would refuse those, or set them null).
 */
export async function survey(client) {
  const learners = {
    total: await count(client, "select count(*)::int as n from learners"),
    withClerk: await count(client, "select count(*)::int as n from learners where clerk_user_id is not null"),
  };
  learners.withoutClerk = learners.total - learners.withClerk;

  const steps = [];
  for (const step of WIPE_STEPS) {
    const before = await count(client, `select count(*)::int as n from ${ident(step.table)}`);
    const gone = await count(client, `select count(*)::int as n from ${ident(step.table)} where ${step.where}`);
    steps.push({ table: step.table, label: step.label ?? step.table, before, gone, after: before - gone });
  }

  const edges = await fkEdges(client);
  const blockers = [];
  for (const e of edges) {
    const parent = PLANNED.get(e.parent);
    if (!parent) continue;
    const kept = PLANNED.has(e.child) ? `not coalesce((${PLANNED.get(e.child).where}), false)` : "true";
    const rows = await count(
      client,
      `select count(*)::int as n from ${ident(e.child)} where ${kept} and ${ident(e.column)} in (select ${ident(e.parentColumn)} from ${ident(e.parent)} where ${parent.where})`,
    );
    if (rows > 0) blockers.push({ child: e.child, column: e.column, parent: e.parent, rows });
  }

  const unlinkedToolCalls = await count(client, "select count(*)::int as n from tool_calls where turn_id is null or turn_id not in (select id from turns)");
  return { learners, steps, uncovered: uncoveredTables(edges), blockers, unlinkedToolCalls };
}

/** Why --execute must not run on this survey; empty when it may. */
export function refusals(s, { allowEmpty = false } = {}) {
  const reasons = [];
  if (s.learners.withClerk === 0 && !allowEmpty) {
    reasons.push("No Learner has a Clerk user yet: Clerk must be live and the owner signed in first (or pass --allow-empty for a rehearsal).");
  }
  if (s.uncovered.length) reasons.push(`Tables point at learners that this wipe has no step for: ${s.uncovered.join(", ")}. Add them to WIPE_STEPS first.`);
  for (const b of s.blockers) reasons.push(`${b.rows} kept row(s) of ${b.child}.${b.column} point at ${b.parent} rows this wipe deletes.`);
  return reasons;
}

/** The survey, read in a read-only transaction so it cannot write. */
export async function dryRun(client) {
  await client.query("begin isolation level repeatable read read only");
  try {
    return await survey(client);
  } finally {
    await client.query("rollback");
  }
}

/**
 * Deletes, in one transaction: surveys again inside it, refuses on any refusal, runs every step, then checks each
 * step deleted what the survey counted and every table holds what it projected. Any mismatch rolls the whole wipe back.
 */
export async function wipe(client, { snapshot, allowEmpty = false } = {}) {
  if (!snapshot) throw new Error("Refusing to delete: name the snapshot you took with --i-took-a-snapshot <name>.");
  await client.query("begin isolation level repeatable read");
  try {
    await client.query("set local lock_timeout = '10s'");
    const before = await survey(client);
    const reasons = refusals(before, { allowEmpty });
    if (reasons.length) throw new Error(`Refusing to delete:\n- ${reasons.join("\n- ")}`);

    const deleted = [];
    for (const step of WIPE_STEPS) {
      const rows = await count(client, `with gone as (delete from ${ident(step.table)} where ${step.where} returning 1) select count(*)::int as n from gone`);
      deleted.push({ table: step.table, rows });
    }
    const after = [];
    for (const step of WIPE_STEPS) after.push({ table: step.table, rows: await count(client, `select count(*)::int as n from ${ident(step.table)}`) });

    const wrong = before.steps.flatMap((s, i) => {
      const out = [];
      if (deleted[i].rows !== s.gone) out.push(`${s.label}: deleted ${deleted[i].rows}, expected ${s.gone}`);
      if (after[i].rows !== s.after) out.push(`${s.label}: ${after[i].rows} rows left, expected ${s.after}`);
      return out;
    });
    const leftWithout = await count(client, "select count(*)::int as n from learners where clerk_user_id is null");
    if (leftWithout !== 0) wrong.push(`${leftWithout} Learner(s) with no Clerk user are still there`);
    if (wrong.length) throw new Error(`Rolled back: the counts did not match the survey:\n- ${wrong.join("\n- ")}`);

    await client.query("commit");
    return { before, deleted, after };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

const pad = (v, n) => String(v).padStart(n);

/** The survey as printable lines: counts only. */
export function formatSurvey(s) {
  const w = Math.max(...s.steps.map((r) => r.label.length), "table".length);
  return [
    `Learners: ${s.learners.total} in all; ${s.learners.withClerk} with a Clerk user (kept); ${s.learners.withoutClerk} without (deleted with their rows).`,
    ...(s.learners.withClerk === 0 ? ["WARNING: no Learner has a Clerk user yet; --execute refuses without --allow-empty."] : []),
    "",
    `${"table".padEnd(w)}  ${pad("rows now", 9)}  ${pad("to delete", 9)}  ${pad("after", 9)}`,
    ...s.steps.map((r) => `${r.label.padEnd(w)}  ${pad(r.before, 9)}  ${pad(r.gone, 9)}  ${pad(r.after, 9)}`),
    "",
    `tool_calls tied to no turn (kept; nothing ties them to a Learner): ${s.unlinkedToolCalls}`,
    `Tables pointing at learners with no step here: ${s.uncovered.length ? s.uncovered.join(", ") : "none"}`,
    `Kept rows pointing at deleted rows: ${s.blockers.length ? s.blockers.map((b) => `${b.child}.${b.column} -> ${b.parent} (${b.rows})`).join(", ") : "none"}`,
  ];
}

/** The command line; throws on anything it does not know. */
export function parseArgs(argv) {
  const args = { execute: false, allowEmpty: false, snapshot: undefined, databaseHost: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") args.execute = true;
    else if (a === "--allow-empty") args.allowEmpty = true;
    else if (a === "--i-took-a-snapshot" || a === "--database-host") {
      const value = argv[++i];
      if (!value || value.startsWith("-")) throw new Error(`${a} needs a value.\n${USAGE}`);
      if (a === "--i-took-a-snapshot") args.snapshot = value;
      else args.databaseHost = value;
    } else throw new Error(`Unknown argument: ${a}\n${USAGE}`);
  }
  return args;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL_UNPOOLED is not a URL.");
  }
}

async function connectNeon(url) {
  const { Client } = await import("@neondatabase/serverless");
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** The whole command: checks the flags and the target before it connects, then a dry run or the wipe. */
export async function run({ argv = process.argv.slice(2), env = process.env, log = console.log, connect = connectNeon } = {}) {
  const args = parseArgs(argv);
  const url = env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set. Pass it with node --env-file=<file>; this script never falls back to DATABASE_URL.");
  const host = hostOf(url);
  log(`Database target: ${host}`);
  if (args.execute) {
    if (!args.snapshot) throw new Error("Refusing to delete: name the snapshot you took with --i-took-a-snapshot <name>.");
    if (args.databaseHost !== host) {
      throw new Error(`Refusing to delete: --database-host ${args.databaseHost ? `names ${args.databaseHost}` : "is missing"}; pass --database-host ${host} to confirm this database.`);
    }
  }

  const client = await connect(url);
  try {
    if (!args.execute) {
      const s = await dryRun(client);
      log("DRY RUN: nothing was deleted.");
      for (const line of formatSurvey(s)) log(line);
      const reasons = refusals(s, { allowEmpty: args.allowEmpty });
      log(reasons.length ? `\n--execute would refuse:\n- ${reasons.join("\n- ")}` : "\n--execute would run. Take a snapshot first.");
      return s;
    }
    log(`EXECUTE: snapshot named ${args.snapshot}.`);
    const result = await wipe(client, { snapshot: args.snapshot, allowEmpty: args.allowEmpty });
    for (const line of formatSurvey(result.before)) log(line);
    const w = Math.max(...result.before.steps.map((r) => r.label.length), "table".length);
    log(`\nCommitted.\n${"table".padEnd(w)}  ${pad("deleted", 9)}  ${pad("rows left", 9)}`);
    for (const [i, d] of result.deleted.entries()) log(`${result.before.steps[i].label.padEnd(w)}  ${pad(d.rows, 9)}  ${pad(result.after[i].rows, 9)}`);
    return result;
  } finally {
    await client.end?.();
  }
}

/** An error's message only (the WebSocket driver throws an ErrorEvent, whose message sits on it or on its `error`). */
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return error?.message || error?.error?.message || String(error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`wipe-pre-clerk-learners: ${messageOf(error)}`);
    process.exit(1);
  });
}
