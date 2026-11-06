// The 20-prompt Widget eval (UX audit §13.3, targets in ★.10): sends twenty beginner prompts to the real Tutor in a real
// browser and measures what comes back.
//
// It signs in to a LOCAL production server that runs against a Neon TEST BRANCH, always as the tools Learner (never the
// owner), and for each prompt starts that Learner over, reaches the Study Workspace with a Topic started (the same
// path as scripts/browser-check.mjs part 4), waits for the opening turn to finish, types the prompt and presses Send.
// From that moment (t0) it records first pixel, interactive and done times, whether a "Drawing…" skeleton or chip
// stayed up for more than 12 s, then reads the Session's rows from the database to find which lane served the Widget
// (recipe, compose, fallback, a fence in the reply, or none) and runs the automatic checks on its code.
// It saves one screenshot of the Widget panel per prompt. The Purpose / Concrete / Delight scores (0 to 2) are NOT
// computed here: a person or a model fills them in from the screenshots and passes them back with --scores.
// This makes about 20 to 25 real Tutor turns (a few cents each) on the test branch.
//
//   node --env-file=.env scripts/widget-eval.mjs <output-folder> [--only 3,11,19] [--scores scores.json] [--name eval-report]
//
//   --only    run just these prompt numbers (a smoke test)
//   --scores  a JSON file {"3": {"purpose": {"score": 2, "why": "…"}, "concrete": {…}, "delight": {…}}, …}; it is merged
//             in (each marked modelScored: true) and the summary means are computed from it. With no --only and no
//             --scores, the run reuses nothing: scores stay null.
//   --name    base name of the two files written into the folder (default "eval-report"): <name>.json and <name>.md
//   --set     "delight" runs the 20-prompt Delight eval of spec Appendix D (src/behaviour/delight/prompts.json) in place of
//             the built-in set: each prompt opens its own Topic at its own Teaching Step, and the report is the G2 bars
//             (delight-report.json and .md by default). npm run delight:eval wraps this.
//   --judge   with --set delight: runs the four Appendix D.2 judges (scripts/delight-judge.mjs, Opus) over each prompt.
//             This is PAID (about 22 Tutor turns plus 80 judge calls). DELIGHT_BUDGET_USD (default 13) caps the whole round:
//             each prompt's Tutor turns are charged from the usage rows the app records, a prompt that would pass the cap
//             is not started, and the judges get what is left. Without --judge the Tutor turns are still capped.
//             It needs ANTHROPIC_API_KEY in the environment; it is never run in CI.
//   --rescore re-reads <folder>/<name>.json, merges --scores and rewrites both files without running anything
//
// Environment (the orchestrator sets these):
//   DATABASE_URL     the test branch's pooled connection string (the server needs the same one)
//   PASSCODES        the same passcode list the local server was started with; it must list a tools:<passcode> pair
//   BASE_URL         where the server listens (default http://localhost:3101); localhost, 127.0.0.1 or ::1 only
//   EVAL_DB_OK       must be "branch", your statement that DATABASE_URL is a Neon test branch. The run prints the database
//                    host and refuses without it (and refuses the host named by PROD_DB_HOST, if set)
//   PLAYWRIGHT_CORE  optional path to a playwright-core install when it is not in node_modules
//
// The widget checks import src/widgets/check.ts, which uses the "@/" alias, so the script loads `tsx` (already in
// node_modules as a dependency of other tools; it is not a direct dependency of the app).
//
// Archetype: archetypeOf (src/widgets/check.ts) names a Widget by its parts. The expected sets below map §13.3's
// "Expected archetype" column onto those names (Grow, Compare, History, Formula, Predict, Check, Rank, Chain, Convert).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAtStep, openStudy, waitForOpener } from "./delight-study.mjs";
import { openTurns, readDelight, readLane, tutorSteps } from "./eval-reads.mjs";
import { assertLocalBase, assertTestDatabase, assertToolsLearner } from "./script-guards.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag("--only") ? new Set(flag("--only").split(",").map((n) => Number(n.trim()))) : null;
const scoresFile = flag("--scores");
const rescore = args.includes("--rescore");
const setName = flag("--set");
const judge = args.includes("--judge");
if (setName !== undefined && setName !== "delight") {
  console.error(`Unknown --set "${setName}": the only named set is "delight".`);
  process.exit(2);
}
if (judge && setName !== "delight") {
  console.error("--judge belongs to --set delight.");
  process.exit(2);
}
const DELIGHT = setName === "delight";
const reportName = flag("--name") ?? (DELIGHT ? "delight-report" : "eval-report");
// The output folder is the first argument; the Delight set may leave it out (DELIGHT_OUT, or a fresh folder in the temp directory).
const out = args[0] && !args[0].startsWith("--") ? args[0] : DELIGHT ? (process.env.DELIGHT_OUT ?? join(tmpdir(), `delight-eval-${new Date().toISOString().replace(/[:.]/g, "-")}`)) : undefined;
if (!out) {
  console.error("Usage: node --env-file=.env scripts/widget-eval.mjs <output-folder> [--only 3,11,19] [--scores scores.json] [--name eval-report] [--rescore]\n       node --env-file=.env scripts/widget-eval.mjs --set delight [--judge] [--only 1,5]   (npm run delight:eval)");
  process.exit(2);
}
if (DELIGHT) console.log(`Delight eval output: ${out}`);
mkdirSync(out, { recursive: true });

// ---------- the eval set (REPORT.md §13.3) ----------

