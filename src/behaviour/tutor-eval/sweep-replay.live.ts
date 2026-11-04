/**
 * The 50-turn replay (real API, ticket #248). One command: `npm run tutor:replay`, which runs scripts/tutor-replay.mjs.
 * That script reads the last Learner turns from stored Sessions (read-only, with DATABASE_URL from .env), writes them
 * as live cases to TUTOR_REPLAY_CASES, and starts this file with the database address removed from its environment.
 *
 * Each case is replayed through the real Tutor Turn on a fresh in-memory Postgres, then fixReply and checkReply run on
 * the reply. The report (pass rate per rule V1 to V7, the longest reply, every failure in full) goes to evidence/tutor-eval/.
 *
 * Options (environment, set by the script's flags):
 * - TUTOR_REPLAY_CASES: the JSON file of cases (required).
 * - TUTOR_REPLAY_MODEL, TUTOR_REPLAY_EFFORT, TUTOR_REPLAY_WIDGET_ENGINE (on or off): default the production defaults.
 * - TUTOR_REPLAY_BUDGET_USD: the spend cap, default 10. TUTOR_EVAL_OUT, TUTOR_EVAL_CONCURRENCY as for tutor:eval.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { DEFAULT_SETTINGS } from "@/tutor/session-log";
import { Budget, requirePrice } from "./budget";
import { parseCase, type LiveCase } from "./case";
import { renderReplay, replayClean, replayFiles, runReplay } from "./sweep-replay";

const OUT = process.env.TUTOR_EVAL_OUT ?? join(process.cwd(), "evidence", "tutor-eval");
const env = process.env;

it("replay of the last Learner turns", { timeout: 4 * 3_600_000 }, async () => {
  if (!env.TUTOR_REPLAY_CASES) throw new Error("TUTOR_REPLAY_CASES must name the JSON file of cases; run this through `npm run tutor:replay`.");
  const raw = JSON.parse(readFileSync(env.TUTOR_REPLAY_CASES, "utf8")) as unknown[];
  const cases: LiveCase[] = raw.map((c, i) => {
    const parsed = parseCase(JSON.stringify(c), `replay case ${i + 1}`);
    if (parsed.errors.length || !parsed.case || parsed.case.kind !== "live") throw new Error(`Replay case ${i + 1} is not valid:\n${parsed.errors.join("\n")}`);
    return parsed.case;
  });
  const settings = {
    model: env.TUTOR_REPLAY_MODEL || DEFAULT_SETTINGS.model,
    effort: env.TUTOR_REPLAY_EFFORT || DEFAULT_SETTINGS.effort,
    widgetEngine: (env.TUTOR_REPLAY_WIDGET_ENGINE || DEFAULT_SETTINGS.widget_engine) === "on" ? ("on" as const) : ("off" as const),
  };
  requirePrice(settings.model);
  const cap = Number(env.TUTOR_REPLAY_BUDGET_USD || "10");
  if (!Number.isFinite(cap) || cap <= 0) throw new Error(`TUTOR_REPLAY_BUDGET_USD must be a positive number of dollars, not "${env.TUTOR_REPLAY_BUDGET_USD}".`);

  const client = anthropicTutorClient();
  const report = await runReplay(cases, {
    map: loadCourseMap(),
    settings,
    budget: new Budget(cap),
    newDb: testDb,
    tutorClient: () => client,
    concurrency: Number(env.TUTOR_EVAL_CONCURRENCY ?? "3"),
    log: (line) => console.log(line),
  });

  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(replayFiles(report))) writeFileSync(join(OUT, name), text);
  console.log(renderReplay(report));
  console.log(`Report in ${OUT}`);
  expect(replayClean(report), "a replayed reply broke a rule, or a turn did not run (see the report)").toBe(true);
});
