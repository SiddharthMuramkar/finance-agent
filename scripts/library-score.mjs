// Judges Library search with the test questions, from the laptop, against the database in .env. Run:
//   npm run library:score -- [questions.json] [--ranking bm25|full-text] [--voyage]
// For each question it runs the app's own search (src/library/search.ts) and scores a hit when a
// passage from an expected document is in the top 5; it reports hits@5, hits@1 and mean reciprocal
// rank. --voyage adds the query embedding (needs VOYAGE_API_KEY). The hindsight probes run with a
// Case's as-of date and list any passage that mentions a later year or the Case's outcome, because
// timeless reference text can still give an ending away. Signal Case questions (those with `signal`) are
// scored apart: once with no as-of limit, once with their Case's as-of date.
// PROTOTYPE (#28): --rerank=<model> (rerank-3-lite or rerank-3) takes the merged top 30 instead of 5, has the
// Voyage reranker reorder them and keeps the top 5. It also prints the time per search and the rerank tokens.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { keywordRanking, searchPassages } from "../src/library/search.ts";
import { voyageEmbed } from "../src/library/voyage.ts";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = args.find((a) => a.endsWith(".json")) ?? new URL("./library/eval/questions.json", import.meta.url);
const set = JSON.parse(readFileSync(file, "utf8"));
const db = drizzle({ client: neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL) });
const ranking = flag("--ranking") ?? (await keywordRanking(db));
let embed;
let voyageCalls = 0;
if (args.includes("--voyage")) {
  if (!process.env.VOYAGE_API_KEY) throw new Error("--voyage needs VOYAGE_API_KEY in .env");
  // Every distinct query is embedded up front, 128 to a call, so a run makes a few Voyage calls, not one per search.
  const queries = [...new Set([...set.questions.flatMap((qu) => [qu.q, qu.scoped?.q]), ...(set.hindsight ?? []).map((h) => h.q)].filter(Boolean))];
  const vectors = new Map();
  for (let i = 0; i < queries.length; i += 128) {
    const batch = queries.slice(i, i + 128);
    const { embeddings } = await voyageEmbed({ apiKey: process.env.VOYAGE_API_KEY }, batch, "query");
    voyageCalls++;
    batch.forEach((query, j) => vectors.set(query, embeddings[j]));
  }
  embed = async (query) => vectors.get(query);
}
// PROTOTYPE (#28): the reranker. Every search below goes through search(), so the scoped, as-of and hindsight runs are reranked too.
const rerankModel = args.find((a) => a.startsWith("--rerank="))?.slice("--rerank=".length);
if (rerankModel && !process.env.VOYAGE_API_KEY) throw new Error("--rerank needs VOYAGE_API_KEY in .env");
const KEEP = 5;
// --pool=<n> sets how many merged candidates the reranker sees (default 30). search.ts takes 30 per ranking, so the
// merged list holds at most 60 (fewer when keyword and vector agree), and a pool of 50 can come back smaller.
const RERANK_POOL = Number(args.find((a) => a.startsWith("--pool="))?.slice("--pool=".length) ?? 30);
const timings = { searchMs: [], rerankMs: [], totalMs: [], tokens: [], pool: [], retries: 0 };
async function voyageRerank(query, documents) {
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    const response = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ query, documents, model: rerankModel, top_k: KEEP, truncation: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429 && attempt < 6) {
      timings.retries++;
      await new Promise((done) => setTimeout(done, 2 ** attempt * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Voyage rerank ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const body = await response.json();
    timings.rerankMs.push(performance.now() - started);
    timings.tokens.push(body.usage?.total_tokens ?? 0);
    return body.data.map((d) => d.index);
  }
}
/** The app's search; with --rerank, the merged top 30 reordered by Voyage, top 5 kept. The reranker sees heading + text. */
async function search(query) {
  const started = performance.now();
  const hits = await searchPassages(db, { ...query, ranking, limit: rerankModel ? RERANK_POOL : KEEP });
  timings.searchMs.push(performance.now() - started);
  timings.pool.push(hits.length);
  const kept = rerankModel && hits.length > 1 ? (await voyageRerank(query.query, hits.map((h) => `${h.heading}\n\n${h.text}`))).map((i) => hits[i]) : hits.slice(0, KEEP);
  timings.totalMs.push(performance.now() - started);
  return kept;
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] : 0;
};
const mode = `${ranking}${embed ? ` + Voyage vectors (combined; ${voyageCalls} Voyage call${voyageCalls === 1 ? "" : "s"})` : " keyword only"}${rerankModel ? ` + rerank ${rerankModel} (top ${RERANK_POOL} -> ${KEEP})` : ""}`;
/** hits@5, hits@1 and mean reciprocal rank of a list of ranks (0 is a miss). */
const tally = (ranks) =>
  `hits@5 ${ranks.filter(Boolean).length}/${ranks.length}, hits@1 ${ranks.filter((r) => r === 1).length}/${ranks.length}, MRR ${(ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / (ranks.length || 1)).toFixed(2)}`;
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
const baseRanks = [];
const openRanks = new Map();
for (const question of set.questions) {
  const { q } = question;
  const results = await search({ query: q, asOf: null, embedding: embed ? await embed(q) : undefined });
  const rank = results.findIndex((r) => answers(question, r)) + 1;
  if (question.signal) openRanks.set(question, rank);
  else {
    baseRanks.push(rank);
    const g = (byGroup[groupOf(question)] ??= { hit: 0, n: 0 });
    g.n++;
    if (rank) g.hit++;
  }
  if (rank || results.some((r) => judged(question, r))) judgedHits5++;
  if (rank) {
    hits5++;
    rr += 1 / rank;
    if (rank === 1) hits1++;
  } else misses.push(`  MISS ${q}\n       expected ${[...(question.expect ?? []), ...(question.sources ?? [])].join(", ")}; got ${results.map((r) => `${r.sourceId}/${doc(r.ref)} (${r.heading.slice(0, 50)})`).join(" | ") || "nothing"}`);
}
// Author-named questions: the same search again the way the Tutor now sends it, the writer's name moved into the source filter.
const scopedQuestions = set.questions.filter((qu) => qu.scoped);
let scopedHits = 0;
let scopedRr = 0;
const scopedMisses = [];
for (const question of scopedQuestions) {
  const { q, source } = question.scoped;
  const results = await search({ query: q, source, asOf: null, embedding: embed ? await embed(q) : undefined });
  const rank = results.findIndex((r) => answers(question, r)) + 1;
  if (rank) {
    scopedHits++;
    scopedRr += 1 / rank;
  } else scopedMisses.push(`  SCOPED MISS "${q}" [source ${source}]; got ${results.map((r) => `${r.sourceId}/${doc(r.ref)}`).join(" | ") || "nothing"}`);
}
const n = set.questions.length;
console.log(`Library search score (${mode}), ${n} questions`);
console.log(`  hits@5 ${hits5}/${n} (${Math.round((100 * hits5) / n)}%), hits@1 ${hits1}/${n}, mean reciprocal rank ${(rr / n).toFixed(2)}`);
console.log(`  judged hits@5 (also counting other-source passages read and judged to answer, see alsoExpect) ${judgedHits5}/${n} (${Math.round((100 * judgedHits5) / n)}%)`);
if (openRanks.size) console.log(`  without the Signal Case questions (${baseRanks.length}): ${tally(baseRanks)}`);
console.log(`  by source${openRanks.size ? " (Signal Case questions left out)" : ""}: ${Object.entries(byGroup).map(([k, v]) => `${k} ${v.hit}/${v.n}`).join(", ")}`);
if (misses.length) console.log(misses.join("\n"));
if (scopedQuestions.length) {
  const named = scopedQuestions.map((qu) => misses.some((m) => m.startsWith(`  MISS ${qu.q}\n`)));
  console.log(`  author-named questions (${scopedQuestions.length}): name left in the query ${named.filter((m) => !m).length}/${scopedQuestions.length}; scoped by the source filter ${scopedHits}/${scopedQuestions.length}, MRR ${(scopedRr / scopedQuestions.length).toFixed(2)}`);
  if (scopedMisses.length) console.log(scopedMisses.join("\n"));
}

