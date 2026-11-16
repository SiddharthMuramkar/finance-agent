// Validates the Course Map outline and the Topic files in course/topics, and checks that the readable
// docs/course-map.md matches the outline and that src/finance/valuation-cases.generated.ts holds every Case's
// valuation block. Part of `npm run check`, so CI fails on a bad or stale edit.
// `--write` regenerates both files instead of checking them (npm run course:doc).
// Node strips the TypeScript types from the modules directly; no build step needed.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseCourseMap, readOutlineText, readTopicFiles } from "../src/course/map.ts";
import { formulaCheckErrors } from "../src/course/formula-check.ts";
import { lessonLintErrors } from "../src/course/lesson-lint.ts";
import { spineCheckErrors } from "../src/course/spine-check.ts";
import { CRITICS_LOG_PATH, criticsLogErrors } from "../src/course/critics-log.ts";
import { connectionsCheckErrors } from "../src/course/connections-check.ts";
import { youllLearnCheckErrors } from "../src/course/youll-learn-check.ts";
import { homeAnnuityCheckErrors, writtenAheadCheckErrors, writtenAheadCheckWarnings } from "../src/course/written-ahead-check.ts";
import { goalCheckErrors } from "../src/course/goal-check.ts";
import { HOME_WIDGET } from "../src/site/home-widget-spec.ts";
import { MARKET_READING_INPUTS, marketReadingErrors } from "../src/markets/readings.ts";
import { parseOutline, renderCourseMapDoc } from "../src/course/outline.ts";
import { renderValuationCases, VALUATION_REGISTRY_PATH } from "../src/course/valuation-registry.ts";

const DOC = "docs/course-map.md";
const fail = (title, errors) => {
  console.error(`${title} (${errors.length} problem${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
};

const planned = parseOutline(readOutlineText());
if (!planned.outline) fail("Course Map outline is invalid", planned.errors);
const { map, errors } = parseCourseMap(readTopicFiles(), planned.outline);
if (!map) fail("Course Map is invalid", errors);
// The lesson lint (L1 to L14, including L10 with its allowlist src/course/l10-allowlist.ts, L13's judgement Checks on Spine
// Topics and L14's computed questions valued through the engine), with written-ahead presets only: recipe presets need the recipes, which plain Node cannot load, so
// src/course/lesson-presets.test.ts checks those under vitest (part of npm run check).
const lesson = lessonLintErrors(map.topics);
if (lesson.length) fail("Lesson lint for converted Topics (spec #229, ADR 0001)", lesson);

// The shape of every Spine Topic: its Case, Workbench, Insight, card, terms, Quick tries, Check, why line and length.
const spine = spineCheckErrors(map.topics);
if (spine.length) fail("Spine Topics that break the Spine shape (spec 2026-11-12 C2)", spine);

// The critics gate (C8): every written Spine Topic has a record of the four critics' rounds with nothing confirmed left open.
const critics = criticsLogErrors(map.topics, existsSync(CRITICS_LOG_PATH) ? readFileSync(CRITICS_LOG_PATH, "utf8") : null);
if (critics.length) fail("Spine Topics without a passing critics' record (spec 2026-11-12 C8)", critics);

const typed = formulaCheckErrors(map.topics);
if (typed.length) fail("Typed formulas in the Course Map (ADR 0003)", typed);

const writtenAhead = writtenAheadCheckErrors(map.topics);
if (writtenAhead.length) fail("Written-ahead Widgets that cannot be drawn or worked", writtenAhead);

// Warnings are printed beside the errors and never fail the check.
for (const warning of writtenAheadCheckWarnings(map.topics)) console.warn(`  warning: ${warning}`);

const home = homeAnnuityCheckErrors(map.topics, HOME_WIDGET);
if (home.length) fail("Home's Explorable cannot read its annuity", home);

const noConnections = connectionsCheckErrors(map.topics);
if (noConnections.length) fail("Topics with an Insight need Connections", noConnections);

const youllLearn = youllLearnCheckErrors(map.topics);
if (youllLearn.length) fail("You'll learn bullets that are missing or break the rules", youllLearn);

const goals = goalCheckErrors(map.topics);
if (goals.length) fail("Topic goals, why lines and found lines that break the rules", goals);

// Every Market reading (ticket #105) has its measured date, source, credit and working link, never calls itself today's
// or current, and a premium reading's inputs give the premium it states.
const readings = marketReadingErrors(MARKET_READING_INPUTS);
if (readings.length) fail("Market readings that are not dated and sourced (spec #68)", readings);

const doc = renderCourseMapDoc(planned.outline, new Set(map.topics.map((t) => t.id)));
// The valuation Case registry (spec 2026-11-12 B1): what client and server code value a Case from, by its id.
const registry = renderValuationCases(map.topics);
const generated = [
  [DOC, doc],
  [VALUATION_REGISTRY_PATH, registry],
];
if (process.argv.includes("--write")) {
  for (const [path, text] of generated) {
    writeFileSync(path, text);
    console.log(`Wrote ${path}.`);
  }
} else {
  const stale = generated.filter(([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text).map(([path]) => path);
  if (stale.length) fail(`${stale.join(" and ")} ${stale.length === 1 ? "is" : "are"} stale`, ["run `npm run course:doc` and commit the result"]);
}
// Every explore Workbench builds and passes the Widget checks (spec C2, B2-B4). The recipes are TypeScript with path
// aliases and JSX, which plain Node cannot load, so this one small vitest file does it; a failure names the Topic and why.
if (!process.argv.includes("--write")) {
  const bench = spawnSync("npx", ["vitest", "run", "--maxWorkers=1", "src/course/explore-workbench.test.ts"], { encoding: "utf8", shell: process.platform === "win32" });
  if (bench.status !== 0) {
    const reasons = `${bench.stdout ?? ""}${bench.stderr ?? ""}`.split("\n").filter((l) => /does not build|AssertionError|Error:|FAIL/.test(l)).slice(0, 20);
    fail("Explore Workbenches that do not build (src/course/explore-workbench.test.ts)", reasons.length ? reasons : [bench.error?.message ?? "the test run failed"]);
  }
}
console.log(
  `Course Map OK: ${planned.outline.topics.length} planned Topic(s), ${map.topics.length} written, ${map.topics.reduce((n, t) => n + t.checks.length, 0)} Check(s).`,
);
