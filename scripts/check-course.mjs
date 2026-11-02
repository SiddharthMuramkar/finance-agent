// Validates the Course Map in course/topics. Part of `npm run check`, so CI fails on a bad edit.
// Node strips the TypeScript types from map.ts directly; no build step needed.
import { parseCourseMap, readTopicFiles } from "../src/course/map.ts";

const files = readTopicFiles();
const { map, errors } = parseCourseMap(files);
if (!map) {
  console.error(`Course Map is invalid (${errors.length} problem${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Course Map OK: ${map.topics.length} Topic(s), ${map.topics.reduce((n, t) => n + t.checks.length, 0)} Check(s).`);
