// Judges Library search with the test questions, from the laptop, against the database in .env. Run:
//   npm run library:score -- [questions.json] [--ranking bm25|full-text] [--voyage] [--rerank=<model> [--pool=<n>]]
// For each question it runs the app's own search (src/library/search.ts) and scores a hit when a
// passage from an expected document is in the top 5; it reports hits@5, hits@1 and mean reciprocal
// rank. --voyage adds the query embedding (needs VOYAGE_API_KEY). The hindsight probes run with a
// Case's as-of date and list any passage that mentions a later year or the Case's outcome, because
// timeless reference text can still give an ending away (judge: src/library/hindsight.ts). Probes
// with a `case` carry each Signal Case's outcome words; the last line names any Case they caught.
// Signal Case questions (those with `signal`, #24) are scored apart: once with no as-of limit, once
// with their Case's as-of date, as the Tutor searches during a Case.
// --rerank=<model> (rerank-3-lite or rerank-3, needs VOYAGE_API_KEY; #28, #37) takes the merged top
// --pool (default 30; at most 30 keyword only, 60 with --voyage) instead of 5, has the Voyage reranker
// reorder them and keeps the top 5. Every search goes through it, the scoped, as-of and hindsight runs
// too. The app's search does not rerank. A flag the scorer does not know stops the run before it starts.
// The end prints the time per search, a SUMMARY line and the RANKS, to compare runs. The rerank time is
// the call that answered; the search + rerank time also holds any retry waits (both as in #28).
// Flags, answers, tallies and the reranked search: src/library/score.ts.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hindsightFlag } from "../src/library/hindsight.ts";
import { checkQuestionSet, docOf as doc, formatTally, judged, KEEP, parseScoreArgs, percentile, queriesToEmbed, rankOf, scorerSearch, tally, voyageReranker } from "../src/library/score.ts";
import { keywordRanking, searchPassages } from "../src/library/search.ts";
import { voyageEmbed } from "../src/library/voyage.ts";

const options = parseScoreArgs(process.argv.slice(2));
const file = options.file ?? new URL("./library/eval/questions.json", import.meta.url);
const set = JSON.parse(readFileSync(file, "utf8"));
const problems = checkQuestionSet(set);
if (problems.length) throw new Error(`The question set has problems:\n  ${problems.join("\n  ")}`);
if (options.rerank && !process.env.VOYAGE_API_KEY) throw new Error("--rerank needs VOYAGE_API_KEY in .env");
const db = drizzle({ client: neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL) });
const ranking = options.ranking ?? (await keywordRanking(db));
let embed;
let voyageCalls = 0;
if (options.voyage) {
  if (!process.env.VOYAGE_API_KEY) throw new Error("--voyage needs VOYAGE_API_KEY in .env");
  // Every distinct query is embedded up front, 128 to a call, so a run makes a few Voyage calls, not one per search.
  const queries = queriesToEmbed(set);
  const vectors = new Map();
  for (let i = 0; i < queries.length; i += 128) {
    const batch = queries.slice(i, i + 128);
    const { embeddings } = await voyageEmbed({ apiKey: process.env.VOYAGE_API_KEY }, batch, "query");
    voyageCalls++;
    batch.forEach((query, j) => vectors.set(query, embeddings[j]));
  }
  embed = async (query) => vectors.get(query);
}
const rerank = options.rerank ? voyageReranker({ apiKey: process.env.VOYAGE_API_KEY, model: options.rerank }) : undefined;
const { search, timings } = scorerSearch((query) => searchPassages(db, query), { ranking, rerank, pool: options.pool });
const mode = `${ranking}${embed ? ` + Voyage vectors (combined; ${voyageCalls} Voyage call${voyageCalls === 1 ? "" : "s"})` : " keyword only"}${rerank ? ` + rerank ${options.rerank} (top ${options.pool} -> ${KEEP})` : ""}`;

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
  const rank = rankOf(question, results, set.source);
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
  const rank = rankOf(question, results, set.source);
  if (rank) {
    scopedHits++;
    scopedRr += 1 / rank;
  } else scopedMisses.push(`  SCOPED MISS "${q}" [source ${source}]; got ${results.map((r) => `${r.sourceId}/${doc(r.ref)}`).join(" | ") || "nothing"}`);
}
const n = set.questions.length;
console.log(`Library search score (${mode}), ${n} questions`);
console.log(`  hits@5 ${hits5}/${n} (${Math.round((100 * hits5) / n)}%), hits@1 ${hits1}/${n}, mean reciprocal rank ${(rr / n).toFixed(2)}`);
console.log(`  judged hits@5 (also counting other-source passages read and judged to answer, see alsoExpect) ${judgedHits5}/${n} (${Math.round((100 * judgedHits5) / n)}%)`);
if (openRanks.size) console.log(`  without the Signal Case questions (${baseRanks.length}): ${formatTally(baseRanks)}`);
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
    const rank = rankOf(question, results, set.source);
    const c = (byCase[signal.case] ??= { open: [], asOf: [] });
    c.open.push(open);
    c.asOf.push(rank);
    signalAsOfRanks.push(rank);
    if (!rank) asOfMisses.push(`  AS-OF MISS ${q} (as of ${signal.asOf}); got ${results.map((r) => `${r.sourceId}/${doc(r.ref)}`).join(" | ") || "nothing"}`);
  }
  console.log(`\nSignal Case questions (${openRanks.size}):`);
  console.log(`  no as-of limit: ${formatTally([...openRanks.values()])}`);
  console.log(`  with the Case's as-of date: ${formatTally(signalAsOfRanks)}`);
  console.log(`  by Case, hits@5 no limit / as of: ${Object.entries(byCase).map(([k, c]) => `${k} ${c.open.filter(Boolean).length}/${c.open.length} / ${c.asOf.filter(Boolean).length}/${c.asOf.length}`).join(", ")}`);
  if (asOfMisses.length) console.log(asOfMisses.join("\n"));
}

