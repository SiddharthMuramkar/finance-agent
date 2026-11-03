// Simulated Learner: drives the running app over HTTP, the way a person would, to walk the present value Topic.
//
// It signs in as the tools Learner (never the owner or the owner's test Learner) and starts that Learner over, so
// every run begins from an empty Learner and touches only its rows; the old tools Learner is archived, never
// deleted (src/dev/simulated-learner.ts). It then drives the app as a Learner does (src/dev/learner-moves.ts): it chooses the
// Topic (the page starts the opener), presses Next when there is nothing to answer and Finish this reply under a
// reply cut off at its length limit, answers the Tutor with a cheap Learner model (claude-haiku-5-5), takes the
// quiz through /api/quiz, and keeps going until the Topic is passed. After each turn it reads the Tutor's
// step, duration and cost from the database (the `usage` table), and at the end it writes a transcript, a per-turn
// table and a cost summary to the output folder. Source material and transcripts never go in the repo: pass an
// output folder outside it.
//
// Usage (secrets come from .env through Node, never the shell):
//   node --env-file=.env scripts/simulated-learner.mjs --base <url> --out <folder> [options]
// Options:
//   --max-turns <n>         stop after this many turns (default 30)
//   --learner-model <id>    model that plays the Learner (default claude-haiku-5-5)
//   --topic <id>            Topic to walk (default present-value)
//
// It needs PASSCODES (listing a tools:<passcode> pair, the same as the app's), DATABASE_URL and ANTHROPIC_API_KEY in
// the environment. The Tutor's cost is whatever the app
// recorded in its usage table, so run it against the same database the app uses.

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signInAsToolsLearner, toolsState } from "../src/dev/simulated-learner.ts";
import { nextMove, nextNamedIn, saysGoOn, turnBody } from "../src/dev/learner-moves.ts";

const args = parseArgs(process.argv.slice(2));
const base = (args.base ?? "").replace(/\/$/, "");
const out = args.out;
if (!base || !out) {
  console.error("Usage: node --env-file=.env scripts/simulated-learner.mjs --base <url> --out <folder> [--max-turns <n>] [--learner-model <id>] [--topic <id>]");
  process.exit(2);
}
for (const name of ["PASSCODES", "DATABASE_URL", "ANTHROPIC_API_KEY"]) {
  if (!process.env[name]) {
    console.error(`Missing ${name} in the environment (run with --env-file=.env).`);
    process.exit(2);
  }
}
const topicId = args.topic ?? "present-value";
const learnerModel = args["learner-model"] ?? "claude-haiku-5-5";
const maxTurns = Number(args["max-turns"] ?? 30);
mkdirSync(out, { recursive: true });

const ORDER = ["story", "concept", "explore", "your_turn", "check", "reveal", "principle"];
// Haiku 5.5 price per million tokens, as in src/tutor/pricing.ts.
const LEARNER_PRICE = { input: 0.1, output: 0.5 };

const sql = neon(process.env.DATABASE_URL);
const query = (text, params = []) => sql.query(text, params);
const anthropic = new Anthropic();

let learnerCost = 0;
let learnerCalls = 0;
const log = [];
const say = (line) => {
  console.log(line);
  log.push(line);
};

// ---------------------------------------------------------------- helpers

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) parsed[key] = true;
    else (parsed[key] = next), i++;
  }
  return parsed;
}

// The tools Learner this run signed in as (fresh from Start over), and its cookie.
let cookie = "";
let learnerId = 0;

const headers = () => ({ "Content-Type": "application/json", Cookie: cookie });

