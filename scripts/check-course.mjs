// Validates the Course Map outline and the Topic files in course/topics, and checks that the readable
// docs/course-map.md matches the outline. Part of `npm run check`, so CI fails on a bad or stale edit.
// `--write` regenerates docs/course-map.md instead of checking it (npm run course:doc).
// Node strips the TypeScript types from the modules directly; no build step needed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseCourseMap, readOutlineText, readTopicFiles } from "../src/course/map.ts";
import { formulaCheckErrors } from "../src/course/formula-check.ts";
import { connectionsCheckErrors } from "../src/course/connections-check.ts";
import { youllLearnCheckErrors } from "../src/course/youll-learn-check.ts";
import { onlyTaskCheckErrors, writtenAheadCheckErrors } from "../src/course/written-ahead-check.ts";
import { HOME_WIDGET } from "../src/app/_landing/home-widget-spec.ts";
import { parseOutline, renderCourseMapDoc } from "../src/course/outline.ts";

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
const typed = formulaCheckErrors(map.topics);
if (typed.length) fail("Typed formulas in the Course Map (ADR 0002)", typed);

const writtenAhead = writtenAheadCheckErrors(map.topics);
if (writtenAhead.length) fail("Written-ahead Widgets that cannot be drawn or worked", writtenAhead);

const home = onlyTaskCheckErrors(map.topics, HOME_WIDGET);
if (home.length) fail("Home's Widget cannot be drawn or worked", home);

const noConnections = connectionsCheckErrors(map.topics);
if (noConnections.length) fail("Topics with an Insight need Connections", noConnections);

const youllLearn = youllLearnCheckErrors(map.topics);
if (youllLearn.length) fail("You'll learn bullets that are missing or break the rules", youllLearn);

const doc = renderCourseMapDoc(planned.outline, new Set(map.topics.map((t) => t.id)));
if (process.argv.includes("--write")) {
  writeFileSync(DOC, doc);
  console.log(`Wrote ${DOC}.`);
} else if (!existsSync(DOC) || readFileSync(DOC, "utf8") !== doc) {
  fail("docs/course-map.md is stale", ["run `npm run course:doc` and commit the result"]);
}
console.log(
  `Course Map OK: ${planned.outline.topics.length} planned Topic(s), ${map.topics.length} written, ${map.topics.reduce((n, t) => n + t.checks.length, 0)} Check(s).`,
);
