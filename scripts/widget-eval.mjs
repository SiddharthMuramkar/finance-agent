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
import { join, resolve } from "node:path";
import { assertLocalBase, assertTestDatabase, assertToolsLearner, textOf } from "./script-guards.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = args[0];
if (!out || out.startsWith("--")) {
  console.error("Usage: node --env-file=.env scripts/widget-eval.mjs <output-folder> [--only 3,11,19] [--scores scores.json] [--name eval-report] [--rescore]");
  process.exit(2);
}
const only = flag("--only") ? new Set(flag("--only").split(",").map((n) => Number(n.trim()))) : null;
const scoresFile = flag("--scores");
const reportName = flag("--name") ?? "eval-report";
const rescore = args.includes("--rescore");
mkdirSync(out, { recursive: true });

// ---------- the eval set (REPORT.md §13.3) ----------

/** @type {{ n: number, slug: string, prompt: string, expected: string, expectedSet: string[] }[]} */
const PROMPTS = [
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
      `| ${r.n} | ${r.prompt} | ${r.lane}${r.recipe ? ` (${r.recipe})` : ""} | ${r.archetype ?? "-"} (${r.expectedSet.join("/")}) ${mark(r.checks.archetypeExpected)} | ${sec(r.firstPixelMs)} | ${sec(r.interactiveMs)} | ${sec(r.doneMs)} | ${r.stuck ? "YES" : "no"} | ${r.checks.validatorProblems.length + r.checks.validatorWarnings.length ? "FAIL" : mark(r.lane === "none" ? null : true)} | ${mark(r.checks.withinBudget)} | ${r.checks.overflowAt480 == null ? "n/a" : r.checks.overflowAt480 ? "FAIL" : "pass"} | ${pcd} | ${r.screenshot ?? "-"} |`,
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

/** Which lane served the Widget, and its code, from the Session's rows after the prompt. */
async function readLane(pool, learnerId, promptSeq) {
  const sessions = (await pool.query(`select id from sessions where learner_id = $1 order by id desc limit 1`, [learnerId])).rows;
  if (!sessions.length) return { lane: "none", note: "no Session" };
  const sessionId = sessions[0].id;
  const messages = (await pool.query(`select seq, role, content from messages where session_id = $1 order by seq`, [sessionId])).rows;
  const after = messages.filter((m) => m.seq > promptSeq);
  const toolsUsed = after.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_use").map((b) => b.name) : []));
  const items = (await pool.query(`select kind, data, after_seq from session_items where session_id = $1 and kind = 'widget_shown' and after_seq >= $2 order by id`, [sessionId, promptSeq])).rows;
  const turn = (await pool.query(`select status, stop_reason, error from turns where session_id = $1 order by id desc limit 1`, [sessionId])).rows[0] ?? null;
  const base = { sessionId, toolsUsed, turn };
  if (items.length) {
    const d = items[items.length - 1].data;
    const source = typeof d.source === "string" ? d.source : "recipe";
    return { ...base, lane: source === "compose" || source === "fallback" ? source : "recipe", code: d.code, title: d.title, recipe: d.recipe || null, params: d.params ?? null, widgetsShown: items.length };
  }
  const fences = after.filter((m) => m.role === "assistant").flatMap((m) => [...textOf(m).matchAll(/```openui-lang\n([\s\S]*?)\n```/g)].map((x) => x[1]));
  if (fences.length) return { ...base, lane: "fence", code: fences[fences.length - 1], widgetsShown: fences.length };
  return { ...base, lane: "none" };
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

/** Starts the tools Learner over, signs in by the page and starts the first Topic; resolves when the opening turn is done. */
async function reachStudy(browser) {
  const { learnerId } = await signInAsToolsLearner(BASE);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Passcode", { exact: true }).fill(PASSCODE);
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await page.waitForURL(/\/welcome/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Skip", exact: true }).click();
  const start = page.getByRole("button", { name: "Start this Topic", exact: true });
  await start.waitFor({ timeout: 15_000 });
  await start.click();
  await page.waitForURL(/\/study/, { timeout: 30_000 });
  // The opening turn: a Tutor message appears, then the Stop button goes away and Send comes back.
  await page.locator('[data-testid="assistant-message"]').first().waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "Send", exact: true }).waitFor({ timeout: TURN_TIMEOUT_MS });
  await page.waitForTimeout(1_500);
  return { context, page, learnerId };
}

async function evalPrompt(browser, pool, p) {
  const row = {
    n: p.n, slug: p.slug, prompt: p.prompt, expected: p.expected, expectedSet: p.expectedSet,
    lane: "none", recipe: null, params: null, title: null, archetype: null, code: null,
    firstPixelMs: null, interactiveMs: null, doneMs: null, stuck: false, stuckMs: 0, stopped: null, error: null,
    toolsUsed: [], checks: codeChecks("none", null, null, p.expectedSet).checks, screenshot: null, scores: null,
  };
  const { context, page, learnerId } = await reachStudy(browser);
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
    if (state.doneMs == null) row.error = `the turn did not finish in ${TURN_TIMEOUT_MS / 1000}s`;
    // A last moment for the Widget to settle before it is measured and photographed.
    await page.waitForTimeout(800);
    state = await page.evaluate(() => window.__eval);
    const approx = state.firstPixelMs == null && state.approxFirstPixelMs != null;
    Object.assign(row, { firstPixelApprox: approx || undefined, firstPixelMs: round(state.firstPixelMs ?? state.approxFirstPixelMs), interactiveMs: round(state.interactiveMs ?? state.approxInteractiveMs), doneMs: round(state.doneMs), stuckMs: round(state.stuckMs), stuck: state.stuckMs > 12_000, stopped: state.stopped });

    const lane = await readLane(pool, learnerId, promptSeq);
    Object.assign(row, { lane: lane.lane, recipe: lane.recipe ?? null, params: lane.params ?? null, title: lane.title ?? null, code: lane.code ?? null, toolsUsed: lane.toolsUsed ?? [], widgetsShown: lane.widgetsShown ?? 0, sessionId: lane.sessionId ?? null });
    if (lane.turn?.error && !row.error) row.error = lane.turn.error;
    if (lane.turn?.status && lane.turn.status !== "done" && lane.turn.status !== "finished") row.turnStatus = lane.turn.status;
    if (lane.lane !== "none" && row.firstPixelMs == null) row.firstPixelNote = "the Widget on screen did not change, so no arrival was seen (the Tutor showed the one already open again)";
    const { archetype, checks } = codeChecks(lane.lane, lane.code, lane.title, p.expectedSet);
    row.archetype = archetype;
    row.checks = checks;

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

const pool = new Pool({ connectionString: DATABASE_URL });
const browser = await chromium.launch();
const rows = [];
try {
  for (const p of PROMPTS) {
    if (only && !only.has(p.n)) continue;
    let row;
    try {
      row = await evalPrompt(browser, pool, p);
    } catch (e) {
      // Only an infrastructure failure (server down, sign-in failed) is retried, once. A slow or poor answer never is.
      console.error(`prompt ${p.n}: ${String(e?.message ?? e).split("\n")[0]}; retrying once`);
      try {
        row = await evalPrompt(browser, pool, p);
      } catch (e2) {
        row = { n: p.n, slug: p.slug, prompt: p.prompt, expected: p.expected, expectedSet: p.expectedSet, lane: "none", archetype: null, firstPixelMs: null, interactiveMs: null, doneMs: null, stuck: false, stopped: null, error: `run failed: ${String(e2?.message ?? e2).split("\n")[0]}`, checks: codeChecks("none", null, null, p.expectedSet).checks, screenshot: null, scores: null, toolsUsed: [] };
      }
    }
    rows.push(row);
    console.log(`${pad(p.n)} ${row.lane.padEnd(8)} ${String(row.recipe ?? "").padEnd(18)} px ${sec(row.firstPixelMs)} int ${sec(row.interactiveMs)} done ${sec(row.doneMs)} ${row.archetype ?? "-"}${row.error ? `  ERROR ${row.error}` : ""}`);
  }
} finally {
  await browser.close();
  await pool.end();
}
if (scoresFile) mergeScores(rows, readJson(scoresFile));
const report = writeReport(rows, { ranAt: new Date().toISOString(), base: BASE, viewport: VIEWPORT, only: only ? [...only] : null });
console.log(`Wrote ${join(out, reportName)}.json and .md. Recipe served: ${report.summary.recipeServed} of ${rows.length}. Archetypes: ${report.summary.archetypes.join(", ") || "none"}.`);
