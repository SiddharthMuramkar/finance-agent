/**
 * Live Tutor tests (real API, ticket #236). One command: `npm run tutor:eval`. Kept out of `npm run check`.
 *
 * Runs T1 to T16 (cases/*.json): T1 to T11 from the Percent Session, T12 to T16 for the story-first voice (D3b). Each live case three times, each run on a fresh
 * in-memory Postgres through the real Tutor Turn and the real model, then the reply checks, the case's
 * conditions and an Opus 5.5 grader. The report (every failure in full) goes to evidence/tutor-eval/.
 *
 * Options (environment):
 * - TUTOR_EVAL_BUDGET_USD: the spend cap, default 5. Tutor and grader spend both count.
 * - TUTOR_EVAL_MODEL, TUTOR_EVAL_EFFORT, TUTOR_EVAL_WIDGET_ENGINE (on or off): what the Tutor runs on. Default:
 *   the production defaults (DEFAULT_SETTINGS), so the suite tests what new Sessions get.
 * - TUTOR_EVAL_ONLY=T1,T11: run some cases (aggregates then cover only those).
 * - TUTOR_EVAL_OUT: the report folder, default evidence/tutor-eval.
 * - TUTOR_EVAL_CONCURRENCY: runs side by side, default 3.
 */
import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS, TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { costUsd } from "@/tutor/pricing";
import { DEFAULT_SETTINGS, fingerprint } from "@/tutor/session-log";
import { Budget, budgetCap, requirePrice } from "./budget";
import { CASES_DIR, loadCases } from "./case";
import { allPassed, renderSummary, reportFiles } from "./report";
import { runSuite } from "./run-suite";

const GRADER_MODEL = "claude-opus-5-5";
const OUT = process.env.TUTOR_EVAL_OUT ?? join(process.cwd(), "evidence", "tutor-eval");
const env = process.env;

it("live Tutor tests T1 to T16", { timeout: 3_600_000 }, async () => {
  const settings = {
    model: env.TUTOR_EVAL_MODEL || DEFAULT_SETTINGS.model,
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

  const anthropic = new Anthropic();
  const tutorClient = anthropicTutorClient();
  const engine = settings.widgetEngine === "on";
  const report = await runSuite(cases, {
    map: loadCourseMap(),
    settings,
    graderModel: GRADER_MODEL,
    fingerprint: engine ? fingerprint(ENGINE_INSTRUCTIONS, ENGINE_TOOLS) : fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS),
    budget,
    newDb: testDb,
    tutorClient: () => tutorClient,
    grade: async (system, prompt) => {
      // Opus 5.5 always thinks, and max_tokens counts the thinking too, so it is generous; effort is set, not left to the default.
      const res = await anthropic.messages.create({
        model: GRADER_MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const u = res.usage;
      const cost =
        costUsd(GRADER_MODEL, {
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        }) ?? 0;
      // A refusal or a cut-off grade has no JSON, so it reads as unreadable and fails the run.
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return { text: res.stop_reason === "end_turn" ? text : `${text}\n(stop reason ${res.stop_reason})`, costUsd: cost };
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
