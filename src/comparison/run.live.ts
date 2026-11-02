/**
 * Haiku versus Sonnet comparison (real API). One command: `npm run compare:models`.
 *
 * Every fixed tutoring question goes to each model through the real Tutor Turn with the real Tutor
 * instructions and tools (the model is set in the throwaway database's settings, as the app does).
 * `claude-opus-5-5` grades correctness, give-away and past-only. The report, the recommendation
 * and every answer with its tokens and cost are saved to SQL (model_comparison_* tables, over
 * DATABASE_URL_UNPOOLED) and a copy of the report is written to the output folder.
 *
 * Options (environment): ONLY=id,id, COMPARE_MODELS=a,b, COMPARE_BUDGET_USD (default 4, Tutor and
 * grader), COMPARE_OUT (report folder), COMPARE_CONCURRENCY (default 3), COMPARE_NO_SAVE=1 (skip SQL), COMPARE_FROM_JSON=file (re-write the report and save from an earlier run's rows, no API calls),
 * CASE_DATA_FILE (checked Case Data import file; skipped if absent).
 * FinanceBench open-sample items (testing only, CC BY-NC) are downloaded at run time, never stored.
 */
import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { placeLearner } from "@/behaviour/place";
import { importCaseData } from "@/case-data/import";
import { loadCourseMap } from "@/course/map";
import { settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { costUsd } from "@/tutor/pricing";
import { fingerprint } from "@/tutor/session-log";
import { runTutorTurn } from "@/tutor/turn";
import {
  buildComparisonGraderPrompt,
  COMPARISON_GRADER_SYSTEM,
  financeBenchQuestions,
  parseComparisonGrade,
  renderComparisonReport,
  saveComparison,
  type ComparisonQuestion,
  type ComparisonRow,
} from "./compare";
import { FINANCEBENCH_IDS, OWN_COMPARISON_QUESTIONS } from "./questions";

const GRADER_MODEL = "claude-opus-5-5";
const MODELS = (process.env.COMPARE_MODELS ?? "claude-haiku-5-5,claude-sonnet-5-5").split(",");
const OUT = process.env.COMPARE_OUT ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/evidence/19");
const BUDGET = Number(process.env.COMPARE_BUDGET_USD ?? "4");
const CONCURRENCY = Number(process.env.COMPARE_CONCURRENCY ?? "3");
const CASE_DATA = process.env.CASE_DATA_FILE ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/case-data/mega-millions-2018.json");
const FINANCEBENCH_URL = "https://huggingface.co/datasets/PatronusAI/financebench/resolve/main/financebench_merged.jsonl";

const map = loadCourseMap();
const tutorClient = anthropicTutorClient();
const anthropic = new Anthropic();
let spent = 0;

async function loadFinanceBench(): Promise<ComparisonQuestion[]> {
  const cache = join(tmpdir(), "financebench_merged.jsonl");
  if (!existsSync(cache)) {
    const res = await fetch(FINANCEBENCH_URL);
    if (!res.ok) throw new Error(`FinanceBench download failed: ${res.status}`);
    writeFileSync(cache, await res.text());
  }
  const rows = readFileSync(cache, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return financeBenchQuestions(rows, FINANCEBENCH_IDS);
}

async function ask(q: ComparisonQuestion, model: string) {
  const db = await testDb();
  await db.insert(settings).values({ key: "model", value: model });
  if (existsSync(CASE_DATA)) await importCaseData(db, JSON.parse(readFileSync(CASE_DATA, "utf8")));
  const place = await placeLearner(db, map, q.at);
  const stepNote = `Topic "${place.topic.title}", Teaching Step "${place.step}" (before the reveal; the Learner has not seen the outcome).`;
  const replies: string[] = [];
  const t = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, durationMs: 0 };
  let failed = "";
  for (const turn of q.turns) {
    let text = "";
    for await (const e of runTutorTurn({ db, client: tutorClient, map }, turn)) {
      if (e.type === "text") text += e.text;
      if (e.type === "error") failed = e.message;
      if (e.type === "refusal") failed = `refusal: ${e.message}`;
      if (e.type === "done") {
        t.inputTokens += e.usage.inputTokens;
        t.outputTokens += e.usage.outputTokens;
        t.cacheReadTokens += e.usage.cacheReadTokens;
        t.cacheWriteTokens += e.usage.cacheWriteTokens;
        t.costUsd += e.usage.costUsd ?? 0;
        t.durationMs += e.usage.durationMs;
      }
    }
    replies.push(text.trim());
  }
  return { replies, stepNote, failed, ...t };
}

async function grade(q: ComparisonQuestion, replies: string[], stepNote: string) {
  const reveal = q.guardsReveal ? map.topics.flatMap((x) => x.cases).map((c) => c.reveal.trim().replace(/\s+/g, " ")).join(" ") : undefined;
  const res = await anthropic.messages.create({
    model: GRADER_MODEL,
    max_tokens: 2000,
    system: COMPARISON_GRADER_SYSTEM,
    messages: [{ role: "user", content: buildComparisonGraderPrompt({ turns: q.turns, replies, reference: q.reference, reveal, stepNote }) }],
  });
  const u = res.usage;
  const cost = costUsd(GRADER_MODEL, { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 }) ?? 0;
  return { grade: parseComparisonGrade(res.content.map((b) => (b.type === "text" ? b.text : "")).join("")), cost };
}

async function runOne(q: ComparisonQuestion, model: string): Promise<ComparisonRow> {
  const base = { questionId: q.id, source: q.source, model, turns: q.turns };
  const empty = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turnCount: q.turns.length, costUsd: 0, durationMs: 0, graderCostUsd: 0 };
  const ungraded = { correctness: "ungraded", giveAway: "ungraded", pastOnly: "ungraded" } as const;
  if (spent >= BUDGET) return { ...base, ...empty, answer: "(skipped: budget reached)", ...ungraded, reasons: "Budget reached before this ran." };
  try {
    const a = await ask(q, model);
    spent += a.costUsd;
    const answer = q.turns.length === 1 ? a.replies[0] : a.replies.map((r, i) => `[reply ${i + 1}] ${r}`).join("\n\n");
    const usage = { inputTokens: a.inputTokens, outputTokens: a.outputTokens, cacheReadTokens: a.cacheReadTokens, cacheWriteTokens: a.cacheWriteTokens, turnCount: q.turns.length, costUsd: a.costUsd, durationMs: a.durationMs };
    if (a.failed || a.replies.some((r) => r === "")) return { ...base, ...usage, graderCostUsd: 0, answer, ...ungraded, reasons: `The Tutor Turn failed or was empty: ${a.failed}` };
    const g = await grade(q, a.replies, a.stepNote);
    spent += g.cost;
    return { ...base, ...usage, graderCostUsd: g.cost, answer, ...g.grade };
  } catch (err) {
    return { ...base, ...empty, answer: "", ...ungraded, reasons: `Run failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

it("Tutor model comparison", { timeout: 3_600_000 }, async () => {
  const only = process.env.ONLY?.split(",");
  const fromJson = process.env.COMPARE_FROM_JSON;
  const all = [...OWN_COMPARISON_QUESTIONS, ...(await loadFinanceBench())];
  const questions = all.filter((q) => !only || only.includes(q.id));
  const jobs = questions.flatMap((q) => MODELS.map((m) => ({ q, m })));
  const rows: ComparisonRow[] = fromJson ? JSON.parse(readFileSync(fromJson, "utf8")) : new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (!fromJson && next < jobs.length) {
        const i = next++;
        rows[i] = await runOne(jobs[i].q, jobs[i].m);
        console.log(`${jobs[i].m} ${jobs[i].q.id}: ${rows[i].correctness}/${rows[i].giveAway}/${rows[i].pastOnly} ($${spent.toFixed(3)} so far)`);
      }
    }),
  );
  const meta = { models: MODELS, graderModel: GRADER_MODEL, fingerprint: fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS) };
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(OUT, { recursive: true });
  const report = renderComparisonReport(rows, date, meta);
  writeFileSync(join(OUT, "model-comparison-latest.md"), report);
  writeFileSync(join(OUT, `model-comparison-${date}.json`), JSON.stringify(rows, null, 2));
  if (!process.env.COMPARE_NO_SAVE) {
    const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set to save the report to SQL.");
    const id = await saveComparison(drizzle({ client: neon(url) }) as unknown as Db, { ...meta, rows });
    console.log(`Saved to SQL as model_comparison_runs.id = ${id}`);
  }
  console.log(`Total spend $${spent.toFixed(3)}; report in ${OUT}`);
});
