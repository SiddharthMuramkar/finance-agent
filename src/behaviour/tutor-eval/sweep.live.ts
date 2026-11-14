/**
 * The model sweep (real API, ticket #248). One command: `npm run tutor:sweep`. Kept out of `npm run check`.
 *
 * Runs the live Tutor tests (T1 to T11, three runs each, graded by gpt-6.1-sol) once for each model:effort pair (the app has one model, so the sweep compares its reasoning efforts), each
 * pair on its own spend cap, through the same runner as `npm run tutor:eval` (`runSuite`). One combined report
 * (pass rate and cost per pair, and the cheapest pair that passed everything) goes to evidence/tutor-eval/.
 *
 * Options (environment):
 * - TUTOR_EVAL_MODELS: the pairs, "model:effort,model:effort". Default: gpt-6.1-sol:low, gpt-6.1-sol:medium,
 *   gpt-6.1-sol:high.
 * - TUTOR_EVAL_BUDGET_USD: the spend cap for EACH pair, default 5. Tutor and grader spend both count.
 * - TUTOR_EVAL_WIDGET_ENGINE (on or off): default the production default (DEFAULT_SETTINGS).
 * - TUTOR_EVAL_ONLY=T1,T11, TUTOR_EVAL_OUT, TUTOR_EVAL_CONCURRENCY: as for `npm run tutor:eval`.
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
import { budgetCap, requirePrice } from "./budget";
import { CASES_DIR, loadCases } from "./case";
import { renderSweep, runSweep, sweepFiles, sweepFoundSetting, parsePairs } from "./sweep";

const GRADER_MODEL = TUTOR_MODEL;
const OUT = process.env.TUTOR_EVAL_OUT ?? join(process.cwd(), "evidence", "tutor-eval");
const env = process.env;

it("model sweep over the live Tutor tests", { timeout: 6 * 3_600_000 }, async () => {
  const pairs = parsePairs(env.TUTOR_EVAL_MODELS);
  const widgetEngine = (env.TUTOR_EVAL_WIDGET_ENGINE || DEFAULT_SETTINGS.widget_engine) === "on" ? ("on" as const) : ("off" as const);
  for (const p of pairs) requirePrice(p.model);
  requirePrice(GRADER_MODEL);
  const cap = budgetCap(env);
  const loaded = loadCases(CASES_DIR);
  if (loaded.errors.length) throw new Error(`Case files have problems:\n${loaded.errors.join("\n")}`);
  const only = env.TUTOR_EVAL_ONLY?.split(",").map((s) => s.trim());
  const cases = only
    ? loaded.cases.filter((c) => only.includes(c.id)).map((c) => (c.kind === "aggregate" ? { ...c, over: c.over.filter((id) => only.includes(id)) } : c))
    : loaded.cases;

  const openai = new OpenAI();
  const modelClient = tutorClient();
  const engine = widgetEngine === "on";
  const map = loadCourseMap();
  const report = await runSweep(cases, pairs, {
    capUsd: cap,
    log: (line) => console.log(line),
    suiteDeps: (pair, budget) => ({
      map,
      settings: { model: pair.model, effort: pair.effort, widgetEngine },
      graderModel: GRADER_MODEL,
      fingerprint: engine ? fingerprint(ENGINE_INSTRUCTIONS, ENGINE_TOOLS) : fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS),
      budget,
      newDb: testDb,
      tutorClient: () => modelClient,
      grade: async (system, prompt) => {
        const res = await askModel(openai, { model: GRADER_MODEL, system, input: prompt, maxOutputTokens: 16000, effort: "medium" });
        return { text: res.stopReason === "end_turn" ? res.text : `${res.text}\n(stop reason ${res.stopReason})`, costUsd: res.costUsd };
      },
      courseCheck: (cwd) =>
        new Promise((resolve) => {
          execFile(process.execPath, [join(process.cwd(), "scripts", "check-course.mjs")], { cwd }, (err, stdout, stderr) =>
            resolve({ passed: !err, output: `${stdout}${stderr}`.trim() }),
          );
        }),
      concurrency: Number(env.TUTOR_EVAL_CONCURRENCY ?? "3"),
    }),
  });

  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(sweepFiles(report))) writeFileSync(join(OUT, name), text);
  const text = renderSweep(report);
  console.log(text);
  console.log(`Report in ${OUT}`);
  expect(sweepFoundSetting(report), "no model:effort pair passed everything").toBe(true);
});
