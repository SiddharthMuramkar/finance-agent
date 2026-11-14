/**
 * Live Tutor tests (real API, ticket #236). One command: `npm run tutor:eval`. Kept out of `npm run check`.
 *
 * Runs T1 to T20 (cases/*.json): T1 to T11 from the Percent Session, T12 to T16 for the story-first voice (D3b), T17 to T20
 * for the Tutor that answers what was asked and never breaks (spec 2026-11-12, A1, A2, A6). Each live case three times, each run on a fresh
 * in-memory Postgres through the real Tutor Turn and the real model, then the reply checks, the case's
 * conditions and a gpt-6.1-sol grader. The report (every failure in full) goes to evidence/tutor-eval/.
 *
 * Options (environment):
 * - TUTOR_EVAL_BUDGET_USD: the spend cap, default 5. Tutor and grader spend both count.
 * - TUTOR_EVAL_MODEL, TUTOR_EVAL_EFFORT, TUTOR_EVAL_WIDGET_ENGINE (on or off): what the Tutor runs on. Default:
 *   the production defaults (TUTOR_MODEL, DEFAULT_SETTINGS), so the suite tests what new Sessions get.
 * - TUTOR_EVAL_ONLY=T1,T11: run some cases (aggregates then cover only those).
 * - TUTOR_EVAL_OUT: the report folder, default evidence/tutor-eval.
 * - TUTOR_EVAL_CONCURRENCY: runs side by side, default 3.
 */
import OpenAI from "openai";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { askModel } from "../ask-model";
import { TUTOR_MODEL } from "@/tutor/model";
import { tutorClient } from "@/tutor/tutor-client";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS, TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { DEFAULT_SETTINGS, fingerprint } from "@/tutor/session-log";
import { Budget, budgetCap, requirePrice } from "./budget";
import { CASES_DIR, loadCases } from "./case";
import { allPassed, renderSummary, reportFiles } from "./report";
import { runSuite } from "./run-suite";

const GRADER_MODEL = TUTOR_MODEL;
const OUT = process.env.TUTOR_EVAL_OUT ?? join(process.cwd(), "evidence", "tutor-eval");
const env = process.env;

it("live Tutor tests T1 to T20", { timeout: 3_600_000 }, async () => {
  const settings = {
    model: env.TUTOR_EVAL_MODEL || TUTOR_MODEL,
    effort: env.TUTOR_EVAL_EFFORT || DEFAULT_SETTINGS.effort,
    widgetEngine: (env.TUTOR_EVAL_WIDGET_ENGINE || DEFAULT_SETTINGS.widget_engine) === "on" ? ("on" as const) : ("off" as const),
  };
  requirePrice(settings.model);
  requirePrice(GRADER_MODEL);
  const budget = new Budget(budgetCap(env));
  const loaded = loadCases(CASES_DIR);
  if (loaded.errors.length) throw new Error(`Case files have problems:\n${loaded.errors.join("\n")}`);
  const only = env.TUTOR_EVAL_ONLY?.split(",").map((s) => s.trim());
  const cases = only
    ? loaded.cases.filter((c) => only.includes(c.id)).map((c) => (c.kind === "aggregate" ? { ...c, over: c.over.filter((id) => only.includes(id)) } : c))
    : loaded.cases;

  const openai = new OpenAI();
  const modelClient = tutorClient();
  const engine = settings.widgetEngine === "on";
  const report = await runSuite(cases, {
    map: loadCourseMap(),
    settings,
    graderModel: GRADER_MODEL,
    fingerprint: engine ? fingerprint(ENGINE_INSTRUCTIONS, ENGINE_TOOLS) : fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS),
    budget,
    newDb: testDb,
    tutorClient: () => modelClient,
    grade: async (system, prompt) => {
      // The model thinks before it grades and max_output_tokens counts the thinking too, so it is generous; effort is set, not left to the default.
      const res = await askModel(openai, { model: GRADER_MODEL, system, input: prompt, maxOutputTokens: 16000, effort: "medium" });
      // A refusal or a cut-off grade has no JSON, so it reads as unreadable and fails the run.
      return { text: res.stopReason === "end_turn" ? res.text : `${res.text}\n(stop reason ${res.stopReason})`, costUsd: res.costUsd };
    },
    courseCheck: (cwd) =>
      new Promise((resolve) => {
        execFile(process.execPath, [join(process.cwd(), "scripts", "check-course.mjs")], { cwd }, (err, stdout, stderr) =>
          resolve({ passed: !err, output: `${stdout}${stderr}`.trim() }),
        );
      }),
    concurrency: Number(env.TUTOR_EVAL_CONCURRENCY ?? "3"),
    log: (line) => console.log(line),
  });

  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(reportFiles(report))) writeFileSync(join(OUT, name), text);
  const summary = renderSummary(report);
  console.log(summary);
  console.log(`Report in ${OUT}`);
  expect(allPassed(report), summary).toBe(true);
});
