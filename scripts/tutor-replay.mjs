// The 50-turn replay (spec #229, ticket #248). Run on the laptop, where .env holds DATABASE_URL and ANTHROPIC_API_KEY:
//   npm run tutor:replay -- [--turns 50] [--model claude-opus-5-5] [--effort medium] [--engine on|off] [--budget 10] [--fetch-only]
//
// 1. Reads the last Learner turns from the stored Sessions. Read-only: only select statements, nothing is written.
//    A turn counts as a Learner turn when it has the Learner's own words (not a note code wrote, like "Opener by code:").
// 2. Turns each into a live case with caseFromSession (the state the Learner had when they sent it) and writes them to
//    evidence/tutor-eval/replay-cases.json (git-ignored: it holds Learner messages).
// 3. Starts src/behaviour/tutor-eval/sweep-replay.live.ts with the database address REMOVED from its environment, so the
//    replay itself can only touch a throwaway in-memory Postgres. It sends each case through the real Tutor Turn,
//    runs fixReply and checkReply on the reply, and writes evidence/tutor-eval/replay-latest.md: the pass rate per rule
//    (V1 to V7), the longest reply and every failure in full.
// --model/--effort/--engine default to the production defaults (DEFAULT_SETTINGS); pass the setting the sweep chose.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { neon } from "@neondatabase/serverless";
import { parse } from "yaml";
import { caseFromSession } from "../src/behaviour/tutor-eval/from-session.ts";
import { parseCase } from "../src/behaviour/tutor-eval/case.ts";

const { values: args } = parseArgs({
  options: {
    turns: { type: "string", default: "50" },
    model: { type: "string" },
    effort: { type: "string" },
    engine: { type: "string" },
    budget: { type: "string" },
    "fetch-only": { type: "boolean", default: false },
  },
});
const count = Number(args.turns);
if (!Number.isInteger(count) || count < 1) throw new Error("--turns must be a whole number of 1 or more.");
if (args.engine && !["on", "off"].includes(args.engine)) throw new Error('--engine must be "on" or "off".');

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED && existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set, in .env or the environment.");
const sql = neon(url);

/** A note code wrote as the turn's user message, not the Learner's words (same pattern as from-session.ts). */
const CODE_NOTE = /^[A-Z][A-Za-z -]{0,40} by code:/;
const iso = (d) => (d instanceof Date ? d.toISOString() : d === null ? null : new Date(d).toISOString());

// More rows than needed, because code-written turns are dropped.
const recent = await sql`select t.id, t.learner_id, t.session_id, t.turn_seq, t.input, t.started_at, s.topic_id from turns t join sessions s on s.id = t.session_id where t.input is not null and s.topic_id is not null order by t.id desc limit ${count * 4}`;
const learnerTurns = recent.filter((t) => t.input.trim() && !CODE_NOTE.test(t.input)).slice(0, count);
if (!learnerTurns.length) throw new Error("No Learner turns found in the stored Sessions.");

const sessionRows = new Map();
async function rowsFor(turn) {
  const key = `${turn.session_id}:${turn.learner_id}:${turn.topic_id}`;
  if (!sessionRows.has(key)) {
    const [turns, messages, items, attempts, practice, methods] = await Promise.all([
      sql`select turn_seq, input from turns where session_id = ${turn.session_id} order by turn_seq`,
      sql`select seq, role, content from messages where session_id = ${turn.session_id} order by seq`,
      sql`select after_seq, kind, data from session_items where session_id = ${turn.session_id} order by after_seq, id`,
      sql`select check_id, question_ids, created_at, submitted_at, correct_count, passed from quiz_attempts where learner_id = ${turn.learner_id} order by id`,
      sql`select skill_id, verdict, created_at from practice_answers where learner_id = ${turn.learner_id} and topic_id = ${turn.topic_id} order by id`,
      sql`select skill_id, methods_used from skill_state where learner_id = ${turn.learner_id} and topic_id = ${turn.topic_id}`,
    ]);
    sessionRows.set(key, { turns, messages, items, attempts, practice, methods });
  }
  return sessionRows.get(key);
}

const cases = [];
const skipped = [];
for (const [i, turn] of learnerTurns.reverse().entries()) {
  const id = `R${String(i + 1).padStart(2, "0")}`;
  const topicFile = join(process.cwd(), "course", "topics", `${turn.topic_id}.yaml`);
  if (!existsSync(topicFile)) {
    skipped.push(`${id}: the Topic ${turn.topic_id} has no file any more`);
    continue;
  }
  const checkIds = (parse(readFileSync(topicFile, "utf8")).checks ?? []).map((c) => c.id);
  const r = await rowsFor(turn);
  const c = caseFromSession(
    {
      topicId: turn.topic_id,
      checkIds,
      turn: { turnSeq: turn.turn_seq, input: turn.input, startedAt: iso(turn.started_at) },
      turns: r.turns.filter((t) => t.turn_seq < turn.turn_seq).map((t) => ({ turnSeq: t.turn_seq, input: t.input })),
      messages: r.messages.filter((m) => m.seq < turn.turn_seq).map((m) => ({ seq: m.seq, role: m.role, content: m.content })),
      items: r.items.map((x) => ({ afterSeq: x.after_seq, kind: x.kind, data: x.data })),
      quizAttempts: r.attempts.map((a) => ({ checkId: a.check_id, questionIds: a.question_ids, createdAt: iso(a.created_at), submittedAt: iso(a.submitted_at), correctCount: a.correct_count, passed: a.passed })),
      practice: r.practice.map((p) => ({ skillId: p.skill_id, verdict: p.verdict, createdAt: iso(p.created_at) })),
      skillMethods: r.methods.map((m) => ({ skillId: m.skill_id, methodsUsed: m.methods_used ?? [] })),
    },
    { id, title: `Turn ${turn.id} of Session ${turn.session_id}`, historyTurns: 3 },
  );
  const checked = parseCase(JSON.stringify(c), id);
  if (checked.errors.length) skipped.push(`${id}: ${checked.errors.join("; ")}`);
  else cases.push(c);
}
for (const s of skipped) console.warn(`Skipped ${s}`);
if (!cases.length) throw new Error("None of the turns made a valid case.");

const out = process.env.TUTOR_EVAL_OUT ?? join(process.cwd(), "evidence", "tutor-eval");
mkdirSync(out, { recursive: true });
const casesFile = join(out, "replay-cases.json");
writeFileSync(casesFile, `${JSON.stringify(cases, null, 2)}\n`);
console.log(`Read ${learnerTurns.length} Learner turns (${cases.length} usable) from the stored Sessions; cases in ${casesFile}.`);
if (args["fetch-only"]) process.exit(0);

// The replay gets no database address: it can only use a throwaway in-memory Postgres.
const env = { ...process.env, TUTOR_REPLAY_CASES: casesFile, TUTOR_EVAL_OUT: out };
for (const key of Object.keys(env)) if (/^(DATABASE_URL|DIRECT_URL|POSTGRES_|PG[A-Z]*$|NEON_)/.test(key)) delete env[key];
if (args.model) env.TUTOR_REPLAY_MODEL = args.model;
if (args.effort) env.TUTOR_REPLAY_EFFORT = args.effort;
if (args.engine) env.TUTOR_REPLAY_WIDGET_ENGINE = args.engine;
if (args.budget) env.TUTOR_REPLAY_BUDGET_USD = args.budget;
const child = spawn(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "-c", "vitest.tutor-sweep.config.ts", "src/behaviour/tutor-eval/sweep-replay.live.ts"],
  { env, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