console.log("\nHindsight probes (as-of rule on):");
const probes = set.hindsight ?? [];
let clean = 0;
const told = new Set();
for (const probe of probes) {
  const { q, asOf } = probe;
  const results = await search({ query: q, asOf, embedding: embed ? await embed(q) : undefined });
  const flagged = results.flatMap((r) => {
    const f = hindsightFlag(r, probe);
    if (f?.outcomeWords.length && probe.case) told.add(probe.case);
    return f ? [`${r.sourceId}/${doc(r.ref)} ${r.kind}${f.datedAfterAsOf ? " DATED AFTER AS-OF" : ""}: later years ${f.laterYears.join(",") || "none"}; outcome words ${f.outcomeWords.join(",") || "none"}`] : [];
  });
  if (!flagged.length) clean++;
  const label = probe.case ? `[${probe.case}] ` : "";
  console.log(`  ${label}"${q}" (as of ${asOf}): ${results.length} results; ${flagged.length ? `${flagged.length} mention later events:\n    ${flagged.join("\n    ")}` : "none mention later events"}`);
}
const cases = [...new Set(probes.filter((p) => p.case).map((p) => p.case))];
console.log(`  clean ${clean}/${probes.length}; Signal Cases whose outcome words a passage let through: ${[...told].join(", ") || "none"} (of ${cases.length}: ${cases.join(", ")})`);

// Time per search from this machine, rerank tokens, then one SUMMARY line and the RANKS, to compare runs (#28, #37).
const ms = (x) => `${Math.round(x)} ms`;
const spread = (xs) => `p50 ${ms(percentile(xs, 50))}, p95 ${ms(percentile(xs, 95))}, max ${ms(Math.max(0, ...xs))}`;
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
console.log(`\nTime per search, ${timings.searchMs.length} searches (this machine -> Neon${rerank ? " and Voyage" : ""}):`);
console.log(`  database search (top ${rerank ? options.pool : KEEP}): ${spread(timings.searchMs)}`);
if (rerank) {
  const total = timings.tokens.reduce((s, t) => s + t, 0);
  console.log(`  rerank call (${timings.rerankMs.length} calls, ${timings.retries} retries after a 429, 5xx or timeout): ${spread(timings.rerankMs)}`);
  console.log(`  search + rerank: ${spread(timings.totalMs)}`);
  console.log(`  rerank tokens per search: mean ${Math.round(mean(timings.tokens))}, p50 ${percentile(timings.tokens, 50)}, p95 ${percentile(timings.tokens, 95)}, max ${Math.max(0, ...timings.tokens)}; total ${total}`);
}
const score = (ranks) => {
  const t = tally(ranks);
  return { ...t, mrr: Number(t.mrr.toFixed(3)) };
};
const p5095 = (xs) => ({ p50: Math.round(percentile(xs, 50)), p95: Math.round(percentile(xs, 95)) });
const signalOpen = [...openRanks.values()];
console.log(
  `\nSUMMARY ${JSON.stringify({
    mode,
    original: score(baseRanks),
    signalOpen: score(signalOpen),
    signalAsOf: score(signalAsOfRanks),
    searchMs: p5095(timings.searchMs),
    totalMs: p5095(timings.totalMs),
    candidates: { mean: Number(mean(timings.pool).toFixed(1)), min: Math.min(...timings.pool), max: Math.max(...timings.pool) },
    ...(rerank && {
      rerankMs: p5095(timings.rerankMs),
      tokensPerSearch: { mean: Math.round(mean(timings.tokens)), max: Math.max(0, ...timings.tokens) },
      retries: timings.retries,
    }),
  })}`,
);
console.log(`RANKS original ${baseRanks.join(",")}`);
console.log(`RANKS signal-open ${signalOpen.join(",")}`);
console.log(`RANKS signal-asof ${signalAsOfRanks.join(",")}`);