/** @type {{ n: number, slug: string, prompt: string, expected: string, expectedSet: string[] }[]} */
const BUILTIN_PROMPTS = [
  [1, "time-value", "why is 100 rupees today worth more than 100 rupees next year? show me", "Grow (TimeTravel) or Duel", ["Grow", "Compare"]],
  [2, "cash-vs-annuity", "at what interest rate does the cash option beat the annuity? let me find it", "Duel + Breakeven", ["Compare"]],
  [3, "sip", "if i put 1000 rupees every month in a SIP, how much after 20 years", "Grow (MoneyStack)", ["Grow"]],
  [4, "inflation", "explain inflation simply with something i can play with", "Grow (PriceTag / ShrinkingNote)", ["Grow"]],
  [5, "diversification", "what does diversification mean? make a widget so i get it", "Duel (sticky scale)", ["Compare"]],
  [6, "quiz-pv", "quiz me with 3 quick questions on present value", "Check (QuickCheck)", ["Check"]],
  [7, "home-loan", "home loan of 20 lakh: 10 years vs 20 years", "Duel (MoneyStack inside Versus)", ["Compare"]],
  [8, "gold-bars", "show me gold bars vs usd or inr", "Pictogram (gold-bar)", ["Convert"]],
  [9, "gold-bad-times", "why do people buy gold in bad times", "Chain (StepThrough) + QuickCheck", ["Chain", "Check"]],
  [10, "pp-vs-bps", "what's the difference between a percentage point and a basis point", "Grid (Waffle)", ["Convert"]],
  [11, "sensex", "how fast did the Sensex grow from 1979 to 1992?", "Predict → Reveal", ["Predict", "History"]],
  [12, "rule-of-72", "what is the rule of 72?", "Predict + Grow", ["Predict", "Grow"]],
  [13, "fd-vs-ppf", "FD or PPF for 15 years?", "Duel", ["Compare"]],
  [14, "liquidity-solvency", "liquidity vs solvency, explain simply", "Chain or Rank", ["Chain", "Rank"]],
  [15, "rank-liquidity", "rank these by how fast they turn into cash: house, FD, gold, shares, savings account", "Rank", ["Rank"]],
  [16, "emi", "what's my EMI on a 5 lakh car loan for 5 years", "Stat + MoneyStack", ["Grow"]],
  [17, "fund-fee", "what does a 2% fund fee cost me over 20 years", "Duel (with vs without fee)", ["Compare"]],
  [18, "compound-coins", "explain compound interest with coins", "Pictogram / MoneyStack", ["Convert", "Grow"]],
  [19, "net-worth", "what's the formula for net worth", "Formula + Stat", ["Formula", "Grow"]],
  [20, "rupee-fall", "if the rupee falls from 83 to 90 per dollar, what happens to my US trip budget", "Pictogram (note-usd) or Versus", ["Convert", "Compare"]],
].map(([n, slug, prompt, expected, expectedSet]) => ({ n, slug, prompt, expected, expectedSet }));

/** The Delight set (spec Appendix D.1): the same row shape, plus the Topic and Teaching Step each prompt opens at. */
const DELIGHT_PROMPTS = JSON.parse(readFileSync(new URL("../src/behaviour/delight/prompts.json", import.meta.url), "utf8")).map((p, i) => ({
  n: i + 1, slug: p.id.toLowerCase(), id: p.id, prompt: p.message, topic: p.topic, step: p.step, expected: "a Widget with every reply", expectedSet: [],
}));
const PROMPTS = DELIGHT ? DELIGHT_PROMPTS : BUILTIN_PROMPTS;

// ---------- numbers and summaries ----------

