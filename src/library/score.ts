import { POOL as RANKING_POOL, type KeywordRanking, type LibraryHit, type PassageQuery } from "./search.ts";

// The Library scorer's pure parts (scripts/library-score.mjs): its flags, what counts as an answer,
// rank tallies, time percentiles, and one search with the optional Voyage reranker (#28, #37).
// src/library/score.test.ts checks them with fakes. Packages and .ts-suffixed relative imports only,
// so Node runs it with type stripping. The app's search does not use the reranker (#28: parked).

/** Passages a search keeps. A question scores when a passage that answers it is in this top 5. */
export const KEEP = 5;
/** Merged candidates the reranker sees when --pool is not given (the #28 prototype's default). */
export const DEFAULT_POOL = 30;
const RANKINGS: readonly KeywordRanking[] = ["bm25", "full-text"];
/** Flags that take a value, written --name=value or --name value. */
const VALUE_FLAGS = ["--ranking", "--rerank", "--pool"];
const USAGE = "The scorer takes: [questions.json] [--ranking bm25|full-text] [--voyage] [--rerank=<model> [--pool=<n>]]";

/** One test question (scripts/library/eval/questions.json). */
export type ScoreQuestion = {
  /** The question in a Learner's own words: the search query. */
  q: string;
  /** Documents that answer it: `<source id>/<document ref>`, or a bare ref in the set's own source. */
  expect?: string[];
  /** Sources whose passages answer it when they contain one of `expectText` (any passage when there is none). */
  sources?: string[];
  expectText?: string[];
  /** Other passages read and judged to answer it too. They count only in the judged score. */
  alsoExpect?: string[];
  /** The query the Tutor sends instead of a writer's name, and the source filter to pair with it. */
  scoped?: { q: string; source: string };
  /** A Signal Case question: scored apart, once with no as-of limit and once with the Case's as-of date. */
  signal?: { case: string; asOf: string };
};

export type QuestionSet = {
  /** The source that bare `expect` refs belong to. */
  source: string;
  questions: ScoreQuestion[];
  hindsight?: { q: string; asOf: string; outcome: string[]; case?: string }[];
};

export type ScoreOptions = {
  /** A question file other than scripts/library/eval/questions.json (any argument ending in .json). */
  file?: string;
  /** --ranking bm25|full-text. Default: whatever the database has. */
  ranking?: KeywordRanking;
  /** --voyage: add the query embedding to the keyword search. */
  voyage: boolean;
  /** --rerank=<model>: the Voyage reranker model. Undefined: the app's own order, no reranker. */
  rerank?: string;
  /** --pool=<n>: how many merged candidates the reranker sees. */
  pool: number;
};

/**
 * Reads the scorer's flags. Throws on a flag it does not know or cannot use, so a typo never runs as a
 * plain baseline. The search takes at most 30 passages per ranking (search.ts POOL), so the reranker
 * can see at most 30 keyword only and 60 with --voyage. A pool can still come back smaller when the
 * keyword and vector rankings find the same passages; SUMMARY `candidates` shows the real size.
 */
export function parseScoreArgs(args: readonly string[]): ScoreOptions {
  let file: string | undefined;
  let voyage = false;
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      if (!arg.endsWith(".json")) throw new Error(`unknown argument "${arg}". ${USAGE}`);
      if (file !== undefined) throw new Error(`a second question file "${arg}" (the first is "${file}")`);
      file = arg;
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (name === "--voyage") {
      if (equals !== -1) throw new Error("--voyage takes no value");
      voyage = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(name)) throw new Error(`unknown flag "${arg}". ${USAGE}`);
    if (values.has(name)) throw new Error(`${name} given twice`);
    const next = args[i + 1];
    if (equals !== -1) values.set(name, arg.slice(equals + 1));
    else if (next !== undefined && !next.startsWith("--")) values.set(name, args[++i]);
    else values.set(name, "");
  }

  const ranking = values.get("--ranking");
  if (ranking !== undefined && !RANKINGS.includes(ranking as KeywordRanking)) throw new Error(`--ranking must be ${RANKINGS.join(" or ")}, not "${ranking}"`);

  const rerank = values.get("--rerank");
  if (rerank === "") throw new Error("--rerank needs a model, for example --rerank=rerank-3-lite");

  const poolText = values.get("--pool");
  if (poolText !== undefined && rerank === undefined) throw new Error("--pool sets how many passages the reranker sees; add --rerank=<model>");
  const pool = poolText === undefined ? DEFAULT_POOL : Number(poolText);
  if (!Number.isInteger(pool) || pool < KEEP) throw new Error(`--pool must be a whole number of at least ${KEEP}, not "${poolText}"`);
  const most = voyage ? 2 * RANKING_POOL : RANKING_POOL;
  if (pool > most) throw new Error(`--pool=${pool} is more than the search can give: at most ${most} passages ${voyage ? "with --voyage" : "keyword only (add --voyage for up to " + 2 * RANKING_POOL + ")"}`);

  return { file, ranking: ranking as KeywordRanking | undefined, voyage, rerank, pool };
}

