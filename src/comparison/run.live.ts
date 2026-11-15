/**
 * Teaching comparison of gpt-6.1-sol at three reasoning efforts (real API). One command:
 * `npm run compare:models`.
 *
 * Each teaching question (teaching.ts) goes to each variant (model and effort) through the real Tutor Turn on the explore
 * step of the Present value Topic: the Topic is pinned by a jump, the model and effort are set in the throwaway
 * database's settings as the app does, and a turn cut off at its time limit or at max_tokens is
 * resumed (resume.ts). `gpt-6.1-sol` then grades each answer against the rubric and the shared
 * reply rules, and ranks the three answers to a question blind (shuffled, labelled A, B, C). Code
 * recommends the variant and states each one's cost per turn. The report is saved to SQL
 * (model_comparison_* tables, over DATABASE_URL_UNPOOLED) and a copy goes to the output folder.
 *
 * Options (environment): ONLY=id,id, COMPARE_MODELS=gpt-6.1-sol@low,gpt-6.1-sol@medium,gpt-6.1-sol@high (model@effort), COMPARE_BUDGET_USD (default 12, Tutor and
 * grader), COMPARE_OUT (report folder), COMPARE_CONCURRENCY (questions at once, default 2),
 * COMPARE_NO_SAVE=1 (skip SQL), COMPARE_FROM_JSON=file (re-write the report and save from an earlier
 * run's rows, no API calls).
 */
import OpenAI from "openai";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { askModel } from "@/behaviour/ask-model";
import { placeLearner } from "@/behaviour/place";
import { freshToolsLearner } from "@/dev/tools-learner";
import { importCaseData } from "@/case-data/import";
import { loadCourseMap } from "@/course/map";
import { settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveJump } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { tutorClient } from "@/tutor/tutor-client";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { TUTOR_MODEL } from "@/tutor/model";
import { fingerprint } from "@/tutor/session-log";
import { runTutorTurn } from "@/tutor/turn";
import { takeWholeTurn } from "./resume";
import { parseVariant, parseVariants } from "./variant";
import {
  blindOrder,
  buildRankingPrompt,
  buildRubricPrompt,
  codeRuleVerdicts,
  parseRanking,
  parseRubric,
  RANKING_SYSTEM,
  renderTeachingReport,
  RUBRIC_ITEMS,
  RUBRIC_SYSTEM,
  saveTeaching,
  TEACHING_QUESTIONS,
  unblind,
  type TeachingQuestion,
  type TeachingRow,
} from "./teaching";

const GRADER_MODEL = TUTOR_MODEL;
// The app has one model, so the three things compared are its reasoning efforts, named `model@effort`.
const MODELS = parseVariants(process.env.COMPARE_MODELS, [`${TUTOR_MODEL}@low`, `${TUTOR_MODEL}@medium`, `${TUTOR_MODEL}@high`]);
const OUT = process.env.COMPARE_OUT ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/evidence/insight-led-notes/teaching-comparison");
const BUDGET = Number(process.env.COMPARE_BUDGET_USD ?? "12");
const CONCURRENCY = Number(process.env.COMPARE_CONCURRENCY ?? "2");
const CASE_DATA = process.env.CASE_DATA_FILE ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/case-data/mega-millions-2018.json");
const TOPIC = "present-value";

const map = loadCourseMap();
const modelClient = tutorClient();
// Made on first use: `new OpenAI()` throws without OPENAI_API_KEY, and COMPARE_FROM_JSON needs no key.
let client: OpenAI | undefined;
const openai = () => (client ??= new OpenAI());
const insight = map.topic(TOPIC)?.insight?.written.trim().replace(/\s+/g, " ");
let spent = 0;

/** One variant's answer to one question: a fresh throwaway database pinned to the Topic, the model and effort, and the explore step. */
async function ask(q: TeachingQuestion, model: string) {
  const db: Db = await testDb();
  const { model: tutorModel, effort } = parseVariant(model);
  await db.insert(settings).values([{ key: "model", value: tutorModel }, { key: "effort", value: effort }]);
  if (existsSync(CASE_DATA)) await importCaseData(db, JSON.parse(readFileSync(CASE_DATA, "utf8")));
  // The tools Learner, started over: the run never plays the owner or the owner's test Learner.
  const { id: learnerId } = await freshToolsLearner(db);
  await saveJump(db, map, TOPIC, new Date(), learnerId);
  const place = await placeLearner(db, map, "explore", learnerId);
  if (place.topic.id !== TOPIC || place.step !== "explore") throw new Error(`Learner is at ${place.topic.id}/${place.step}, not ${TOPIC}/explore`);
  const stepNote = `Topic "${place.topic.title}", Teaching Step "explore" (the Learner has not yet tried the Widget; the Insight is still hidden).`;
  const replies: string[] = [];
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, durationMs: 0 };
  let failed = "";
  let resumes = 0;
  for (const turn of q.turns) {
    const t = await takeWholeTurn((input) => runTutorTurn({ db, client: modelClient, map, learnerId, noLimits: true }, input), turn);
    replies.push(t.text.trim());
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += t.usage[k];
    resumes += t.resumes;
    if (t.failed) failed = t.failed;
  }
  return { replies, stepNote, failed, resumes, ...total };
}