const pad = (n) => String(n).padStart(2, "0");
const percentile = (values, p) => {
  const v = values.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
};
const mean = (values) => {
  const v = values.filter((x) => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};
const pct = (rows, pick) => {
  const known = rows.map(pick).filter((x) => x === true || x === false);
  return known.length ? Math.round((known.filter(Boolean).length / known.length) * 1000) / 10 : null;
};

/** The ★.10 summary and targets from the rows. */
function summarize(rows) {
  const recipe = rows.filter((r) => r.lane === "recipe");
  const freeform = rows.filter((r) => r.lane === "compose" || r.lane === "fallback" || r.lane === "fence");
  const served = rows.filter((r) => r.lane !== "none");
  const archetypes = new Set(rows.map((r) => r.archetype).filter(Boolean));
  const score = (key) => mean(rows.map((r) => r.scores?.[key]?.score));
  const summary = {
    prompts: rows.length,
    widgetsServed: served.length,
    recipeServed: recipe.length,
    recipeFirstPixelP50: percentile(recipe.map((r) => r.firstPixelMs), 50),
    recipeFirstPixelP95: percentile(recipe.map((r) => r.firstPixelMs), 95),
    recipeInteractiveP50: percentile(recipe.map((r) => r.interactiveMs), 50),
    recipeInteractiveP95: percentile(recipe.map((r) => r.interactiveMs), 95),
    freeformInteractiveP95: percentile(freeform.map((r) => r.interactiveMs), 95),
    recipeFirstPixelProdEqP50: percentile(recipe.map((r) => r.prodEq?.firstPixelMs), 50),
    recipeFirstPixelProdEqP95: percentile(recipe.map((r) => r.prodEq?.firstPixelMs), 95),
    recipeInteractiveProdEqP50: percentile(recipe.map((r) => r.prodEq?.interactiveMs), 50),
    recipeInteractiveProdEqP95: percentile(recipe.map((r) => r.prodEq?.interactiveMs), 95),
    freeformInteractiveProdEqP95: percentile(freeform.map((r) => r.prodEq?.interactiveMs), 95),
    stuckOver12s: rows.filter((r) => r.stuck).length,
    numbersFromCodeOrDataPct: pct(served, (r) => r.checks.numbersFromCodeOrData),
    lintFailures: served.filter((r) => r.checks.validatorProblems.length > 0).length,
    validatorWarningFailures: served.filter((r) => r.checks.validatorWarnings.length > 0).length,
    overflowAt480Failures: served.filter((r) => r.checks.overflowAt480 === true).length,
    chartsOutsideTabsFailures: served.filter((r) => r.checks.chartsOutsideTabs > 1).length,
    hasVerdictOrStatPct: pct(served, (r) => r.checks.hasVerdictOrStat),
    archetypeExpectedPct: pct(served, (r) => r.checks.archetypeExpected),
    withinBudgetPct: pct(served, (r) => r.checks.withinBudget),
    visibleWithin6sPct: pct(rows, (r) => (r.firstPixelMs == null ? false : r.firstPixelMs <= 6000)),
    distinctArchetypes: archetypes.size,
    archetypes: [...archetypes].sort(),
    purposeMean: score("purpose"),
    concreteMean: score("concrete"),
    delightMean: score("delight"),
    lanes: Object.fromEntries(["recipe", "compose", "fallback", "fence", "none"].map((l) => [l, rows.filter((r) => r.lane === l).length])),
  };
  const t = (name, target, actual, pass) => ({ name, target, actual, pass: actual == null ? null : pass });
  const targets = [
    t("Asks served by a recipe", ">= 16 / 20", summary.recipeServed, summary.recipeServed >= 16),
    t("Recipe first pixel p50 (ms)", "<= 3000", summary.recipeFirstPixelP50, summary.recipeFirstPixelP50 <= 3000),
    t("Recipe first pixel p95 (ms)", "<= 5000", summary.recipeFirstPixelP95, summary.recipeFirstPixelP95 <= 5000),
    t("Recipe interactive p50 (ms)", "<= 4000", summary.recipeInteractiveP50, summary.recipeInteractiveP50 <= 4000),
    t("Recipe interactive p95 (ms)", "<= 7000", summary.recipeInteractiveP95, summary.recipeInteractiveP95 <= 7000),
    t("Freeform interactive p95 (ms)", "<= 10000", summary.freeformInteractiveP95, summary.freeformInteractiveP95 <= 10000),
    t("Recipe first pixel p50, production-equivalent (ms)", "<= 3000", summary.recipeFirstPixelProdEqP50, summary.recipeFirstPixelProdEqP50 <= 3000),
    t("Recipe first pixel p95, production-equivalent (ms)", "<= 5000", summary.recipeFirstPixelProdEqP95, summary.recipeFirstPixelProdEqP95 <= 5000),
    t("Recipe interactive p50, production-equivalent (ms)", "<= 4000", summary.recipeInteractiveProdEqP50, summary.recipeInteractiveProdEqP50 <= 4000),
    t("Recipe interactive p95, production-equivalent (ms)", "<= 7000", summary.recipeInteractiveProdEqP95, summary.recipeInteractiveProdEqP95 <= 7000),
    t("Freeform interactive p95, production-equivalent (ms)", "<= 10000", summary.freeformInteractiveProdEqP95, summary.freeformInteractiveProdEqP95 <= 10000),
    t("Widgets stuck > 12 s", "0", summary.stuckOver12s, summary.stuckOver12s === 0),
    t("Numbers from code or data (%)", "100", summary.numbersFromCodeOrDataPct, summary.numbersFromCodeOrDataPct === 100),
    t("Visual lint failures", "0", summary.lintFailures, summary.lintFailures === 0),
    t("Within the information budget (%)", "100", summary.withinBudgetPct, summary.withinBudgetPct === 100),
    t("Distinct archetypes across the prompts", ">= 6", summary.distinctArchetypes, summary.distinctArchetypes >= 6),
    t("Delight score (0 to 2, model-scored)", ">= 1.5", summary.delightMean, summary.delightMean >= 1.5),
  ];
  return { summary, targets };
}

/** Merges model scores (a person or a model reading the screenshots) into the rows. */
function mergeScores(rows, scores) {
  for (const row of rows) {
    const s = scores?.[String(row.n)];
    if (!s) continue;
    row.scores = {};
    for (const key of ["purpose", "concrete", "delight"]) if (s[key]) row.scores[key] = { score: s[key].score, why: s[key].why ?? "", modelScored: true };
  }
}

const mark = (v) => (v === true ? "pass" : v === false ? "FAIL" : "n/a");
const sec = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)}s`);

function writeReport(rows, extra) {
  const { summary, targets } = summarize(rows);
  const report = { ...extra, prompts: rows, summary, targets };
  writeFileSync(join(out, `${reportName}.json`), JSON.stringify(report, null, 2));
  const md = [];
  md.push(`# Widget eval: ${rows.length} prompt${rows.length === 1 ? "" : "s"}`, "");
  md.push(`Run ${extra.ranAt} against ${extra.base} (one local run on a Neon test branch). Purpose / Concrete / Delight are model-scored from the screenshots, not human-scored.`, "");
  md.push("## Targets (REPORT.md ★.10)", "", "| Check | Target | Actual | Result |", "|---|---|---|---|");
  for (const x of targets) md.push(`| ${x.name} | ${x.target} | ${x.actual ?? "-"} | ${x.pass == null ? "n/a" : x.pass ? "pass" : "FAIL"} |`);
  md.push("", "## Prompts", "", "| # | Prompt | Lane | Archetype (expected) | First px | Interactive | Done | Stuck | Lint | Budget | Overflow 480 | P / C / D | Screenshot |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const s = r.scores;
    const pcd = s ? ["purpose", "concrete", "delight"].map((k) => s[k]?.score ?? "-").join(" / ") : "-";
    md.push(
      `| ${r.n} | ${r.prompt} | ${r.lane}${r.recipe ? ` (${r.recipe})` : ""} | ${r.archetype ?? "-"} (${r.expectedSet.join("/")}) ${mark(r.checks.archetypeExpected)} | ${sec(r.firstPixelMs)} (prod-eq ${sec(r.prodEq?.firstPixelMs)}) | ${sec(r.interactiveMs)} (prod-eq ${sec(r.prodEq?.interactiveMs)}) | ${sec(r.doneMs)} | ${r.stuck ? "YES" : "no"} | ${r.checks.validatorProblems.length + r.checks.validatorWarnings.length ? "FAIL" : mark(r.lane === "none" ? null : true)} | ${mark(r.checks.withinBudget)} | ${r.checks.overflowAt480 == null ? "n/a" : r.checks.overflowAt480 ? "FAIL" : "pass"} | ${pcd} | ${r.screenshot ?? "-"} |`,
    );
  }
  const notes = rows.filter((r) => r.error || r.stopped || r.checks.validatorProblems.length || r.checks.validatorWarnings.length || r.scores);
  if (notes.length) {
    md.push("", "## Notes", "");
    for (const r of notes) {
      const bits = [];
      if (r.error) bits.push(`error: ${r.error}`);
      if (r.stopped) bits.push(`stopped: ${r.stopped}`);
      for (const p of r.checks.validatorProblems) bits.push(`validator problem: ${p}`);
      for (const w of r.checks.validatorWarnings) bits.push(`warning: ${w}`);
      if (r.scores) for (const k of ["purpose", "concrete", "delight"]) if (r.scores[k]) bits.push(`${k} ${r.scores[k].score}: ${r.scores[k].why}`);
      md.push(`- **${r.n}. ${r.slug}**: ${bits.join("; ")}`);
    }
  }
  writeFileSync(join(out, `${reportName}.md`), md.join("\n") + "\n");
  return report;
}

