// Imports Question Bank questions into the database, from the laptop. Run:
//   npm run bank:import -- eab-jsonl <dist/questions.jsonl>   (Executive Assessment Bank mba-core + the Padova import)
//   npm run bank:import -- finqa-json <dev.json>              (FinQA)
// The files stay OUTSIDE the repo, because question text lives only in the private database. Every
// question arrives unverified. Re-running an import corrects text and keeps checked keys checked.
// Node strips the TypeScript types from the imported modules directly; no build step needed.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { importBank } from "../src/bank/ingest.ts";
import { fromBankRow, fromFinqaRow } from "../src/bank/normalise.ts";

const [format, file] = process.argv.slice(2);
const readers = {
  "eab-jsonl": [(text) => text.split("\n").filter(Boolean).map((l) => JSON.parse(l)), fromBankRow],
  "finqa-json": [(text) => JSON.parse(text), fromFinqaRow],
};
if (!readers[format] || !file) {
  console.error("Usage: npm run bank:import -- <eab-jsonl|finqa-json> <file>");
  process.exit(1);
}
const [parse, normalise] = readers[format];
const kept = [];
const skipped = new Map();
for (const row of parse(readFileSync(file, "utf8"))) {
  const q = normalise(row);
  if ("skipped" in q) skipped.set(q.skipped, (skipped.get(q.skipped) ?? 0) + 1);
  else kept.push(q);
}
const ids = new Set(kept.map((q) => q.id));
if (ids.size !== kept.length) throw new Error("The file repeats a question ID.");

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
const result = await importBank(drizzle({ client: neon(url) }), kept);
const bySource = {};
for (const q of kept) bySource[q.source] = (bySource[q.source] ?? 0) + 1;
console.log(`Imported ${result.imported} question(s) ${JSON.stringify(bySource)}, all unverified.`);
for (const [why, n] of skipped) console.log(`  left out ${n}: ${why}`);
