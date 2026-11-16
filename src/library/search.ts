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
export const POOL = 30;
/** Reciprocal rank fusion constant: a passage scores 1/(K + rank) in each ranking it appears in. */
const RRF_K = 60;
export const BM25_INDEX = "library_passages_bm25";
/**
 * Source diversity (#38): in a search not scoped to a source, the results lead with the best passage
 * of each document, from each source's best PER_SOURCE documents (ARCHIVAL_PER_SOURCE for an archival
 * source), in fused order, and only then any further passages. A document is a passage ref's part
 * before `#`: one chapter module, lecture, paper, post or filing. One large source, such as the
 * thousands of FOMC records, then cannot fill the top 5 with near-repeats and push out the passage that
 * explains, and neither can a second passage of one document: it points the Tutor to the same place,
 * which it can read more of by scoping a search to the source.
 */
export const PER_SOURCE = 2;
/** Archival sources are primary records (FOMC records, SEC filings): meeting after meeting and filing after filing repeat the same wording, so one passage points the Tutor to the record. */
export const ARCHIVAL_PER_SOURCE = 1;
/** Ids of archival sources start with one of these. */
const ARCHIVAL_PREFIXES = ["fomc-", "sec-"];

/** BM25 when the database has the lakebase_bm25 index (the migration creates it where lakebase_text exists). */
export async function keywordRanking(db: Executor): Promise<KeywordRanking> {
  const [row] = await rowsOf<{ bm25: boolean }>(db, sql`select to_regclass(${`public.${BM25_INDEX}`}) is not null as bm25`);
  return row?.bm25 ? "bm25" : "full-text";
}

/**
 * The as-of rule for the Library: a dated source's passages pass only when published on or before
 * the as-of date (one with no date never passes); a timeless source's pass only when every year they
 * mention is before the as-of year, because reference text written later can still tell the ending,
 * and a bare year can't say whether an event in the as-of year came before or after the as-of date.
 */
function allowed(asOf: string | null, source?: string): SQL {
  const scope = source ? sql` and p.source_id in (${matchingSources(source)})` : sql``;
  if (!asOf) return sql`true${scope}`;
  const year = Number(asOf.slice(0, 4));
  return sql`((p.published_on <= ${asOf}::date
    or (p.source_id in (select id from library_sources where kind = 'timeless') and coalesce(p.latest_year, 0) < ${year}))${scope})`;
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
 * rank fusion, with the as-of rule applied inside both rankings. Unscoped, the fused order then puts
 * first each document's best passage from each source's best PER_SOURCE (archival: ARCHIVAL_PER_SOURCE)
 * documents; a search scoped to a source keeps the fused order. Only passages the as-of rule let
 * through are reordered.
 */
export async function searchPassages(db: Executor, q: PassageQuery): Promise<LibraryHit[]> {
  const ranking = q.ranking ?? (await keywordRanking(db));
  const limit = q.limit ?? 5;
  const fused = q.embedding
    ? sql`select coalesce(kw.id, vec.id) as id, coalesce(1.0 / (${RRF_K} + kw.r), 0) + coalesce(1.0 / (${RRF_K} + vec.r), 0) as score
          from (${keywordRanks(q, ranking)}) kw full outer join (${vectorRanks({ ...q, embedding: q.embedding })}) vec on kw.id = vec.id`
    : sql`select kw.id, 1.0 / (${RRF_K} + kw.r) as score from (${keywordRanks(q, ranking)}) kw`;
  // doc: the passage's place among its own document's candidates; nth: among the passages that lead
  // their document, its place within its source, so a source's cap counts documents. Best first.
  const ranked = sql`
    select d.id, d.score, d.doc, row_number() over (partition by d.source_id, d.doc = 1 order by d.score desc, d.id) as nth
    from (
      select f.id, f.score, p.source_id,
        row_number() over (partition by p.source_id, split_part(p.ref, '#', 1) order by f.score desc, p.id) as doc
      from (${fused}) f join library_passages p on p.id = f.id
    ) d`;
  const archival = sql.join(ARCHIVAL_PREFIXES.map((prefix) => sql`p.source_id like ${`${prefix}%`}`), sql` or `);
  const diverse = q.source
    ? sql``
    : sql`(f.doc = 1 and f.nth <= case when ${archival} then ${ARCHIVAL_PER_SOURCE}::int else ${PER_SOURCE}::int end) desc,`;
  return rowsOf<LibraryHit>(
    db,
    sql`
      select p.id, p.source_id as "sourceId", s.title as "sourceTitle", s.kind, p.ref, p.heading, p.url,
        to_char(p.published_on, 'YYYY-MM-DD') as "publishedOn", p.text, p.licence, p.credit, s.quote_words as "quoteWords"
      from (${ranked}) f
      join library_passages p on p.id = f.id
      join library_sources s on s.id = p.source_id
      order by ${diverse} f.score desc, p.id
      limit ${limit}`,
  );
}

/**
 * One stored passage by its ID, with whether the as-of rule lets it be shown now; undefined when there
 * is none. `licenceUrl` is the source's licence link, or null for a passage under a licence of its own.
 */
export async function passageById(db: Executor, id: number, asOf: string | null): Promise<(LibraryHit & { licenceUrl: string | null; allowed: boolean }) | undefined> {
  const [row] = await rowsOf<LibraryHit & { licenceUrl: string | null; allowed: boolean }>(
    db,
    sql`
      select p.id, p.source_id as "sourceId", s.title as "sourceTitle", s.kind, p.ref, p.heading, p.url,
        to_char(p.published_on, 'YYYY-MM-DD') as "publishedOn", p.text, p.licence, p.credit, s.quote_words as "quoteWords",
        case when p.licence = s.licence then s.licence_url end as "licenceUrl", coalesce(${allowed(asOf)}, false) as allowed
      from library_passages p
      join library_sources s on s.id = p.source_id
      where p.id = ${id}`,
  );
  return row;
}

/** Which of these stored passages the as-of rule hides now; none while nothing is withheld. */
export async function hiddenAmong(db: Executor, ids: number[], asOf: string | null): Promise<Set<number>> {
  if (!asOf || !ids.length) return new Set();
  const rows = await rowsOf<{ id: number }>(
    db,
    sql`select p.id from library_passages p where p.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and not coalesce(${allowed(asOf)}, false)`,
  );
  return new Set(rows.map((r) => r.id));
}

/** The credit line of each of these stored passages, for the folded sources list. */
export async function creditsOf(db: Executor, ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const rows = await rowsOf<{ id: number; credit: string }>(db, sql`select p.id, p.credit from library_passages p where p.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((r) => [r.id, r.credit]));
}