// Signal Case questions: the scores above (no as-of limit), then the same search with the Case's as-of date, as the Tutor sends it.
const signalAsOfRanks = [];
if (openRanks.size) {
  const byCase = {};
  const asOfMisses = [];
  for (const [question, open] of openRanks) {
    const { q, signal } = question;
    const results = await search({ query: q, asOf: signal.asOf, embedding: embed ? await embed(q) : undefined });
    const rank = results.findIndex((r) => answers(question, r)) + 1;
    const c = (byCase[signal.case] ??= { open: [], asOf: [] });
    c.open.push(open);
    c.asOf.push(rank);
    signalAsOfRanks.push(rank);
    if (!rank) asOfMisses.push(`  AS-OF MISS ${q} (as of ${signal.asOf}); got ${results.map((r) => `${r.sourceId}/${doc(r.ref)}`).join(" | ") || "nothing"}`);
  }
  const cases = Object.values(byCase);
  console.log(`\nSignal Case questions (${openRanks.size}):`);
  console.log(`  no as-of limit: ${tally(cases.flatMap((c) => c.open))}`);
  console.log(`  with the Case's as-of date: ${tally(cases.flatMap((c) => c.asOf))}`);
  console.log(`  by Case, hits@5 no limit / as of: ${Object.entries(byCase).map(([k, c]) => `${k} ${c.open.filter(Boolean).length}/${c.open.length} / ${c.asOf.filter(Boolean).length}/${c.asOf.length}`).join(", ")}`);
  if (asOfMisses.length) console.log(asOfMisses.join("\n"));
}

