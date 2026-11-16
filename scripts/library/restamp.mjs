// Re-stamps the stored Library without a reload (#25, #26), from the laptop, against the database in
// .env: each source's licence, licence link and credit from scripts/library/sources.json, the passages
// that carried the old ones, and every passage's latest_year read again from its text only
// (src/library/restamp.ts). Passage text and embeddings are not touched. Take a Neon snapshot first.
//   node --env-file=.env scripts/library/restamp.mjs           dry run: counts what would change
//   node --env-file=.env scripts/library/restamp.mjs --write   applies it
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { restampLibrary } from "../../src/library/restamp.ts";

const write = process.argv.includes("--write");
const sources = JSON.parse(readFileSync(new URL("./sources.json", import.meta.url), "utf8")).map((entry) => {
  const source = { ...entry };
  delete source.fetch;
  delete source.publishedOn;
  return source;
});
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (run with --env-file=.env).");
const result = await restampLibrary(drizzle({ client: neon(url) }), sources, { write });
const counts = (o) => Object.entries(o).map(([id, n]) => `${id} ${n}`).join(", ") || "none";
console.log(write ? "Re-stamped:" : "Dry run (add --write to apply):");
console.log(`  sources with a new licence, licence link or credit: ${result.sources.join(", ") || "none"}`);
console.log(`  passages taking the new licence or credit: ${counts(result.credits)}`);
console.log(`  passages re-dated from their text: ${counts(result.years)}`);
