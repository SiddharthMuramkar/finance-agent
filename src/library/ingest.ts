import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

// This module imports only packages (no "@/" paths), so the Library scripts can run it from the
// laptop with Node's type stripping. It writes with plain SQL for the same reason.

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase words joined by hyphens");

/** One Library source, as a load file describes it. */
export const librarySourceInput = z.object({
  id: slug,
  title: z.string().min(1),
  /** `dated` passages fall under the as-of rule; `timeless` reference is always searchable. */
  kind: z.enum(["dated", "timeless"]),
  licence: z.string().min(1),
  licenceUrl: z.url(),
  /** The credit line every search result carries. */
  credit: z.string().min(1),
  url: z.url(),
  fetchedOn: z.iso.date(),
  /** When set, the Tutor may quote at most this many words at a time from the source (a blog stored whole for search). */
  quoteWords: z.number().int().positive().optional(),
});

/**
 * Sources the spec keeps out of the Library, matched on a source's id, title and link: Buffett's
 * letters and essays, Zitron's articles, the CNBC Buffett Archive, Investopedia, YouTube
 * transcripts, and material from bodies that have not allowed storing (IMF, FRED, St. Louis Fed,
 * SEBI; the RBI, whose disclaimer prohibits caching, until it allows it).
 */
const BLOCKED = /buffett|berkshire|zitron|wheresyoured|cnbc|investopedia|youtube|youtu\.be|\brbi\b|rbi\.org\.in|imf\.org|\bimf\b|fred\.stlouisfed|stlouisfed|\bfred\b|sebi/i;

export function isBlockedSource(source: { id: string; title: string; url: string }): boolean {
  return BLOCKED.test(`${source.id} ${source.title} ${source.url}`);
}

/** One passage, already cleaned and cut. Licence and credit default to the source's. */
export const libraryPassageInput = z.object({
  ref: z.string().min(1),
  heading: z.string().min(1),
  url: z.url(),
  publishedOn: z.iso.date().nullable().optional(),
  text: z.string().min(1),
  licence: z.string().min(1).optional(),
  credit: z.string().min(1).optional(),
});

export const libraryFile = z
  .object({ source: librarySourceInput, passages: z.array(libraryPassageInput).min(1) })
  .refine((f) => !isBlockedSource(f.source), { message: "this source is not allowed in the Library (the spec keeps it out)" })
  .refine((f) => f.source.kind === "timeless" || f.passages.every((p) => p.publishedOn), {
    message: "every passage of a dated source needs publishedOn, or the as-of rule cannot place it",
  })
  .refine((f) => new Set(f.passages.map((p) => p.ref)).size === f.passages.length, { message: "a passage ref is repeated" });

export type LibraryFile = z.input<typeof libraryFile>;

export type Executor = { execute(query: SQL): PromiseLike<unknown> };

/** Rows of a raw query (PGlite and both Neon drivers return `{ rows }`). Kept here, not imported, so Node can run this file alone. */
async function rowsOf<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as { rows?: T[] } | T[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

/** The latest year from 1900 to 2099 that a text mentions, or null. */
export function latestYear(text: string): number | null {
  const years = (text.match(/\b(19|20)\d\d\b/g) ?? []).map(Number);
  return years.length ? Math.max(...years) : null;
}

/** Rows written per insert statement. */
const BATCH = 200;

/**
 * Writes one source and its passages. A reload replaces the source's passages: a passage whose
 * text is unchanged keeps its embedding, a changed one loses it (to be embedded again), and a
 * passage no longer in the file is removed.
 */
export async function importLibrary(db: Executor, input: LibraryFile): Promise<{ passages: number; removed: number }> {
  const { source: s, passages } = libraryFile.parse(input);
  await db.execute(sql`
    insert into library_sources (id, title, kind, licence, licence_url, credit, url, fetched_on, quote_words)
    values (${s.id}, ${s.title}, ${s.kind}, ${s.licence}, ${s.licenceUrl}, ${s.credit}, ${s.url}, ${s.fetchedOn}, ${s.quoteWords ?? null})
    on conflict (id) do update set
      title = excluded.title, kind = excluded.kind, licence = excluded.licence, licence_url = excluded.licence_url,
      credit = excluded.credit, url = excluded.url, fetched_on = excluded.fetched_on, quote_words = excluded.quote_words`);
  for (let i = 0; i < passages.length; i += BATCH) {
    const rows = passages
      .slice(i, i + BATCH)
      .map((p) => sql`(${s.id}, ${p.ref}, ${p.heading}, ${p.url}, ${p.publishedOn ?? null}::date, ${p.text}, ${latestYear(`${p.heading} ${p.text}`)}::integer, ${p.licence ?? s.licence}, ${p.credit ?? s.credit})`);
    await db.execute(sql`
      insert into library_passages (source_id, ref, heading, url, published_on, text, latest_year, licence, credit)
      values ${sql.join(rows, sql`, `)}
      on conflict (source_id, ref) do update set
        heading = excluded.heading, url = excluded.url, published_on = excluded.published_on, latest_year = excluded.latest_year,
        licence = excluded.licence, credit = excluded.credit,
        embedding = case when library_passages.text = excluded.text then library_passages.embedding end,
        embedded_with = case when library_passages.text = excluded.text then library_passages.embedded_with end,
        text = excluded.text`);
  }
  const refs = sql.join(
    passages.map((p) => sql`${p.ref}`),
    sql`, `,
  );
  const removed = await rowsOf<{ id: number }>(db, sql`delete from library_passages where source_id = ${s.id} and ref not in (${refs}) returning id`);
  return { passages: passages.length, removed: removed.length };
}

/** Passages with no embedding yet, in load order, for the embedding script. */
export async function passagesToEmbed(db: Executor, limit: number): Promise<{ id: number; ref: string; heading: string; text: string }[]> {
  return rowsOf(db, sql`select id, ref, heading, text from library_passages where embedding is null order by id limit ${limit}`);
}

/** Saves Voyage embeddings (and the model that made them) on passages, in one statement. */
export async function saveEmbeddings(db: Executor, rows: { id: number; embedding: number[]; model: string }[]): Promise<void> {
  if (!rows.length) return;
  const values = sql.join(
    rows.map((r) => sql`(${r.id}::integer, ${JSON.stringify(r.embedding)}::vector, ${r.model})`),
    sql`, `,
  );
  await db.execute(sql`
    update library_passages p set embedding = v.embedding, embedded_with = v.model
    from (values ${values}) as v(id, embedding, model) where p.id = v.id`);
}