async function gradeOne(q: TeachingQuestion, reply: string, stepNote: string) {
  // max_output_tokens counts the model's thinking too, so it is generous.
  const res = await askModel(openai(), { model: GRADER_MODEL, system: RUBRIC_SYSTEM, input: buildRubricPrompt({ turns: q.turns, reply, rules: q.rules, insight: q.rules.includes("insight_early") ? insight : undefined, stepNote }), maxOutputTokens: 16000 });
  return { ...parseRubric(res.text, q.rules), cost: res.costUsd };
}

async function runQuestion(q: TeachingQuestion): Promise<TeachingRow[]> {
  const ungraded = Object.fromEntries(RUBRIC_ITEMS.map((i) => [i.id, "ungraded"])) as TeachingRow["rubric"];
  const answers = await Promise.all(
    MODELS.map(async (model) => {
      const base = { questionId: q.id, model, turns: q.turns };
      const empty = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turnCount: q.turns.length, costUsd: 0, durationMs: 0, graderCostUsd: 0, rank: null };
      if (spent >= BUDGET) return { ...base, ...empty, answer: "(skipped: budget reached)", rubric: ungraded, rules: {}, reasons: "Budget reached before this ran." } as TeachingRow;
      try {
        const a = await ask(q, model);
        spent += a.costUsd;
        const answer = a.replies.length === 1 ? a.replies[0] : a.replies.map((r, i) => `[reply ${i + 1}] ${r}`).join("\n\n");
        const usage = { inputTokens: a.inputTokens, outputTokens: a.outputTokens, cacheReadTokens: a.cacheReadTokens, cacheWriteTokens: a.cacheWriteTokens, turnCount: q.turns.length,costUsd: a.costUsd, durationMs: a.durationMs };
        if (a.failed || a.replies.some((r) => r === "")) return { ...base, ...usage, graderCostUsd: 0, rank: null, answer, rubric: ungraded, rules: {}, reasons: `The Tutor Turn failed or was empty: ${a.failed}` };
        const g = await gradeOne(q, a.replies[a.replies.length - 1], a.stepNote);
        spent += g.cost;
        return { ...base, ...usage, graderCostUsd: g.cost, rank: null, answer, rubric: g.rubric, rules: { ...g.rules, ...codeRuleVerdicts(a.replies, q.rules) }, reasons: g.reasons };
      } catch (err) {
        return { ...base, ...empty, answer: "", rubric: ungraded, rules: {}, reasons: `Run failed: ${err instanceof Error ? err.message : String(err)}` } as TeachingRow;
      }
    }),
  );
  // Blind ranking: only when every model gave a usable answer.
  if (answers.every((r) => r.answer && !r.reasons.startsWith("The Tutor Turn failed") && !r.reasons.startsWith("Run failed") && r.graderCostUsd > 0) && spent < BUDGET) {
    try {
      const order = blindOrder(MODELS, q.id);
      const shown = order.map((m) => answers.find((r) => r.model === m)!.answer);
      const res = await askModel(openai(), { model: GRADER_MODEL, system: RANKING_SYSTEM, input: buildRankingPrompt({ turns: q.turns, answers: shown, stepNote: "explore step of the Present value Topic" }), maxOutputTokens: 8000 });
      const cost = res.costUsd;
      spent += cost;
      const ranking = parseRanking(res.text, MODELS.length);
      if (ranking) {
        const ranks = unblind(order, ranking);
        for (const r of answers) r.rank = ranks[r.model] ?? null;
      }
      answers[0].graderCostUsd += cost;
    } catch {
      /* ranks stay null; the recommendation uses the rubric and the rule failures */
    }
  }
  return answers;
}

it("Teaching comparison", { timeout: 3_600_000 }, async () => {
  const only = process.env.ONLY?.split(",");
  const fromJson = process.env.COMPARE_FROM_JSON;
  const questions = TEACHING_QUESTIONS.filter((q) => !only || only.includes(q.id));
  const perQuestion: TeachingRow[][] = new Array(questions.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (!fromJson && next < questions.length) {
        const i = next++;
        perQuestion[i] = await runQuestion(questions[i]);
        console.log(`${questions[i].id}: ranks ${perQuestion[i].map((r) => `${r.model}=${r.rank ?? "n/a"}`).join(" ")} ($${spent.toFixed(3)} so far)`);
      }
    }),
  );
  const rows: TeachingRow[] = fromJson ? JSON.parse(readFileSync(fromJson, "utf8")) : perQuestion.flat();
  const meta = { models: MODELS, graderModel: GRADER_MODEL, fingerprint: fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS) };
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "teaching-comparison-latest.md"), renderTeachingReport(rows, date, meta));
  writeFileSync(join(OUT, `teaching-comparison-${date}.json`), JSON.stringify(rows, null, 2));
  if (!process.env.COMPARE_NO_SAVE) {
    const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set to save the report to SQL.");
    const id = await saveTeaching(drizzle({ client: neon(url) }) as unknown as Db, { ...meta, rows });
    console.log(`Saved to SQL as model_comparison_runs.id = ${id}`);
  }
  console.log(`Total spend $${spent.toFixed(3)}; report in ${OUT}`);
});