/** A problem in the question set: duplicate questions, or a Signal question without a usable as-of date. */
export function checkQuestionSet(set: QuestionSet): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const question of set.questions) {
    if (seen.has(question.q)) problems.push(`question asked twice: "${question.q}"`);
    seen.add(question.q);
    const { signal } = question;
    if (!signal) continue;
    if (!signal.case) problems.push(`Signal question without a case: "${question.q}"`);
    if (!isIsoDate(signal.asOf)) problems.push(`Signal question whose as-of date is not YYYY-MM-DD: "${question.q}" (${signal.asOf})`);
  }
  return problems;
}

/** A real calendar date written YYYY-MM-DD. */
function isIsoDate(text: string | undefined): boolean {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** What the scorer reads from one search result. */
export type ScoredPassage = Pick<LibraryHit, "sourceId" | "ref" | "text">;

/** The document part of a passage ref ("m00053#p4" → "m00053"). */
export const docOf = (ref: string) => ref.split("#")[0];

/**
 * A passage answers a question when it is one of the `expect`ed documents (bare refs belong to the
 * set's own source), or comes from one of the question's `sources` and, if `expectText` is given,
 * contains one of those phrases (ignoring case).
 */
export function answers(question: ScoreQuestion, passage: ScoredPassage, setSource: string): boolean {
  const doc = docOf(passage.ref);
  const expected = (question.expect ?? []).some((e) => e === `${passage.sourceId}/${doc}` || (e === doc && passage.sourceId === setSource));
  const text = passage.text.toLowerCase();
  return expected || ((question.sources ?? []).includes(passage.sourceId) && (question.expectText ?? [""]).some((t) => text.includes(t.toLowerCase())));
}

/** A passage from another source that was read and judged to answer the question too (`alsoExpect`). */
export const judged = (question: ScoreQuestion, passage: ScoredPassage) => (question.alsoExpect ?? []).includes(`${passage.sourceId}/${docOf(passage.ref)}`);

/** The rank (1 = first) of the first passage that answers the question, or 0 for a miss. */
export const rankOf = (question: ScoreQuestion, passages: readonly ScoredPassage[], setSource: string) => passages.findIndex((p) => answers(question, p, setSource)) + 1;

export type Tally = { n: number; hits5: number; hits1: number; mrr: number };

/** hits@5, hits@1 and mean reciprocal rank of a list of ranks (0 is a miss). */
export function tally(ranks: readonly number[]): Tally {
  return {
    n: ranks.length,
    hits5: ranks.filter(Boolean).length,
    hits1: ranks.filter((r) => r === 1).length,
    mrr: ranks.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / (ranks.length || 1),
  };
}

export function formatTally(ranks: readonly number[]): string {
  const t = tally(ranks);
  return `hits@5 ${t.hits5}/${t.n}, hits@1 ${t.hits1}/${t.n}, MRR ${t.mrr.toFixed(2)}`;
}

/** The p-th percentile (nearest rank) of a list of numbers; 0 for an empty list. */
export function percentile(xs: readonly number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : 0;
}

/** Every distinct query a run searches for, so --voyage embeds them up front in a few calls. */
export function queriesToEmbed(set: QuestionSet): string[] {
  const all = [...set.questions.flatMap((question) => [question.q, question.scoped?.q]), ...(set.hindsight ?? []).map((probe) => probe.q)];
  return [...new Set(all.filter((q): q is string => Boolean(q)))];
}

/**
 * The reranker's answer: candidate indexes, most relevant first, the tokens it billed, the retries it
 * needed, and `ms`, the time of the call that answered. `ms` leaves out the waits and failed tries
 * before it, as the #28 runs timed it, so rerank times stay comparable when a run hits retries.
 */
export type Reranked = { order: number[]; tokens: number; retries: number; ms: number };
export type Reranker = (query: string, documents: string[], topK: number) => Promise<Reranked>;

/** What the reranker reads of a passage: its heading and its text. */
export const rerankDocument = (passage: Pick<LibraryHit, "heading" | "text">) => `${passage.heading}\n\n${passage.text}`;

/** The passages in the reranker's order, top `keep` only. Throws on an index that is not one of the candidates, or one given twice. */
export function inRerankOrder<T>(candidates: readonly T[], order: readonly number[], keep = KEEP): T[] {
  const seen = new Set<number>();
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length) throw new Error(`reranker returned index ${i} for ${candidates.length} passages`);
    if (seen.has(i)) throw new Error(`reranker returned index ${i} twice`);
    seen.add(i);
  }
  return order.slice(0, keep).map((i) => candidates[i]);
}