const readJson = (file) => JSON.parse(readFileSync(resolve(file), "utf8"));

if (rescore) {
  const report = readJson(join(out, `${reportName}.json`));
  if (scoresFile) mergeScores(report.prompts, readJson(scoresFile));
  const extra = { ...report };
  for (const k of ["prompts", "summary", "targets"]) delete extra[k];
  const prompts = report.prompts;
  writeReport(prompts, extra);
  console.log(`Rescored ${prompts.length} prompts into ${join(out, reportName)}.json and .md`);
  process.exit(0);
}

// ---------- the run ----------

const { DATABASE_URL } = process.env;
const BASE = (process.env.BASE_URL ?? "http://localhost:3101").replace(/\/$/, "");
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set: run with node --env-file=.env (the test branch's .env).");
  process.exit(2);
}
try {
  assertLocalBase(BASE);
  assertTestDatabase(DATABASE_URL, process.env);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

// The checks import TypeScript with the "@/" alias; tsx resolves both.
try {
  const { register } = await import("tsx/esm/api");
  register();
} catch (e) {
  console.error(`Could not load tsx (${e?.message ?? e}). Run npm ci first.`);
  process.exit(2);
}
const { Pool } = await import("@neondatabase/serverless");
const { signInAsToolsLearner, toolsPasscode } = await import("../src/dev/simulated-learner.ts");
const check = await import("../src/widgets/check.ts");
const PASSCODE = toolsPasscode();

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ? resolve(process.env.PLAYWRIGHT_CORE) : "playwright-core");

const VIEWPORT = { width: 1280, height: 800 };
const TURN_TIMEOUT_MS = 180_000;

const CHARTS = new Set(["LineChart", "AreaChart", "BarChart", "HorizontalBarChart", "RadarChart", "PieChart", "RadialChart", "SingleStackedBarChart", "ScatterChart", "HistoryChart", "AnnuityChart"]);
const BUDGET_WARNING = /controls are showing|visuals:|numbers are showing|words of text|TextCallouts|Guided Tasks:/;
const FROM_CODE_PARTS = new Set(["Calculator", "FormulaCard", "HistoryChart", "AnnuityChart"]);

const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** The highest message seq of the Learner's latest Session (0 when none): taken just before a prompt is sent, it marks where the prompt starts. */
async function maxSeq(pool, learnerId) {
  const { rows } = await pool.query(
    `select coalesce(max(seq), 0)::int as seq from messages where session_id = (select id from sessions where learner_id = $1 order by id desc limit 1)`,
    [learnerId],
  );
  return rows[0].seq;
}

/**
 * Production-equivalent timings, from the database timeline (docs: run/latency-analysis.md). A local server sits far from
 * the database, so every round trip adds time that production (Vercel next to Neon) does not have. Instead of the wall
 * clock, this adds up what the model took (the `usage` step rows) plus 100 ms of tool work, 500 ms of server overhead and
 * the client render measured locally (the gap between the Widget being stored and seen). Null when no Widget was served.
 */