console.log("\nHindsight probes (as-of rule on):");
for (const { q, asOf, outcome } of set.hindsight ?? []) {
  const results = await search({ query: q, asOf, embedding: embed ? await embed(q) : undefined });
  const year = Number(asOf.slice(0, 4));
  const flagged = results.flatMap((r) => {
    const later = [...new Set(r.text.match(/\b20\d\d\b/g) ?? [])].filter((y) => Number(y) > year);
    const told = outcome.filter((o) => r.text.toLowerCase().includes(o.toLowerCase()));
    const dated = r.kind === "dated" && r.publishedOn > asOf;
    return later.length || told.length || dated ? [`${doc(r.ref)} ${r.kind}${dated ? " DATED AFTER AS-OF" : ""}: later years ${later.join(",") || "none"}; outcome words ${told.join(",") || "none"}`] : [];
  });
  console.log(`  "${q}" (as of ${asOf}): ${results.length} results; ${flagged.length ? `${flagged.length} mention later events:\n    ${flagged.join("\n    ")}` : "none mention later events"}`);
}

// PROTOTYPE (#28): time per search (from this laptop) and rerank tokens, then one summary line for the write-up.
const ms = (x) => `${Math.round(x)} ms`;
const spread = (xs) => `p50 ${ms(pct(xs, 50))}, p95 ${ms(pct(xs, 95))}, max ${ms(Math.max(0, ...xs))}`;
console.log(`\nTime per search, ${timings.searchMs.length} searches (laptop -> Neon${rerankModel ? " and Voyage" : ""}):`);
console.log(`  database search (top ${rerankModel ? RERANK_POOL : KEEP}): ${spread(timings.searchMs)}`);
if (rerankModel) {
  const total = timings.tokens.reduce((s, t) => s + t, 0);
  console.log(`  rerank call (${timings.rerankMs.length} calls, ${timings.retries} retries after 429): ${spread(timings.rerankMs)}`);
  console.log(`  search + rerank: ${spread(timings.totalMs)}`);
  console.log(`  rerank tokens per search: mean ${Math.round(total / (timings.tokens.length || 1))}, p50 ${pct(timings.tokens, 50)}, p95 ${pct(timings.tokens, 95)}, max ${Math.max(0, ...timings.tokens)}; total ${total}`);
}
const mrr = (ranks) => Number((ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / (ranks.length || 1)).toFixed(3));
const score = (ranks) => ({ n: ranks.length, hits5: ranks.filter(Boolean).length, hits1: ranks.filter((r) => r === 1).length, mrr: mrr(ranks) });
const signalOpen = [...openRanks.values()];
console.log(
  `\nSUMMARY ${JSON.stringify({
    mode,
    original: score(baseRanks),
    signalOpen: score(signalOpen),
    signalAsOf: score(signalAsOfRanks),
    searchMs: { p50: Math.round(pct(timings.searchMs, 50)), p95: Math.round(pct(timings.searchMs, 95)) },
    totalMs: { p50: Math.round(pct(timings.totalMs, 50)), p95: Math.round(pct(timings.totalMs, 95)) },
    candidates: { mean: Number((timings.pool.reduce((s, n) => s + n, 0) / (timings.pool.length || 1)).toFixed(1)), min: Math.min(...timings.pool), max: Math.max(...timings.pool) },
    ...(rerankModel && {
      rerankMs: { p50: Math.round(pct(timings.rerankMs, 50)), p95: Math.round(pct(timings.rerankMs, 95)) },
      tokensPerSearch: { mean: Math.round(timings.tokens.reduce((s, t) => s + t, 0) / (timings.tokens.length || 1)), max: Math.max(0, ...timings.tokens) },
      retries: timings.retries,
    }),
  })}`,
);
console.log(`RANKS original ${baseRanks.join(",")}`);
console.log(`RANKS signal-open ${signalOpen.join(",")}`);
console.log(`RANKS signal-asof ${signalAsOfRanks.join(",")}`);