/** Times (ms), sizes and tokens of every search a run made. totalMs is wall time, retry waits included (as in #28). */
export type SearchTimings = { searchMs: number[]; rerankMs: number[]; totalMs: number[]; tokens: number[]; pool: number[]; retries: number };

/** A search as the scorer asks it: the query, as-of date, embedding and source filter. The scorer sets ranking and limit. */
export type ScorerQuery = Omit<PassageQuery, "ranking" | "limit">;

/**
 * The scorer's search. Without a reranker: the app's search, top 5, exactly as before. With one: the
 * app's search for the top `pool` (the as-of rule already applied, so the reranker only ever sees
 * passages the Case may show), reordered by the reranker, top 5 kept. Every search is timed.
 */
export function scorerSearch<T extends Pick<LibraryHit, "heading" | "text">>(
  find: (query: PassageQuery) => Promise<T[]>,
  options: { ranking?: KeywordRanking; rerank?: Reranker; pool?: number; now?: () => number } = {},
) {
  const { ranking, rerank, pool = DEFAULT_POOL, now = () => performance.now() } = options;
  const timings: SearchTimings = { searchMs: [], rerankMs: [], totalMs: [], tokens: [], pool: [], retries: 0 };
  async function search(query: ScorerQuery): Promise<T[]> {
    const started = now();
    const candidates = await find({ ...query, ranking, limit: rerank ? pool : KEEP });
    timings.searchMs.push(now() - started);
    timings.pool.push(candidates.length);
    let kept = candidates.slice(0, KEEP);
    if (rerank && candidates.length > 1) {
      const { order, tokens, retries, ms } = await rerank(query.query, candidates.map(rerankDocument), KEEP);
      timings.rerankMs.push(ms);
      timings.tokens.push(tokens);
      timings.retries += retries;
      kept = inRerankOrder(candidates, order);
    }
    timings.totalMs.push(now() - started);
    return kept;
  }
  return { search, timings };
}

const RERANK_ENDPOINT = "https://api.voyageai.com/v1/rerank";

export type VoyageRerankOptions = {
  apiKey: string;
  /** rerank-3-lite or rerank-3 (#28). */
  model: string;
  fetch?: typeof globalThis.fetch;
  /** Waits between retries; tests pass one that does not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** The clock for `ms`; tests pass a fake one. */
  now?: () => number;
  /** Retries after a 429, a 5xx, a timeout or a dropped connection, waiting 1, 2, 4 … seconds. */
  retries?: number;
  timeoutMs?: number;
};

/**
 * The Voyage reranker (/v1/rerank) for the scorer. It retries a 429, a 5xx, a timeout or a dropped
 * connection with backoff, so one bad call does not stop a paid run. It throws at once on any other
 * error (a bad key or model), and after its last retry.
 */
export function voyageReranker(options: VoyageRerankOptions): Reranker {
  const {
    apiKey,
    model,
    fetch = globalThis.fetch,
    sleep = (ms) => new Promise<void>((done) => setTimeout(done, ms)),
    now = () => performance.now(),
    retries = 6,
    timeoutMs = 30_000,
  } = options;
  return async (query, documents, topK) => {
    for (let attempt = 0; ; attempt++) {
      const started = now();
      let response: Response;
      try {
        response = await fetch(RERANK_ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ query, documents, model, top_k: topK, truncation: true }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt >= retries) throw error;
        await sleep(2 ** attempt * 1000);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await response.body?.cancel();
        await sleep(2 ** attempt * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`Voyage rerank ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = (await response.json()) as { data: { index: number; relevance_score?: number }[]; usage?: { total_tokens?: number } };
      // Voyage sorts by relevance already; sorting again (stable) keeps the order right if it ever does not.
      const order = [...body.data].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)).map((d) => d.index);
      return { order, tokens: body.usage?.total_tokens ?? 0, retries: attempt, ms: now() - started };
    }
  };
}
