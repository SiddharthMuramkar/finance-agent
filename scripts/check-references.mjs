// The laptop check: confirms that every Question Bank question and every Case Data dataset the
// Course Map names exists in the database. Run: npm run course:refs
// It reads the database named in .env, so it runs on the laptop, not in `npm run check`.
// Node strips the TypeScript types from the imported modules directly; no build step needed.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { checkReferences } from "../src/bank/references.ts";
import { parseCourseMap, readOutlineText, readTopicFiles } from "../src/course/map.ts";
import { parseOutline } from "../src/course/outline.ts";

const planned = parseOutline(readOutlineText());
if (!planned.outline) throw new Error(`Course Map outline is invalid:\n${planned.errors.join("\n")}`);
const { map, errors } = parseCourseMap(readTopicFiles(), planned.outline);
if (!map) throw new Error(`Course Map is invalid:\n${errors.join("\n")}`);

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
const report = await checkReferences(drizzle({ client: neon(url) }), map);
if (report.problems.length) {
  console.error(`Course Map references are broken (${report.problems.length} problem${report.problems.length === 1 ? "" : "s"}):`);
  for (const p of report.problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Course Map references OK: ${report.bankQuestions} bank question(s) (${report.unverified} with an unchecked key), ${report.caseData} Case Data dataset(s).`);