async function prodEquivalent(pool, sessionId, row) {
  if (!sessionId) return null;
  const turn = (await pool.query(`select id, started_at, finished_at from turns where session_id = $1 order by id desc limit 1`, [sessionId])).rows[0];
  if (!turn) return null;
  const steps = (await pool.query(
    `select step, duration_ms, tools, created_at from usage where session_id = $1 and kind = 'step' and turn_seq = (select max(turn_seq) from usage where session_id = $1) order by step`,
    [sessionId],
  )).rows;
  if (!steps.length) return null;
  const OVERHEAD_MS = 500;
  const TOOL_MS = 100;
  const modelMs = steps.reduce((s, x) => s + x.duration_ms, 0);
  const startedAt = +new Date(turn.started_at);
  const timeline = steps.map((s) => ({ step: s.step, durationMs: s.duration_ms, tools: s.tools, endedAfterTurnStartMs: +new Date(s.created_at) - startedAt }));
  const out = { timeline, firstModelCallAfterTurnStartMs: timeline[0].endedAfterTurnStartMs - timeline[0].durationMs, modelMs, doneMs: modelMs + OVERHEAD_MS };
  if (row.lane === "none") return out;
  const item = (await pool.query(`select created_at from session_items where session_id = $1 and kind = 'widget_shown' and created_at >= $2 order by id desc limit 1`, [sessionId, turn.started_at])).rows[0];
  const at = steps.findIndex((s) => (s.tools ?? []).some((t) => /widget/.test(t)));
  if (!item || at < 0 || row.firstPixelMs == null) return out;
  const itemAt = +new Date(item.created_at) - startedAt;
  const clientRenderMs = Math.max(0, Math.min(row.firstPixelMs - itemAt, 2000));
  const upToWidget = steps.slice(0, at + 1).reduce((s, x) => s + x.duration_ms, 0);
  const firstPixelMs = upToWidget + TOOL_MS + OVERHEAD_MS + clientRenderMs;
  const interactiveMs = firstPixelMs + Math.max(0, (row.interactiveMs ?? row.firstPixelMs) - row.firstPixelMs);
  return { ...out, widgetStep: steps[at].step, clientRenderMs, firstPixelMs, interactiveMs, doneMs: modelMs + TOOL_MS + OVERHEAD_MS };
}

/** The automatic checks on a Widget's code (§13.3), minus the ones that need the browser. */
function codeChecks(lane, code, title, expectedSet) {
  const none = { validatorProblems: [], validatorWarnings: [], chartsOutsideTabs: 0, hasVerdictOrStat: null, archetypeExpected: null, withinBudget: null, numbersFromCodeOrData: null, overflowAt480: null };
  if (!code) return { archetype: null, checks: none };
  const problems = check.widgetProblems(code);
  const warnings = check.widgetWarnings(code);
  const nodes = check.widgetNodes(code);
  const inTabs = new Set(nodes.filter((n) => n.typeName === "Tabs").flatMap((n) => [...walkAll(n.props)]));
  const charts = nodes.filter((n) => CHARTS.has(n.typeName) && !inTabs.has(n)).length;
  const parts = check.widgetParts(code);
  const names = new Set(nodes.map((n) => n.typeName));
  const archetype = check.archetypeOf(code);
  const illustration = /^illustration:/i.test(squash(title ?? parts.title ?? ""));
  const fromCode = lane === "recipe" || parts.tools.length > 0 || parts.datasets.length > 0 || [...names].some((x) => FROM_CODE_PARTS.has(x)) || illustration;
  const typedNumbers = warnings.some((w) => /typed|are typed/.test(w));
  return {
    archetype,
    checks: {
      validatorProblems: problems,
      validatorWarnings: warnings,
      chartsOutsideTabs: charts,
      hasVerdictOrStat: names.has("Verdict") || names.has("Stat"),
      archetypeExpected: archetype ? expectedSet.includes(archetype) : false,
      withinBudget: !warnings.some((w) => BUDGET_WARNING.test(w)),
      numbersFromCodeOrData: fromCode && !typedNumbers,
      overflowAt480: null,
    },
  };
}

/** Every ParsedNode nested in a value (props of a part), for "inside Tabs". */
function* walkAll(value) {
  yield* nestedNodes(value);
}
function* nestedNodes(value) {
  if (Array.isArray(value)) for (const v of value) yield* nestedNodes(v);
  else if (value && typeof value === "object") {
    if (typeof value.typeName === "string") yield value;
    for (const v of Object.values(value)) yield* nestedNodes(v);
  }
}

/** Watches the page from the moment of Send: first pixel, interactive, done and the longest stretch of a skeleton. */
const WATCHER = () => {
  const card = () => document.querySelector('[data-testid="widget-card"]');
  const signature = (el) => (el ? (el.innerText || "").replace(/\s+/g, " ").trim() : "");
  const before = signature(card());
  const state = { t0: performance.now(), before, firstPixelMs: null, interactiveMs: null, approxFirstPixelMs: null, approxInteractiveMs: null, mutated: false, doneMs: null, seenRunning: false, stuckMs: 0, skeletonSince: null, stopped: null };
  window.__eval = state;
  // A Widget the Tutor shows again with the same words changes no text, so a change inside the panel is a weaker
  // sign (approx*) that the new one arrived; the strict sign (a different text) wins when it is there.
  const inPane = (node) => {
    const el = node instanceof Element ? node : node.parentElement;
    return !!el && (!!el.closest('[data-testid="widget-pane"], [data-testid="widget-card"]') || !!el.querySelector?.('[data-testid="widget-card"]'));
  };
  new MutationObserver((list) => {
    if (list.some((m) => inPane(m.target) || [...m.addedNodes].some(inPane))) state.mutated = true;
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  const CONTROL = 'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="slider"], [role="tab"]';
  const tick = () => {
    const now = performance.now() - state.t0;
    const c = card();
    const skeleton = document.querySelector('[data-testid="widget-skeleton"], [data-state="drawing"]');
    if (skeleton) {
      if (state.skeletonSince == null) state.skeletonSince = now;
      state.stuckMs = Math.max(state.stuckMs, now - state.skeletonSince);
    } else state.skeletonSince = null;
    const fresh = c && !c.querySelector('[data-testid="widget-skeleton"]') && signature(c).length > 0 && signature(c) !== state.before;
    if (fresh && state.firstPixelMs == null) state.firstPixelMs = now;
    if (fresh && state.interactiveMs == null && c.querySelector(CONTROL)) state.interactiveMs = now;
    const settled = c && state.mutated && !c.querySelector('[data-testid="widget-skeleton"]') && signature(c).length > 0;
    if (settled && state.approxFirstPixelMs == null) state.approxFirstPixelMs = now;
    if (settled && state.approxInteractiveMs == null && c.querySelector(CONTROL)) state.approxInteractiveMs = now;
    const running = !!document.querySelector('[data-testid="stop-reply"]');
    if (running) state.seenRunning = true;
    if (state.seenRunning && !running && state.doneMs == null) state.doneMs = now;
    const stopped = document.querySelector('[data-testid="stopped-note"]');
    if (stopped && state.stopped == null) state.stopped = stopped.textContent;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Measures the Widget card at 480 px wide: does anything stick out sideways? */
async function overflowAt480(page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="widget-card"]');
    if (!card) return null;
    const saved = card.getAttribute("style");
    card.style.width = "480px";
    card.style.maxWidth = "480px";
    card.style.boxSizing = "border-box";
    const box = card.getBoundingClientRect();
    let over = card.scrollWidth > card.clientWidth + 1;
    for (const el of card.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > box.right + 1 && getComputedStyle(el).position !== "fixed") {
        // A descendant of a scroll box that scrolls on purpose (a table) is not an overflow of the card.
        let p = el.parentElement;
        let scrolls = false;
        while (p && p !== card) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") scrolls = true;
          p = p.parentElement;
        }
        if (!scrolls) {
          over = true;
          break;
        }
      }
    }
    if (saved == null) card.removeAttribute("style");
    else card.setAttribute("style", saved);
    return over;
  });
}

