// Turns one stored Session turn into a live Tutor test case (ticket #236), so a Session that went badly becomes a test.
// Run on the laptop, where .env holds DATABASE_URL (it is read only to look the turn up; nothing is written to the database):
//   node scripts/tutor-eval-from-session.mjs --turn <turn id> --id T12 [--title "..."] [--history 3] [--out <file>]
//   node scripts/tutor-eval-from-session.mjs --session <session id> --seq <turn seq> --id T12
// It writes src/behaviour/tutor-eval/cases/<id>.json (or --out). Then add the pass conditions the Session broke,
// and run it with TUTOR_EVAL_ONLY=<id> npm run tutor:eval.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { neon } from "@neondatabase/serverless";
import { parse } from "yaml";
import { caseFromSession } from "../src/behaviour/tutor-eval/from-session.ts";
import { parseCase } from "../src/behaviour/tutor-eval/case.ts";

const { values: args } = parseArgs({
  options: {
    turn: { type: "string" },
    session: { type: "string" },
    seq: { type: "string" },
    id: { type: "string" },
    title: { type: "string" },
    history: { type: "string", default: "3" },
    out: { type: "string" },
  },
});
const usage = "Usage: node scripts/tutor-eval-from-session.mjs (--turn <turn id> | --session <session id> --seq <turn seq>) --id <case id> [--title ...] [--history N] [--out file]";
if (!args.id || !(args.turn || (args.session && args.seq))) {
  console.error(usage);
  process.exit(1);
}

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED && existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set, in .env or the environment.");
const sql = neon(url);

const [turn] = args.turn
  ? await sql`select t.id, t.learner_id, t.session_id, t.turn_seq, t.input, t.started_at, s.topic_id from turns t join sessions s on s.id = t.session_id where t.id = ${Number(args.turn)}`
  : await sql`select t.id, t.learner_id, t.session_id, t.turn_seq, t.input, t.started_at, s.topic_id from turns t join sessions s on s.id = t.session_id where t.session_id = ${Number(args.session)} and t.turn_seq = ${Number(args.seq)} order by t.id desc limit 1`;
if (!turn) throw new Error("No such turn.");
if (!turn.input || !turn.topic_id) throw new Error("That turn has no Learner message or no Topic.");

const topicFile = join(process.cwd(), "course", "topics", `${turn.topic_id}.yaml`);
const checkIds = existsSync(topicFile) ? (parse(readFileSync(topicFile, "utf8")).checks ?? []).map((c) => c.id) : [];

const iso = (d) => (d instanceof Date ? d.toISOString() : d === null ? null : new Date(d).toISOString());
const turns = await sql`select turn_seq, input from turns where session_id = ${turn.session_id} and turn_seq < ${turn.turn_seq} order by turn_seq`;
const messages = await sql`select seq, role, content from messages where session_id = ${turn.session_id} and seq < ${turn.turn_seq} order by seq`;
const items = await sql`select after_seq, kind, data from session_items where session_id = ${turn.session_id} order by after_seq, id`;
const attempts = await sql`select check_id, question_ids, created_at, submitted_at, correct_count, passed from quiz_attempts where learner_id = ${turn.learner_id} order by id`;
const practice = await sql`select skill_id, verdict, created_at from practice_answers where learner_id = ${turn.learner_id} and topic_id = ${turn.topic_id} order by id`;
const methods = await sql`select skill_id, methods_used from skill_state where learner_id = ${turn.learner_id} and topic_id = ${turn.topic_id}`;

const c = caseFromSession(
  {
    topicId: turn.topic_id,
    checkIds,
    turn: { turnSeq: turn.turn_seq, input: turn.input, startedAt: iso(turn.started_at) },
    turns: turns.map((t) => ({ turnSeq: t.turn_seq, input: t.input })),
    messages: messages.map((m) => ({ seq: m.seq, role: m.role, content: m.content })),
    items: items.map((i) => ({ afterSeq: i.after_seq, kind: i.kind, data: i.data })),
    quizAttempts: attempts.map((a) => ({ checkId: a.check_id, questionIds: a.question_ids, createdAt: iso(a.created_at), submittedAt: iso(a.submitted_at), correctCount: a.correct_count, passed: a.passed })),
    practice: practice.map((p) => ({ skillId: p.skill_id, verdict: p.verdict, createdAt: iso(p.created_at) })),
    skillMethods: methods.map((m) => ({ skillId: m.skill_id, methodsUsed: m.methods_used ?? [] })),
  },
  { id: args.id, title: args.title, historyTurns: Number(args.history) },
);

const text = `${JSON.stringify(c, null, 2)}\n`;
const check = parseCase(text, `${args.id}.json`);
if (check.errors.length) throw new Error(`The case would not be valid:\n${check.errors.join("\n")}`);
const out = args.out ?? join(process.cwd(), "src", "behaviour", "tutor-eval", "cases", `${args.id}.json`);
if (existsSync(out)) throw new Error(`${out} exists already; choose another --id or --out.`);
writeFileSync(out, text);
console.log(`Wrote ${out}. Add the pass conditions this Session broke, then run TUTOR_EVAL_ONLY=${args.id} npm run tutor:eval.`);
