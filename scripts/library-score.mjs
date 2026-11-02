// Judges Library search with the test questions, from the laptop, against the database in .env. Run:
//   npm run library:score -- [questions.json] [--ranking bm25|full-text] [--voyage]
// For each question it runs the app's own search (src/library/search.ts) and scores a hit when a
// passage from an expected document is in the top 5; it reports hits@5, hits@1 and mean reciprocal
// rank. --voyage adds the query embedding (needs VOYAGE_API_KEY). The hindsight probes run with a
// Case's as-of date and list any passage that mentions a later year or the Case's outcome, because
// timeless reference text can still give an ending away.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { keywordRanking, searchPassages } from "../src/library/search.ts";
import { voyageQueryEmbedder } from "../src/library/voyage.ts";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = args.find((a) => a.endsWith(".json")) ?? new URL("./library/eval/questions.json", import.meta.url);
const set = JSON.parse(readFileSync(file, "utf8"));
const db = drizzle({ client: neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL) });
const ranking = flag("--ranking") ?? (await keywordRanking(db));
let embed;
if (args.includes("--voyage")) {
  if (!process.env.VOYAGE_API_KEY) throw new Error("--voyage needs VOYAGE_API_KEY in .env");
  embed = voyageQueryEmbedder({ apiKey: process.env.VOYAGE_API_KEY });
}
const mode = `${ranking}${embed ? " + Voyage vectors (combined)" : " keyword only"}`;
const doc = (ref) => ref.split("#")[0];
// A passage answers a question when it is one of the `expect`ed documents (bare IDs belong to the set's own source),
// or comes from one of the question's `sources` and, if `expectText` is given, contains one of those phrases.
const judged = (question, r) => (question.alsoExpect ?? []).includes(`${r.sourceId}/${doc(r.ref)}`);
const answers = (question, r) =>
  (question.expect ?? []).some((e) => e === `${r.sourceId}/${doc(r.ref)}` || (e === doc(r.ref) && r.sourceId === set.source)) ||
  ((question.sources ?? []).includes(r.sourceId) && (question.expectText ?? [""]).some((t) => r.text.toLowerCase().includes(t.toLowerCase())));

let hits5 = 0;
let judgedHits5 = 0;
let hits1 = 0;
let rr = 0;
const misses = [];
const groupOf = (qu) => qu.sources?.[0] ?? (qu.expect?.[0]?.includes("/") ? qu.expect[0].split("/")[0] : "openstax-principles-finance-2e");
const byGroup = {};
for (const question of set.questions) {
  const { q } = question;
  const results = await searchPassages(db, { query: q, asOf: null, ranking, embedding: embed ? await embed(q) : undefined, limit: 5 });
  const rank = results.findIndex((r) => answers(question, r)) + 1;
  const g = (byGroup[groupOf(question)] ??= { hit: 0, n: 0 });
  g.n++;
  if (rank) g.hit++;
  if (rank || results.some((r) => judged(question, r))) judgedHits5++;
  if (rank) {
    hits5++;
    rr += 1 / rank;
    if (rank === 1) hits1++;
  } else misses.push(`  MISS ${q}\n       expected ${[...(question.expect ?? []), ...(question.sources ?? [])].join(", ")}; got ${results.map((r) => `${r.sourceId}/${doc(r.ref)} (${r.heading.slice(0, 50)})`).join(" | ") || "nothing"}`);
}
const n = set.questions.length;
console.log(`Library search score (${mode}), ${n} questions`);
console.log(`  hits@5 ${hits5}/${n} (${Math.round((100 * hits5) / n)}%), hits@1 ${hits1}/${n}, mean reciprocal rank ${(rr / n).toFixed(2)}`);
console.log(`  judged hits@5 (also counting other-source passages read and judged to answer, see alsoExpect) ${judgedHits5}/${n} (${Math.round((100 * judgedHits5) / n)}%)`);
console.log(`  by source: ${Object.entries(byGroup).map(([k, v]) => `${k} ${v.hit}/${v.n}`).join(", ")}`);
if (misses.length) console.log(misses.join("\n"));

console.log("\nHindsight probes (as-of rule on):");
for (const { q, asOf, outcome } of set.hindsight ?? []) {
  const results = await searchPassages(db, { query: q, asOf, ranking, embedding: embed ? await embed(q) : undefined, limit: 5 });
  const year = Number(asOf.slice(0, 4));
  const flagged = results.flatMap((r) => {
    const later = [...new Set(r.text.match(/\b20\d\d\b/g) ?? [])].filter((y) => Number(y) > year);
    const told = outcome.filter((o) => r.text.toLowerCase().includes(o.toLowerCase()));
    const dated = r.kind === "dated" && r.publishedOn > asOf;
    return later.length || told.length || dated ? [`${doc(r.ref)} ${r.kind}${dated ? " DATED AFTER AS-OF" : ""}: later years ${later.join(",") || "none"}; outcome words ${told.join(",") || "none"}`] : [];
  });
  console.log(`  "${q}" (as of ${asOf}): ${results.length} results; ${flagged.length ? `${flagged.length} mention later events:\n    ${flagged.join("\n    ")}` : "none mention later events"}`);
}
