// Loads one Library source into the database, from the laptop. Run:
//   npm run library:load -- <source id> <documents.json>
// The source's licence and credit come from scripts/library/sources.json; the documents file comes
// from that source's extractor (see its "fetch" line) and stays OUTSIDE the repo, because Library
// text lives only in the private database. The script cleans and cuts the text into passages, keeps
// corrupted passages out (and lists them, after repairing the broken ligatures it can), and replaces the source's passages in the database;
// unchanged passages keep their embeddings. Then it refreshes the BM25 statistics.
// Node strips the TypeScript types from the imported modules directly; no build step needed.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { importLibrary } from "../src/library/ingest.ts";
import { prepareDocuments } from "../src/library/prepare.ts";
import { keywordRanking } from "../src/library/search.ts";

const [sourceId, file] = process.argv.slice(2);
if (!sourceId || !file) {
  console.error("Usage: npm run library:load -- <source id> <documents.json>");
  process.exit(1);
}
const sources = JSON.parse(readFileSync(new URL("./library/sources.json", import.meta.url), "utf8"));
const entry = sources.find((s) => s.id === sourceId);
if (!entry) {
  console.error(`No source "${sourceId}" in scripts/library/sources.json`);
  process.exit(1);
}
const { publishedOn, ...source } = entry;
delete source.fetch;
const documents = JSON.parse(readFileSync(file, "utf8")).map((d) => ({ ...d, publishedOn: d.publishedOn ?? publishedOn ?? null }));
const { passages, rejected, repaired } = prepareDocuments(documents);
if (repaired) console.log(`Repaired ${repaired} broken words (lost ligatures such as CreaAon, or words glued by a table) from the source's own clean spellings.`);
for (const r of rejected) console.log(`Left out (corrupted: ${r.reasons.join(", ")}): ${r.ref} ${r.heading}`);

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
const db = drizzle({ client: neon(url) });
const result = await importLibrary(db, { source, passages });
const words = passages.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
console.log(`${sourceId}: loaded ${result.passages} passages (${words} words) from ${documents.length} documents; ${rejected.length} corrupted left out; ${result.removed} old passages removed.`);
if ((await keywordRanking(db)) === "bm25") {
  // BM25 statistics are built with the index and refreshed by VACUUM (Neon lakebase_text docs).
  await db.execute(sql`reindex index library_passages_bm25`);
  await db.execute(sql`vacuum (analyze) library_passages`);
  console.log("BM25 index rebuilt and statistics refreshed.");
}