/** Posts to /api/turn and reads the NDJSON stream. Returns the reply text and the events seen, or why it was refused. */
async function postTurn(body) {
  const res = await fetch(`${base}/api/turn`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (res.status === 409) {
    // Another turn is running (wait for it), or nothing ran: a Next not on offer, or an opener for a Session that already has messages.
    const { error = "" } = await res.json().catch(() => ({}));
    return /in progress/i.test(error) ? { busy: true, text: "", events: [] } : { refused: error, text: "", events: [] };
  }
  if (!res.ok) throw new Error(`/api/turn answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const events = [];
  let text = "";
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line);
      events.push(event);
      if (event.type === "text") text += event.text;
      if (event.type === "replay") text = event.text;
    }
  }
  return { busy: false, text, events };
}

/** One full turn: resumes after cut-offs, waits out a busy lock. */
async function runTurn(body) {
  let current = body;
  let text = "";
  const events = [];
  let resumes = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await postTurn(current);
    if (result.refused !== undefined) return { refused: result.refused, text: "", events: [], resumes };
    if (result.busy) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    events.push(...result.events);
    text = result.text || text;
    const last = result.events.at(-1);
    if (last?.type === "cut_off" || (last?.type === "error" && resumes < 2)) {
      resumes++;
      current = { resume: true };
      continue;
    }
    break;
  }
  return { text, events, resumes };
}

/** Chooses the Topic on the Course Map, as a Learner does: its Session shows at once. */
async function chooseTopic() {
  const res = await fetch(`${base}/api/jump`, { method: "POST", headers: headers(), body: JSON.stringify({ topicId }) });
  if (!res.ok) throw new Error(`POST /api/jump answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Takes one move as a full turn. A refused Next is pressed again on the step the refusal names; with no Next on
 * offer (a Check open, Explore unsettled), or an opener refused because the Session already has messages, the
 * Learner types a reply instead. Returns the body that ran and its result.
 */
async function takeMove(move) {
  let body = move.kind === "message" ? turnBody(move, await learnerReply(lastTutorText)) : turnBody(move);
  // The Learner model only says to go on: a Learner now presses Next instead.
  if (body.message !== undefined && saysGoOn(body.message)) body = turnBody({ kind: "next", step: state.step });
  for (let tries = 0; tries < 3; tries++) {
    const result = await runTurn(body);
    if (result.refused === undefined) return { body, result };
    const named = body.next ? nextNamedIn(result.refused) : null;
    if (named) body = { next: named };
    else if (body.opener) body = turnBody({ kind: "next", step: state.step });
    else body = turnBody({ kind: "message" }, await learnerReply(lastTutorText || "(Say what you would like to do next.)"));
  }
  throw new Error(`The app refused every move: ${JSON.stringify(body)}`);
}

/** How a turn's body reads in the transcript. */
function moveLabel(body) {
  if (body.opener) return "(chose the Topic; the page started the opener)";
  if (body.finish) return "(pressed Finish this reply)";
  if (body.next) return `(pressed Next: ${body.next})`;
  return body.message;
}

async function getQuiz() {
  const res = await fetch(`${base}/api/quiz`, { headers: headers() });
  if (!res.ok) throw new Error(`GET /api/quiz answered HTTP ${res.status}`);
  return (await res.json()).quiz;
}

/** Where the tools Learner stands, from its own rows only. */
const readState = () => toolsState(query, learnerId, topicId);

/** The saved status, duration, cost and tools of the turn that just ended, from the usage table. */
async function readTurnRecord() {
  const [turn] = await query("select id, session_id, turn_seq, status, stop_reason, error from turns where learner_id = $1 order by id desc limit 1", [learnerId]);
  if (!turn || turn.session_id === null) return { status: turn?.status ?? "unknown" };
  const rows = await query("select kind, step, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, tools, duration_ms, cost_usd from usage where session_id = $1 and turn_seq = $2 order by kind, step", [turn.session_id, turn.turn_seq]);
  const total = rows.find((r) => r.kind === "turn");
  const steps = rows.filter((r) => r.kind === "step");
  return {
    turnId: turn.id,
    sessionId: turn.session_id,
    status: turn.status,
    stopReason: turn.stop_reason,
    error: turn.error,
    durationMs: total?.duration_ms ?? null,
    costUsd: total?.cost_usd === null || total === undefined ? null : Number(total.cost_usd),
    inputTokens: total?.input_tokens ?? 0,
    outputTokens: total?.output_tokens ?? 0,
    cacheReadTokens: total?.cache_read_tokens ?? 0,
    cacheWriteTokens: total?.cache_write_tokens ?? 0,
    loopSteps: steps.length,
    tools: steps.flatMap((s) => s.tools),
  };
}

// ---------------------------------------------------------------- the simulated Learner

const PERSONA = `You are simulating an adult Learner using a private finance tutoring app for the first time. You are bright and curious but new to finance. You type short messages, one to four sentences, in plain language.
- When the Tutor asks you to predict or choose, give a reasoned guess and say why.
- When the Tutor asks you to explain, reason in your own words from what you were taught, including how a later payment compares with one today.
- When the Tutor asks you to move a slider or use a chart or calculator, act as if you can see and use it: report the readings you got, working them out from the numbers in the conversation if you can, and never say you cannot see the widget.
- If the Tutor asked nothing, just say: Okay, go on.
Reply with only what you would type, nothing else.`;

const convo = [];

function stripWidgets(text) {
  return text.replace(/```[\s\S]*?(```|$)/g, "[widget]").trim();
}

async function learn(system, messages, maxTokens = 800) {
  const response = await anthropic.messages.create({ model: learnerModel, max_tokens: maxTokens, system, messages });
  learnerCalls++;
  learnerCost += (response.usage.input_tokens * LEARNER_PRICE.input + response.usage.output_tokens * LEARNER_PRICE.output) / 1_000_000;
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

async function learnerReply(tutorText) {
  convo.push({ role: "user", content: `Tutor: ${stripWidgets(tutorText) || "(no text)"}` });
  const reply = (await learn(PERSONA, convo)) || "Okay, go on.";
  convo.push({ role: "assistant", content: reply });
  return reply;
}

/** Records that the Learner did something other than type, keeping the Haiku conversation alternating. */
function noteAction(text) {
  if (convo.at(-1)?.role === "assistant") convo[convo.length - 1].content += `\n${text}`;
  else convo.push({ role: "assistant", content: text });
}

async function takeQuiz(quiz) {
  const questions = quiz.questions.map((q) => `${q.id}: ${q.prompt}\n${q.choices.map((c) => `  ${c.id}) ${c.text}`).join("\n")}`).join("\n\n");
  const raw = await learn(
    "You are an adult Learner who has just been taught present value (PV = amount / (1 + r)^n, and a stream of payments is the sum of each payment's present value). Answer the quiz as best you can. Reply with only a JSON object mapping each question ID to the ID of the choice you pick.",
    [{ role: "user", content: questions }],
  );
  const picked = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  const res = await fetch(`${base}/api/quiz`, { method: "POST", headers: headers(), body: JSON.stringify({ attemptId: quiz.attemptId, answers: picked }) });
  const result = await res.json();
  if (!res.ok) throw new Error(`POST /api/quiz answered HTTP ${res.status}: ${result.error}`);
  return { picked, result };
}

// ---------------------------------------------------------------- the run

// Where the Learner stands, read after each turn; takeMove reads it too.
let state;
let lastTutorText = "";
const transcript = [];
const turns = [];
const startedAt = new Date();

try {
  // Every run starts with Start over on the tools Learner: the old one is archived, nothing is deleted.
  ({ cookie, learnerId } = await signInAsToolsLearner(base));
  say(`Signed in to ${base} as the tools Learner and started it over: Learner ${learnerId}, empty.`);

  state = await readState();
  say(`Start: step "${state.step}", status "${state.status}", ${state.sessions} Session(s) already.`);
  let afterQuiz = false;
  let cutShort = false;
  let sameStep = 0;
  let previousStep = null;

  for (let n = 1; n <= maxTurns && state.status !== "passed"; n++) {
    // Take a quiz if one is open: code marks it, no model call.
    const quiz = state.step === "check" ? await getQuiz() : null;
    if (quiz) {
      const { picked, result } = await takeQuiz(quiz);
      transcript.push(`### Quiz (attempt ${quiz.attemptNo + 1}) before turn ${n}\n${quiz.questions.map((q) => `- ${q.prompt} -> picked ${picked[q.id] ?? "none"}`).join("\n")}\n\nResult: ${result.correctCount} of ${result.shown} correct, ${result.passed ? "passed" : "not passed"} (needs ${result.needed}).`);
      say(`Quiz attempt ${quiz.attemptNo + 1}: ${result.correctCount} of ${result.shown} correct, ${result.passed ? "passed" : "not passed"}.`);
      noteAction(`(I took the quiz and got ${result.correctCount} of ${result.shown}${result.passed ? ", passing" : ""}.)`);
      afterQuiz = true;
      state = await readState();
    }

    const stepBefore = state.step;
    sameStep = stepBefore === previousStep ? sameStep + 1 : 0;
    previousStep = stepBefore;
    if (sameStep >= 6) {
      say(`Stopped: six turns in a row began at step "${stepBefore}" without moving on.`);
      break;
    }

    const move = nextMove({ first: n === 1, cutShort, afterQuiz, tutorText: lastTutorText, step: state.step });
    if (move.kind === "opener") await chooseTopic();
    afterQuiz = false;

    const sessionsBefore = state.sessions;
    const wallStart = performance.now();
    const { body, result } = await takeMove(move);
    if (body.message === undefined && n > 1) noteAction(`(I ${moveLabel(body).slice(1, -1)}.)`);
    const wallMs = Math.round(performance.now() - wallStart);
    const record = await readTurnRecord();
    state = await readState();
    const sessionEvent = result.events.find((e) => e.type === "session");
    lastTutorText = result.text;
    cutShort = result.events.some((e) => e.type === "cut_short");

    const turn = {
      n,
      learner: moveLabel(body),
      stepBefore,
      stepAfter: state.step,
      status: state.status,
      wallMs,
      resumes: result.resumes,
      newSession: state.sessions > sessionsBefore,
      sessions: state.sessions,
      sessionReason: sessionEvent?.reason ?? null,
      replyChars: result.text.length,
      hasWidget: /```/.test(result.text),
      eventTypes: [...new Set(result.events.map((e) => e.type))].filter((t) => t !== "text"),
      ...record,
    };
    turns.push(turn);
    transcript.push(`### Turn ${n}  (step ${stepBefore} -> ${state.step}${turn.newSession ? ", NEW SESSION" : ""}, ${Math.round(wallMs / 1000)} s, $${(record.costUsd ?? 0).toFixed(4)})\n**Learner:** ${turn.learner}\n\n**Tutor:** ${result.text.trim() || "(no text)"}\n\nTools: ${record.tools?.join(", ") || "none"}`);
    say(`Turn ${n}: ${stepBefore} -> ${state.step}${turn.newSession ? " [new Session]" : ""}; ${Math.round(wallMs / 1000)} s; $${(record.costUsd ?? 0).toFixed(4)}; ${record.loopSteps ?? "?"} loop step(s); tools: ${record.tools?.join(",") || "none"}`);
    if (record.status !== "finished") {
      say(`Turn ${n} did not finish: status "${record.status}"${record.error ? `, ${record.error}` : ""}. Stopping.`);
      break;
    }
  }
} finally {
  const finishedAt = new Date();
  const tutorCost = turns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  const final = await readState().catch(() => null);
  const stepsSeen = [...new Set(turns.flatMap((t) => [t.stepBefore, t.stepAfter]))];
  const jumps = turns.filter((t) => ORDER.indexOf(t.stepAfter) - ORDER.indexOf(t.stepBefore) > 1 && !(t.stepBefore === "check"));
  const summary = {
    base,
    topicId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    finalState: final,
    turns: turns.length,
    stepsSeen,
    tutorCostUsd: Number(tutorCost.toFixed(4)),
    learnerCostUsd: Number(learnerCost.toFixed(4)),
    learnerCalls,
    longestTurnMs: Math.max(0, ...turns.map((t) => t.wallMs)),
    meanTurnMs: turns.length ? Math.round(turns.reduce((s, t) => s + t.wallMs, 0) / turns.length) : 0,
    newSessionTurns: turns.filter((t) => t.newSession).map((t) => t.n),
    pacingBreaches: jumps.map((t) => t.n),
  };
  writeFileSync(join(out, "turns.json"), JSON.stringify({ summary, turns }, null, 2));
  writeFileSync(join(out, "transcript.md"), `# Simulated Learner run, ${base}\n\n${transcript.join("\n\n---\n\n")}\n`);
  const table = turns.map((t) => `| ${t.n} | ${t.stepBefore} -> ${t.stepAfter} | ${(t.wallMs / 1000).toFixed(1)} | ${t.loopSteps ?? ""} | ${(t.costUsd ?? 0).toFixed(4)} | ${t.newSession ? "new" : ""} | ${t.tools?.join(", ") ?? ""} |`);
  writeFileSync(
    join(out, "summary.md"),
    `# Run summary\n\n${log.join("\n")}\n\n| Turn | Step | Seconds | Loop steps | Tutor cost $ | Session | Tools |\n|---|---|---|---|---|---|---|\n${table.join("\n")}\n\n${JSON.stringify(summary, null, 2)}\n`,
  );
  say(`\nTutor cost for the Topic: $${summary.tutorCostUsd} over ${summary.turns} turns (longest ${Math.round(summary.longestTurnMs / 1000)} s, mean ${Math.round(summary.meanTurnMs / 1000)} s). Simulated Learner cost: $${summary.learnerCostUsd}.`);
  say(`Final state: ${JSON.stringify(final)}. Files written to ${out}.`);
}
