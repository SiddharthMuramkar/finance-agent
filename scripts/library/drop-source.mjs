// Removes one Library source from the database in .env, from the laptop (#38: OpenStax 2e, once the CC BY
// 1e is loaded and embedded): its passages, then its library_documents rows, then its library_sources row,
// in one transaction (src/library/drop-source.ts). Dry run by default: prints counts only. Take a Neon
// snapshot first; then rebuilds the BM25 statistics, as library:load does.
//   node --env-file=.env scripts/library/drop-source.mjs --source <id>           dry run: counts only
//   node --env-file=.env scripts/library/drop-source.mjs --source <id> --apply   deletes
// Refuses unless DATABASE_URL_UNPOOLED or DATABASE_URL is set and the database holds the source.
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { dropSource } from "../../src/library/drop-source.ts";
import { keywordRanking } from "../../src/library/search.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const sourceId = args.includes("--source") ? args[args.indexOf("--source") + 1] : undefined;
if (!sourceId || sourceId.startsWith("--")) {
  console.error("Usage: node --env-file=.env scripts/library/drop-source.mjs --source <id> [--apply]");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Refusing: DATABASE_URL_UNPOOLED or DATABASE_URL must be set (run with --env-file=.env).");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const db = drizzle({ client: pool });
try {
  let counts;
  try {
    counts = await dropSource(db, sourceId, { apply });
  } catch (error) {
    console.error(`Refusing: ${error instanceof Error ? error.message : error}. Nothing was deleted.`);
    process.exitCode = 1;
  }
  if (counts) {
    const what = `${counts.passages} passages, ${counts.documents} library_documents rows and the library_sources row of ${sourceId}`;
    console.log(apply ? `Deleted ${what}.` : `Dry run (add --apply to delete): would delete ${what}.`);
    if (apply && (await keywordRanking(db)) === "bm25") {
      // BM25 statistics are built with the index and refreshed by VACUUM (Neon lakebase_text docs).
      await db.execute(sql`reindex index library_passages_bm25`);
      await db.execute(sql`vacuum (analyze) library_passages`);
      console.log("BM25 index rebuilt and statistics refreshed.");
    }
    const listed = JSON.parse(readFileSync(new URL("./sources.json", import.meta.url), "utf8")).some((s) => s.id === sourceId);
    if (apply && listed) console.log(`${sourceId} is still listed in scripts/library/sources.json: remove its entry so no later load brings it back.`);
  }
} finally {
  await pool.end();
}
