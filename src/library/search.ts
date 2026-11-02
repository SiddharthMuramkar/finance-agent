import { sql, type SQL } from "drizzle-orm";

// Packages only (no "@/" paths or relative value imports), so the Library scripts run the very same
// search from the laptop with Node's type stripping.

export type Executor = { execute(query: SQL): PromiseLike<unknown> };

/** Rows of a raw query, whichever driver ran it (PGlite and both Neon drivers return `{ rows }`). */
export async function rowsOf<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as { rows?: T[] } | T[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

/** One passage found, with what a credit needs. */
export type LibraryHit = {
  id: number;
  sourceId: string;
  sourceTitle: string;
  kind: "dated" | "timeless";
  ref: string;
  heading: string;
  url: string;
  publishedOn: string | null;
  text: string;
  licence: string;
  credit: string;
  /** The most words the Tutor may quote at once from this source, or null for no limit beyond "keep quotes short". */
  quoteWords: number | null;
};

/** How keyword matches are ranked: BM25 through lakebase_text on Neon, or Postgres full-text search (ts_rank_cd). */
export type KeywordRanking = "bm25" | "full-text";

export type PassageQuery = {
  query: string;
  /** While a Case is before its reveal: dated passages after this date are left out. Null means no limit. */
  asOf: string | null;
  /** The query's Voyage embedding; without it, results are keyword matches only. */
  embedding?: number[];
  /** Defaults to whatever the database has (see keywordRanking). */
  ranking?: KeywordRanking;
  limit?: number;
  /** Scope to the sources whose id, title or credit contain this text (a writer's name, "Yale", "S-1"). */
  source?: string;
};

/** How many candidates each ranking contributes before they are combined. */
const POOL = 30;
/** Reciprocal rank fusion constant: a passage scores 1/(K + rank) in each ranking it appears in. */
const RRF_K = 60;
export const BM25_INDEX = "library_passages_bm25";

/** BM25 when the database has the lakebase_bm25 index (the migration creates it where lakebase_text exists). */
export async function keywordRanking(db: Executor): Promise<KeywordRanking> {
  const [row] = await rowsOf<{ bm25: boolean }>(db, sql`select to_regclass(${`public.${BM25_INDEX}`}) is not null as bm25`);
  return row?.bm25 ? "bm25" : "full-text";
}

/**
 * The as-of rule for the Library: a dated source's passages pass only when published on or before
 * the as-of date (one with no date never passes); a timeless source's pass unless they mention a
 * year after the as-of year, because reference text written later can still tell the ending.
 */
function allowed(asOf: string | null, source?: string): SQL {
  const scope = source ? sql` and p.source_id in (${matchingSources(source)})` : sql``;
  if (!asOf) return sql`true${scope}`;
  const year = Number(asOf.slice(0, 4));
  return sql`((p.published_on <= ${asOf}::date
    or (p.source_id in (select id from library_sources where kind = 'timeless') and coalesce(p.latest_year, 0) <= ${year}))${scope})`;
}

/** Ids of the sources whose id, title or credit contain `text`, ignoring case (% and _ are plain characters). */
function matchingSources(text: string): SQL {
  const like = `%${text.trim().replace(/[\\%_]/g, "\\$&")}%`;
  return sql`select id from library_sources where id ilike ${like} or title ilike ${like} or credit ilike ${like}`;
}

/** The sources whose id, title or credit contain `text`, for telling the Tutor what it can scope a search to. */
export async function sourcesMatching(db: Executor, text: string): Promise<{ id: string; title: string }[]> {
  return rowsOf(db, sql`select id, title from library_sources where id in (${matchingSources(text)}) order by id`);
}

export async function allSources(db: Executor): Promise<{ id: string; title: string }[]> {
  return rowsOf(db, sql`select id, title from library_sources order by id`);
}

function keywordRanks(q: PassageQuery, ranking: KeywordRanking): SQL {
  if (ranking === "bm25") {
    return sql`
      select id, row_number() over (order by score, id) as r from (
        select p.id, p.search <@> to_bm25query(to_tsvector('english', ${q.query}), ${BM25_INDEX}::regclass) as score
        from library_passages p
        where ${allowed(q.asOf, q.source)}
        order by score limit ${POOL}
      ) k where score < 0`;
  }
  // Any of the query's words may match (OR), ranked by cover density, as a question rarely shares every word with its answer.
  return sql`
    select id, row_number() over (order by score desc, id) as r from (
      select p.id, ts_rank_cd(p.search, q) as score
      from library_passages p, (select nullif(replace(plainto_tsquery('english', ${q.query})::text, ' & ', ' | '), '')::tsquery as q) query
      where p.search @@ q and ${allowed(q.asOf, q.source)}
      order by score desc limit ${POOL}
    ) k`;
}

function vectorRanks(q: PassageQuery & { embedding: number[] }): SQL {
  const target = sql`${JSON.stringify(q.embedding)}::vector`;
  return sql`
    select id, row_number() over (order by distance, id) as r from (
      select p.id, p.embedding <=> ${target} as distance
      from library_passages p
      where p.embedding is not null and ${allowed(q.asOf, q.source)}
      order by distance limit ${POOL}
    ) v`;
}

/**
 * Combined search in SQL: keyword ranks and, given an embedding, vector ranks, fused by reciprocal
 * rank fusion, with the as-of rule applied inside both rankings.
 */
export async function searchPassages(db: Executor, q: PassageQuery): Promise<LibraryHit[]> {
  const ranking = q.ranking ?? (await keywordRanking(db));
  const limit = q.limit ?? 5;
  const fused = q.embedding
    ? sql`select coalesce(kw.id, vec.id) as id, coalesce(1.0 / (${RRF_K} + kw.r), 0) + coalesce(1.0 / (${RRF_K} + vec.r), 0) as score
          from (${keywordRanks(q, ranking)}) kw full outer join (${vectorRanks({ ...q, embedding: q.embedding })}) vec on kw.id = vec.id`
    : sql`select kw.id, 1.0 / (${RRF_K} + kw.r) as score from (${keywordRanks(q, ranking)}) kw`;
  return rowsOf<LibraryHit>(
    db,
    sql`
      select p.id, p.source_id as "sourceId", s.title as "sourceTitle", s.kind, p.ref, p.heading, p.url,
        to_char(p.published_on, 'YYYY-MM-DD') as "publishedOn", p.text, p.licence, p.credit, s.quote_words as "quoteWords"
      from (${fused}) f
      join library_passages p on p.id = f.id
      join library_sources s on s.id = p.source_id
      order by f.score desc, p.id
      limit ${limit}`,
  );
}
