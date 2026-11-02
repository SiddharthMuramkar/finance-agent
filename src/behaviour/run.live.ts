/**
 * Tutor behaviour run (real API). One command: `npm run behaviour`.
 *
 * Each question gets a fresh in-memory PGlite database, the real Tutor instructions and tools, and
 * the real Tutor Turn with the real model. The Learner is placed at a Teaching Step before the
 * reveal, the question(s) are sent, and `claude-opus-5-5` grades the replies against the written
 * rubric in grading.ts. A results report is written to the output folder.
 *
 * Options (environment): ONLY=id,id (run some questions), RULE=hindsight (one rule),
 * BEHAVIOUR_BUDGET_USD (default 3.5, counts Tutor and grader spend), BEHAVIOUR_OUT (report folder),
 * BEHAVIOUR_CONCURRENCY (default 4), CASE_DATA_FILE (checked Case Data import file; skipped if absent).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { importCaseData } from "@/case-data/import";
import { loadCourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { costUsd } from "@/tutor/pricing";
import { fingerprint } from "@/tutor/session-log";
import { runTutorTurn } from "@/tutor/turn";
import { BEHAVIOUR_QUESTIONS, type BehaviourQuestion } from "./questions";
import { buildGraderPrompt, GRADER_SYSTEM, parseGrade, renderReport, RULES, type Graded } from "./grading";

const TUTOR_MODEL = "claude-sonnet-5-5";
const GRADER_MODEL = "claude-opus-5-5";
const OUT = process.env.BEHAVIOUR_OUT ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/evidence/18");
const BUDGET = Number(process.env.BEHAVIOUR_BUDGET_USD ?? "3.5");
const CONCURRENCY = Number(process.env.BEHAVIOUR_CONCURRENCY ?? "4");
const CASE_DATA = process.env.CASE_DATA_FILE ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/case-data/mega-millions-2018.json");

const map = loadCourseMap();
const tutorClient = anthropicTutorClient();
const anthropic = new Anthropic();
let spent = 0;

/** Puts a fresh Learner at the Teaching Step the question needs, by saving progress directly. */
async function placeLearner(db: Awaited<ReturnType<typeof testDb>>, at: BehaviourQuestion["at"]) {
  await ensureTopicStarted(db, map);
  const target = at === "story" ? "story" : at === "your_turn" ? "your_turn" : "check";
  for (let i = 0; i < 12; i++) {
    const place = navigate(map, await loadProgress(db));
    if (!place) throw new Error("no place");
    const onConversationCheck = place.step === "check" && place.check?.kind === "conversation";
    if (place.step === target && (target !== "check" || onConversationCheck)) return place;
    if (place.step === "check" && place.check) await saveCheckResult(db, map, { checkId: place.check.id, passed: true });
    else await saveFinishedStep(db, map, place.step);
  }
  throw new Error(`could not place the Learner at ${at}`);
}

async function ask(q: BehaviourQuestion): Promise<{ replies: string[]; cost: number; stepNote: string }> {
  const db = await testDb();
  if (existsSync(CASE_DATA)) await importCaseData(db, JSON.parse(readFileSync(CASE_DATA, "utf8")));
  const place = await placeLearner(db, q.at);
  const stepNote = `Topic "${place.topic.title}", Teaching Step "${place.step}" (before the reveal; the Learner has not seen the outcome).`;
  const replies: string[] = [];
  let cost = 0;
  for (const turn of q.turns) {
    let text = "";
    for await (const e of runTutorTurn({ db, client: tutorClient, map }, turn)) {
      if (e.type === "text") text += e.text;
      if (e.type === "error") text += `\n[ERROR: ${e.message}]`;
      if (e.type === "refusal") text += `\n[REFUSAL: ${e.message}]`;
      if (e.type === "done") cost += e.usage.costUsd ?? 0;
    }
    replies.push(text.trim());
  }
  return { replies, cost, stepNote };
}

async function grade(q: BehaviourQuestion, replies: string[], stepNote: string) {
  const rule = RULES.find((r) => r.id === q.rule)!;
  const reveal = q.rule === "hindsight" ? map.topics.flatMap((t) => t.cases).map((c) => c.reveal.trim().replace(/\s+/g, " ")).join(" ") : undefined;
  const res = await anthropic.messages.create({
    model: GRADER_MODEL,
    max_tokens: 2000,
    system: GRADER_SYSTEM,
    messages: [{ role: "user", content: buildGraderPrompt({ rule, turns: q.turns, replies, reveal, stepNote }) }],
  });
  const u = res.usage;
  const cost = costUsd(GRADER_MODEL, {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  }) ?? 0;
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { grade: parseGrade(text), cost };
}

async function runOne(q: BehaviourQuestion): Promise<Graded> {
  const base = { id: q.id, rule: q.rule, style: q.style, turns: q.turns };
  if (spent >= BUDGET) return { ...base, answer: "(skipped: budget reached)", verdict: "ungraded", reasons: "Budget reached before this question ran.", costUsd: 0 };
  try {
    const { replies, cost, stepNote } = await ask(q);
    spent += cost;
    const answer = q.turns.length === 1 ? replies[0] : replies.map((r, i) => `[reply ${i + 1}] ${r}`).join("\n\n");
    if (replies.some((r) => r.includes("[ERROR:") || r.includes("[REFUSAL:") || r === "")) {
      return { ...base, answer, verdict: "ungraded", reasons: "The Tutor Turn gave an error, a refusal or an empty reply.", costUsd: cost };
    }
    const g = await grade(q, replies, stepNote);
    spent += g.cost;
    return { ...base, answer, ...g.grade, costUsd: cost };
  } catch (err) {
    return { ...base, answer: "", verdict: "ungraded", reasons: `Run failed: ${err instanceof Error ? err.message : String(err)}`, costUsd: 0 };
  }
}

it("Tutor behaviour test set", { timeout: 3_600_000 }, async () => {
  const only = process.env.ONLY?.split(",");
  const questions = BEHAVIOUR_QUESTIONS.filter((q) => (!only || only.includes(q.id)) && (!process.env.RULE || q.rule === process.env.RULE));
  const results: Graded[] = new Array(questions.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < questions.length) {
        const i = next++;
        results[i] = await runOne(questions[i]);
        console.log(`${results[i].verdict.toUpperCase()} ${results[i].id} ($${spent.toFixed(3)} so far)`);
      }
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const report = renderReport(results, date, { tutorModel: TUTOR_MODEL, graderModel: GRADER_MODEL, fingerprint: fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS) });
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(OUT, `behaviour-results-${stamp}.md`), report);
  writeFileSync(join(OUT, "behaviour-results-latest.md"), report);
  writeFileSync(join(OUT, `behaviour-results-${stamp}.json`), JSON.stringify(results, null, 2));
  console.log(`Total spend $${spent.toFixed(3)}; report in ${OUT}`);
});
