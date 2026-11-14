/**
 * Rule-keeping comparison of gpt-6.1-sol at two reasoning efforts (real API). One command: `npm run compare:rules`.
 * The teaching comparison of three efforts is run.live.ts (`npm run compare:models`).
 *
 * Every fixed tutoring question goes to each model through the real Tutor Turn with the real Tutor
 * instructions and tools (the model and effort are set in the throwaway database's settings, as the app does).
 * `gpt-6.1-sol` grades correctness, give-away and past-only. The report, the recommendation
 * and every answer with its tokens and cost are saved to SQL (model_comparison_* tables, over
 * DATABASE_URL_UNPOOLED) and a copy of the report is written to the output folder.
 *
 * Options (environment): ONLY=id,id, COMPARE_MODELS=gpt-6.1-sol@low,gpt-6.1-sol@medium (model@effort), COMPARE_BUDGET_USD (default 4, Tutor and
 * grader), COMPARE_OUT (report folder), COMPARE_CONCURRENCY (default 3), COMPARE_NO_SAVE=1 (skip SQL), COMPARE_FROM_JSON=file (re-write the report and save from an earlier run's rows, no API calls),
 * CASE_DATA_FILE (checked Case Data import file; skipped if absent).
 * FinanceBench open-sample items (testing only, CC BY-NC) are downloaded at run time, never stored.
 */
import OpenAI from "openai";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { askModel } from "@/behaviour/ask-model";
import { placeLearner } from "@/behaviour/place";
import { freshToolsLearner } from "@/dev/tools-learner";
import { importCaseData } from "@/case-data/import";
import { loadCourseMap } from "@/course/map";
import { settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { tutorClient } from "@/tutor/tutor-client";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { TUTOR_MODEL } from "@/tutor/model";
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
import { parseVariant, parseVariants } from "./variant";

const GRADER_MODEL = TUTOR_MODEL;
// The app has one model, so the two things compared are its reasoning efforts, named `model@effort`.
const MODELS = parseVariants(process.env.COMPARE_MODELS, [`${TUTOR_MODEL}@low`, `${TUTOR_MODEL}@medium`]);
const OUT = process.env.COMPARE_OUT ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/evidence/19");
const BUDGET = Number(process.env.COMPARE_BUDGET_USD ?? "4");
const CONCURRENCY = Number(process.env.COMPARE_CONCURRENCY ?? "3");
const CASE_DATA = process.env.CASE_DATA_FILE ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/case-data/mega-millions-2018.json");
const FINANCEBENCH_URL = "https://huggingface.co/datasets/PatronusAI/financebench/resolve/main/financebench_merged.jsonl";

const map = loadCourseMap();
const modelClient = tutorClient();
// Made on first use: `new OpenAI()` throws without OPENAI_API_KEY, and COMPARE_FROM_JSON needs no key.
let client: OpenAI | undefined;
const openai = () => (client ??= new OpenAI());
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
  const { model: tutorModel, effort } = parseVariant(model);
  await db.insert(settings).values([{ key: "model", value: tutorModel }, { key: "effort", value: effort }]);
  if (existsSync(CASE_DATA)) await importCaseData(db, JSON.parse(readFileSync(CASE_DATA, "utf8")));
  // The tools Learner, started over: the run never plays the owner or the owner's test Learner.
  const { id: learnerId } = await freshToolsLearner(db);
  const place = await placeLearner(db, map, q.at, learnerId);
  const stepNote = `Topic "${place.topic.title}", Teaching Step "${place.step}" (before the reveal; the Learner has not seen the outcome).`;
  const replies: string[] = [];
  const t = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, durationMs: 0 };
  let failed = "";
  for (const turn of q.turns) {
    let text = "";
    for await (const e of runTutorTurn({ db, client: modelClient, map, learnerId }, turn)) {
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
  // max_output_tokens counts the model's thinking too, so it is generous.
  const res = await askModel(openai(), { model: GRADER_MODEL, system: COMPARISON_GRADER_SYSTEM, input: buildComparisonGraderPrompt({ turns: q.turns, replies, reference: q.reference, reveal, stepNote }), maxOutputTokens: 16000 });
  return { grade: parseComparisonGrade(res.text), cost: res.costUsd };
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