/**
 * Starts the tools Learner over, signs in by the page and starts the first Topic; resolves when the opening turn is done.
 * `seen.learnerId` is set as soon as the fresh Learner exists, so the Delight budget can charge a try that fails later.
 */
async function reachStudy(browser, pool, p, seen) {
  const { learnerId } = await signInAsToolsLearner(BASE);
  seen.learnerId = learnerId;
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Passcode", { exact: true }).fill(PASSCODE);
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await page.waitForURL(/\/welcome/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Skip", exact: true }).click();
  if (DELIGHT) {
    await openAtStep(pool, learnerId, p);
    await openStudy(page, BASE);
  } else {
    const start = page.getByRole("button", { name: "Start this Topic", exact: true });
    await start.waitFor({ timeout: 15_000 });
    await start.click();
    await page.waitForURL(/\/study/, { timeout: 30_000 });
  }
  await waitForOpener(page, TURN_TIMEOUT_MS);
  return { context, page, learnerId };
}

async function evalPrompt(browser, pool, p, seen = { learnerId: null }) {
  const row = {
    n: p.n, slug: p.slug, prompt: p.prompt, expected: p.expected, expectedSet: p.expectedSet, ...(DELIGHT ? { id: p.id, topic: p.topic, step: p.step } : {}),
    lane: "none", recipe: null, params: null, title: null, archetype: null, code: null,
    firstPixelMs: null, interactiveMs: null, doneMs: null, stuck: false, stuckMs: 0, stopped: null, error: null,
    toolsUsed: [], checks: codeChecks("none", null, null, p.expectedSet).checks, screenshot: null, scores: null,
  };
  const { context, page, learnerId } = await reachStudy(browser, pool, p, seen);
  try {
    await assertToolsLearner(pool, learnerId);
    const promptSeq = await maxSeq(pool, learnerId);
    const box = page.getByRole("textbox", { name: "Message" });
    await box.fill(p.prompt);
    await page.evaluate(WATCHER);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const until = Date.now() + TURN_TIMEOUT_MS;
    let state;
    for (;;) {
      state = await page.evaluate(() => window.__eval);
      if (state.doneMs != null || Date.now() > until) break;
      await page.waitForTimeout(500);
    }
    if (state.doneMs == null) {
      row.error = `the turn did not finish in ${TURN_TIMEOUT_MS / 1000}s`;
      // The server keeps running the turn after the page closes: its usage is charged once it settles (E4b-C2).
      row.turnUnfinished = true;
    }
    // A last moment for the Widget to settle before it is measured and photographed.
    await page.waitForTimeout(800);
    state = await page.evaluate(() => window.__eval);
    const approx = state.firstPixelMs == null && state.approxFirstPixelMs != null;
    Object.assign(row, { firstPixelApprox: approx || undefined, firstPixelMs: round(state.firstPixelMs ?? state.approxFirstPixelMs), interactiveMs: round(state.interactiveMs ?? state.approxInteractiveMs), doneMs: round(state.doneMs), stuckMs: round(state.stuckMs), stuck: state.stuckMs > 12_000, stopped: state.stopped });

    const lane = await readLane(pool, learnerId, promptSeq);
    Object.assign(row, { lane: lane.lane, recipe: lane.recipe ?? null, params: lane.params ?? null, title: lane.title ?? null, code: lane.code ?? null, toolsUsed: lane.toolsUsed ?? [], widgetsShown: lane.widgetsShown ?? 0, sessionId: lane.sessionId ?? null });
    row.prodEq = await prodEquivalent(pool, lane.sessionId, row);
    if (lane.turn?.error && !row.error) row.error = lane.turn.error;
    if (lane.turn?.status && lane.turn.status !== "done" && lane.turn.status !== "finished") row.turnStatus = lane.turn.status;
    if (lane.turn?.status === "running") row.turnUnfinished = true;
    if (lane.lane !== "none" && row.firstPixelMs == null) row.firstPixelNote = "the Widget on screen did not change, so no arrival was seen (the Tutor showed the one already open again)";
    const { archetype, checks } = codeChecks(lane.lane, lane.code, lane.title, p.expectedSet);
    row.archetype = archetype;
    row.checks = checks;
    if (DELIGHT) {
      Object.assign(row, { id: p.id, topic: p.topic, step: p.step });
      row.delight = await readDelight(pool, lane.sessionId, promptSeq, lane.lane);
    }

    if (page.locator('[data-testid="widget-card"]').first && (await page.locator('[data-testid="widget-card"]').count())) {
      const file = join(out, `${pad(p.n)}-${p.slug}.png`);
      const pane = page.locator('[data-testid="widget-pane"]').first();
      if (await pane.count()) await pane.screenshot({ path: file });
      else await page.screenshot({ path: file });
      row.screenshot = file;
      row.checks.overflowAt480 = await overflowAt480(page);
    } else {
      const file = join(out, `${pad(p.n)}-${p.slug}.png`);
      await page.screenshot({ path: file });
      row.screenshot = file;
    }
  } finally {
    await context.close();
  }
  return row;
}

const round = (x) => (typeof x === "number" ? Math.round(x) : null);

/**
 * Delight set: judges (with --judge), the Appendix D.3 bars, and the two report files. `spend` already holds the round's
 * Tutor turns, so the judges get what is left of the one cap, and `problems` already names any prompt the cap stopped.
 */
async function finishDelight(rows, spend, problems) {
  const { caseOf, computeBars, alsoReported } = await import("../src/behaviour/delight/judges.ts");
  const { readOutlineText } = await import("../src/course/map.ts");
  if (judge) {
    const { judgePrompt, realClient } = await import("./delight-judge.mjs");
    const client = await realClient();
    const outline = readOutlineText();
    for (const row of rows) {
      if (!row.delight) continue;
      const { title, caseText } = caseOf(outline, row.topic);
      const evidence = { prompt: { id: row.id, topic: row.topic, step: row.step, message: row.prompt }, topicTitle: title, reply: row.delight.reply, choices: row.delight.choices, widgetCode: row.code, widgetSource: row.delight.widgetSource, caseText };
      try {
        const r = await judgePrompt({ client, spend, evidence, screenshot: row.screenshot });
        row.judgements = r.judgements;
        for (const e of r.errors) problems.push(`${row.id} ${e}`);
        if (r.skipped.length) problems.push(`${row.id}: not judged by ${r.skipped.join(", ")} (${spend.uncounted ? "the round's spend is no longer known" : `the $${spend.cap} cap`})`);
      } catch (e) {
        problems.push(`${row.id}: judging failed: ${String(e?.message ?? e).split("\n")[0]}`);
      }
      console.log(`${row.id} judged; spent $${spend.spent.toFixed(2)} of $${spend.cap}`);
    }
  }
  const results = rows.map((r) => ({ id: r.id, widgetSource: r.delight?.widgetSource ?? null, choicesCount: r.delight?.choicesCount ?? null, persona: r.judgements?.persona, math: r.judgements?.math, fit: r.judgements?.fit, historian: r.judgements?.historian }));
  // One row per planned prompt (E4b-B1): a prompt that never ran is a failed row, so the bars count all of them.
  const total = rows.length;
  const bars = computeBars(results, total, judge);
  const also = alsoReported(results);
  const usd = (x) => Math.round(x * 100) / 100;
  // "floor-with-reserve": a try's turns never settled, so a reserve stands in for what was not read (E4b-C2).
  const spendIs = spend.uncounted ? "floor" : spend.reserve.usd > 0 ? "floor-with-reserve" : "exact";
  const report = { ranAt: new Date().toISOString(), base: BASE, judged: judge, spendUsd: usd(spend.spent), tutorSpendUsd: usd(spend.tutor.usd), judgeSpendUsd: usd(spend.judges.usd), capUsd: spend.cap, spendIs, reserveUsd: usd(spend.reserve.usd), reserveWhy: spend.reserve.why, spendUncounted: spend.uncounted, bars, alsoReported: also, problems, prompts: rows };
  writeFileSync(join(out, `${reportName}.json`), JSON.stringify(report, null, 2));
  const md = [`# Delight eval: ${total} prompt${total === 1 ? "" : "s"}`, "", `Run ${report.ranAt} against ${BASE}. Spend $${report.spendUsd.toFixed(2)} of the $${spend.cap} cap: $${report.tutorSpendUsd.toFixed(2)} of Tutor turns and $${report.judgeSpendUsd.toFixed(2)} of judges. ${judge ? "Judged by Opus." : "Not judged (no --judge): the judged bars read \"not judged\"."}`, ""];
  if (spend.uncounted) md.push(`**The spend above is a floor, not the total:** ${spend.uncounted}. Nothing more was started after that.`, "");
  else if (spend.reserve.usd > 0) md.push(`**The spend above is a floor-with-reserve:** it includes $${report.reserveUsd.toFixed(2)} reserved for ${spend.reserve.why.length} tr${spend.reserve.why.length === 1 ? "y" : "ies"} whose Tutor turns never settled (${spend.reserve.why.join("; ")}).`, "");
  md.push("## Bars (spec Appendix D.3)", "", "| Bar | Target | Actual | Result |", "|---|---|---|---|");
  for (const b of bars) md.push(`| ${b.name} | ${b.target} | ${b.actual} | ${b.pass == null ? "n/a" : b.pass ? "pass" : "FAIL"} |`);
  md.push("", "## Also reported", "");
  for (const a of also) md.push(`- ${a.name}: ${a.ids.length ? a.ids.join(", ") : "none"} (${a.note})`);
  md.push("", "## Prompts", "", "| Id | Topic / step | Message | Widget source | Choices | Fun | Lingo | Exam | Sums | Fit kind | Screenshot |", "|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const j = r.judgements ?? {};
    md.push(`| ${r.id} | ${r.topic} / ${r.step} | ${r.prompt} | ${r.delight?.widgetSource ?? "-"} | ${r.delight?.choicesCount ?? "-"} | ${j.persona?.fun ?? "-"} | ${j.persona?.lingo.score ?? "-"} | ${j.persona ? (j.persona.exam ? "yes" : "no") : "-"} | ${j.math?.count ?? "-"} | ${j.fit?.kind ?? "-"} | ${r.screenshot ?? "-"} |`);
  }
  const notes = rows.filter((r) => r.error || r.delight?.widgetSourceFrom !== "reply_checks");
  if (notes.length || problems.length) {
    md.push("", "## Notes", "");
    for (const r of notes) md.push(`- **${r.id}**: ${[r.error && `error: ${r.error}`, r.delight && r.delight.widgetSourceFrom !== "reply_checks" && `widget source from ${r.delight.widgetSourceFrom}`].filter(Boolean).join("; ")}`);
    for (const p of problems) md.push(`- ${p}`);
  }
  writeFileSync(join(out, `${reportName}.md`), md.join("\n") + "\n");
  console.log(`Wrote ${join(out, reportName)}.json and .md. Bars passed: ${bars.filter((b) => b.pass === true).length} of ${bars.length}. Spend $${report.spendUsd.toFixed(2)}.`);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const browser = await chromium.launch();
const rows = [];
// The Delight round's one budget (spec D.3): the Tutor's turns are charged here as each prompt runs, the judges after.
const { delightBudget, everyPlanned, runUnderCap, Spend } = await import("../src/behaviour/delight/judges.ts");
const spend = DELIGHT ? new Spend(delightBudget(process.env)) : null;
const problems = [];
const failedRow = (p, error) => ({ n: p.n, slug: p.slug, prompt: p.prompt, expected: p.expected, expectedSet: p.expectedSet, ...(DELIGHT ? { id: p.id, topic: p.topic, step: p.step } : {}), lane: "none", archetype: null, firstPixelMs: null, interactiveMs: null, doneMs: null, stuck: false, stopped: null, error, checks: codeChecks("none", null, null, p.expectedSet).checks, screenshot: null, scores: null, toolsUsed: [] });
const firstLine = (e) => String(e?.message ?? e).split("\n")[0];
const planned = PROMPTS.filter((p) => !only || only.has(p.n));
let stoppedBy = null;
try {
  for (const p of planned) {
    // Only an infrastructure failure (server down, sign-in failed) is retried, once. A slow or poor answer never is.
    const r = await runUnderCap({
      spend,
      attempt: (seen) => evalPrompt(browser, pool, p, seen),
      usageOf: (learnerId) => tutorSteps(pool, learnerId),
      // A try that timed out or threw may leave its turn running: it is charged once its usage settles (E4b-C2).
      finished: (row) => !row.turnUnfinished,
      openTurns: (learnerId) => openTurns(pool, learnerId),
      onRetry: (e) => console.error(`prompt ${p.n}: ${firstLine(e)}; retrying once`),
    });
    let row;
    if ("row" in r) row = r.row;
    else if ("refused" in r) {
      const why = spend.uncounted
        ? `not run: the round's spend is no longer known (${spend.uncounted}), so no more paid turns start`
        : `not run: its Tutor turns (about $${spend.nextPrompt().toFixed(2)}) would pass the $${spend.cap} cap, $${spend.spent.toFixed(2)} spent`;
      row = failedRow(p, r.error ? `run failed: ${firstLine(r.error)}; ${why}` : why);
      problems.push(`${p.id ?? p.n}: ${why}`);
    } else row = failedRow(p, `run failed: ${firstLine(r.error)}`);
    rows.push(row);
    console.log(`${pad(p.n)} ${row.lane.padEnd(8)} ${String(row.recipe ?? "").padEnd(18)} px ${sec(row.firstPixelMs)} int ${sec(row.interactiveMs)} done ${sec(row.doneMs)} ${row.archetype ?? "-"}${row.error ? `  ERROR ${row.error}` : ""}${spend ? `  spent $${spend.spent.toFixed(2)} of $${spend.cap}` : ""}`);
  }
} catch (e) {
  // The Delight round has already paid for the prompts in `rows`: stop here but still write their report (E4b-C1).
  if (!DELIGHT) throw e;
  stoppedBy = firstLine(e);
  problems.push(`round stopped after ${rows.length} prompt${rows.length === 1 ? "" : "s"}: ${stoppedBy}`);
} finally {
  await browser.close();
  await pool.end();
}
if (DELIGHT) {
  // Every planned prompt gets a row (E4b-B1): one the loop never reached is a failed row with its reason.
  const all = everyPlanned(planned, rows, (p) => failedRow(p, `not run: the round stopped after ${rows.length} prompt${rows.length === 1 ? "" : "s"} (${stoppedBy ?? "unknown reason"})`));
  await finishDelight(all, spend, problems);
  process.exit(0);
}
if (scoresFile) mergeScores(rows, readJson(scoresFile));
const report = writeReport(rows, { ranAt: new Date().toISOString(), base: BASE, viewport: VIEWPORT, only: only ? [...only] : null });
console.log(`Wrote ${join(out, reportName)}.json and .md. Recipe served: ${report.summary.recipeServed} of ${rows.length}. Archetypes: ${report.summary.archetypes.join(", ") || "none"}.`);
