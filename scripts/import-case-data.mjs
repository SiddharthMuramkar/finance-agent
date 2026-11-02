// Imports checked Case Data into the database, from the laptop. Run:
//   npm run case-data:import -- <file.json> [more.json ...]
// Each file is a list of datasets (see src/case-data/import.ts). The files stay outside the repo,
// because Case Data lives only in the private database. Every dataset's Case must be on the
// Course Map, and re-running an import replaces those datasets' points.
// Node strips the TypeScript types from the imported modules directly; no build step needed.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { importCaseData } from "../src/case-data/import.ts";
import { parseCourseMap, readOutlineText, readTopicFiles } from "../src/course/map.ts";
import { parseOutline } from "../src/course/outline.ts";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Give one or more Case Data JSON files.");
  process.exit(1);
}
const planned = parseOutline(readOutlineText());
if (!planned.outline) throw new Error(`Course Map outline is invalid:\n${planned.errors.join("\n")}`);
const { map, errors } = parseCourseMap(readTopicFiles(), planned.outline);
if (!map) throw new Error(`Course Map is invalid:\n${errors.join("\n")}`);
const caseIds = new Set(map.topics.flatMap((t) => t.cases.map((c) => c.id)));

const datasets = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")));
const unknown = datasets.filter((d) => !caseIds.has(d.caseId)).map((d) => `${d.caseId}/${d.id}`);
if (unknown.length) {
  console.error(`These datasets belong to Cases that are not on the Course Map: ${unknown.join(", ")}`);
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
const result = await importCaseData(drizzle({ client: neon(url) }), datasets);
console.log(`Imported ${result.datasets} dataset(s), ${result.points} point(s).`);
