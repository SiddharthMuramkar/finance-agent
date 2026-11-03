import { createHash, timingSafeEqual } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { blogDocuments, blogPictures, bloggerFeed } from "./blog.ts";
import { importLibraryDocument, passagesToEmbed, saveEmbeddings, type Executor, type LibraryFile } from "./ingest.ts";
import { loadReadings, recordDocument, saveReading } from "./picture-cache.ts";
import { READER_MODEL, readParams, unreadPictures, type PictureReadings } from "./pictures.ts";
import { toReading, type PictureClient } from "./pictures-run.ts";
import { prepareDocuments, type PreparedPassage } from "./prepare.ts";
import { keywordRanking } from "./search.ts";
import { fetchSpreadsheet, readWorkbook, spreadsheetLinks, workbookDocument } from "./spreadsheets.ts";
import { VOYAGE_MODEL } from "./voyage.ts";

// The weekly refresh of Damodaran's blog: the posts that are new or edited since the last run go
// into the Library with their text, pictures and spreadsheets, then the new passages are embedded
// and the keyword statistics refreshed. Packages and relative imports only, so a script could run
// it too. All the network and paid parts are passed in, so a test needs no network and no secrets.

/** The run works for this long in all; Vercel's own limit for the route is 300 s. */
export const REFRESH_BUDGET_MS = 200_000;
/** No new post, picture or file is started in the last stretch of the budget: it is kept for embedding and the keyword statistics. */
export const RESERVE_MS = 40_000;
/** A few posts a run: each one can hold many pictures (a model call each) and spreadsheets. */
export const MAX_POSTS_PER_RUN = 5;
/** A run still `running` after this long is dead (the function was cut off); the next run marks it failed. */
export const STALE_AFTER_MS = 10 * 60_000;
/** The first run, with no earlier one to continue from, looks back this far. */
export const FIRST_LOOKBACK_DAYS = 8;

export const BLOG_SOURCE = "damodaran-blog";
export const SHEETS_SOURCE = "damodaran-spreadsheets";
const FEED = "https://aswathdamodaran.blogspot.com/feeds/posts/default";
const USER_AGENT = "finance-agent-library/1.0 (siddharth.muramkar@icloud.com; private study use)";
const EMBED_BATCH = 64;

type SourceInput = LibraryFile["source"];

export type RefreshDeps = {
  db: Executor;
  /** The two source records (scripts/library/sources.json) the posts and files are filed under. */
  sources: { blog: SourceInput; sheets: SourceInput };
  fetch?: typeof fetch;
  now?: () => Date;
  budgetMs?: number;
  maxPosts?: number;
  /** Reads pictures with the model. Without it, pictures are left out and the run says so. */
  pictures?: PictureClient;
  /** Embeds passages with Voyage. Without it, the new passages stay keyword-only and the run says so. */
  embed?: (texts: string[]) => Promise<number[][]>;
};

export type AddedPost = { ref: string; title: string; edited: boolean; passages: number; spreadsheets: number };
export type Problem = { step: string; message: string };
export type RefreshResult =
  | { status: "locked" }
  | { status: "failed"; runId: number; note: string }
  | { status: "done"; runId: number; added: AddedPost[]; failed: Problem[]; watermark: string; moreToDo: boolean; embedded: number };

// ---- Access -----------------------------------------------------------------------------------

/** True only for `Authorization: Bearer <CRON_SECRET>`; no secret set means nobody gets in. */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

// ---- The run log and lock ---------------------------------------------------------------------

async function rowsOf<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as { rows?: T[] } | T[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

/**
 * Starts a run, or returns null when another is running. A run still `running` after ten minutes is
 * marked failed first. The database lets only one row be `running`, so two runs starting together
 * cannot both get in.
 */
export async function startRun(db: Executor, now: Date): Promise<{ id: number; watermark: string | null } | null> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
  await db.execute(sql`
    update library_refresh_runs set status = 'failed', finished_at = ${now.toISOString()}::timestamptz,
      note = 'Marked failed: still running after 10 minutes, so the function was cut off.'
    where status = 'running' and started_at < ${cutoff}::timestamptz`);
  try {
    const [row] = await rowsOf<{ id: number }>(
      db,
      sql`insert into library_refresh_runs (started_at, status) values (${now.toISOString()}::timestamptz, 'running') returning id`,
    );
    const [last] = await rowsOf<{ watermark: string }>(
      db,
      sql`select watermark from library_refresh_runs where status = 'done' and watermark is not null order by id desc limit 1`,
    );
    return { id: row.id, watermark: last?.watermark ?? null };
  } catch (error) {
    if (/library_refresh_one_running|unique|duplicate/i.test(String((error as Error)?.message) + String((error as { cause?: Error })?.cause?.message))) return null;
    throw error;
  }
}

async function finishRun(
  db: Executor,
  id: number,
  end: { status: "done" | "failed"; at: Date; watermark?: string; added?: AddedPost[]; failed?: Problem[]; note?: string },
): Promise<void> {
  await db.execute(sql`
    update library_refresh_runs set status = ${end.status}, finished_at = ${end.at.toISOString()}::timestamptz,
      watermark = ${end.watermark ?? null}, added = ${JSON.stringify(end.added ?? [])}::jsonb,
      failed = ${JSON.stringify(end.failed ?? [])}::jsonb, note = ${end.note ?? null}
    where id = ${id}`);
}

// ---- Dating -----------------------------------------------------------------------------------

type StoredPassage = { ref: string; text: string; published_on: string | null };

async function storedPassages(db: Executor, sourceId: string, document: string): Promise<StoredPassage[]> {
  return rowsOf<StoredPassage>(
    db,
    sql`select ref, text, published_on::text as published_on from library_passages where source_id = ${sourceId} and split_part(ref, '#', 1) = ${document} order by id`,
  );
}

/**
 * Dates the passages of a document that was already stored. A passage whose text is already there
 * keeps its date; text that was not there before is dated by the edit (`floorDay`, the post's
 * updated day) when that is later than its own date, so it stays hidden from a Case dated between
 * the post and the edit.
 */
export function dateAfterEdit(passages: PreparedPassage[], stored: StoredPassage[], floorDay: string | null): PreparedPassage[] {
  const left = [...stored];
  return passages.map((p) => {
    const at = left.findIndex((s) => s.text === p.text);
    if (at >= 0) {
      const [same] = left.splice(at, 1);
      return { ...p, publishedOn: same.published_on ?? p.publishedOn };
    }
    const own = p.publishedOn ?? "";
    return { ...p, publishedOn: floorDay && floorDay > own ? floorDay : p.publishedOn };
  });
}

/**
 * The entries not yet recorded at this updated time. A post whose row in library_documents already
 * holds the feed's updated time (or a later one) was loaded by the backfill or an earlier run, so it
 * is left alone: only genuinely new or edited posts are worked on.
 */
export async function unrecordedEntries<T extends { ref: string; updatedAt: string }>(db: Executor, sourceId: string, entries: T[]): Promise<T[]> {
  if (!entries.length) return entries;
  const rows = await rowsOf<{ ref: string; ms: string | number | null }>(
    db,
    sql`select ref, extract(epoch from updated_at) * 1000 as ms from library_documents where source_id = ${sourceId} and ref in (${sql.join(entries.map((e) => sql`${e.ref}`), sql`, `)})`,
  );
  const recorded = new Map(rows.filter((r) => r.ms !== null).map((r) => [r.ref, Number(r.ms)]));
  return entries.filter((e) => {
    const have = recorded.get(e.ref);
    return have === undefined || Math.floor(have) < new Date(e.updatedAt).getTime();
  });
}

// ---- One post ---------------------------------------------------------------------------------

class OutOfTime extends Error {}

const refOf = (entryId: string) => `post-${entryId.split("post-").pop()}`;

type Entry = { raw: unknown; ref: string; updatedAt: string };

async function importPrepared(db: Executor, source: SourceInput, document: string, passages: PreparedPassage[], floorDay: string | null): Promise<number> {
  const dated = dateAfterEdit(passages, await storedPassages(db, source.id, document), floorDay);
  await importLibraryDocument(db, { source, document, passages: dated });
  return dated.length;
}

async function processPost(entry: Entry, deps: RefreshDeps, outOfTime: () => boolean, problems: Problem[]): Promise<AddedPost> {
  const { db, sources } = deps;
  const page = { feed: { entry: [entry.raw], openSearch$totalResults: { $t: "1" } } };
  const parsed = bloggerFeed.parse(page).feed.entry[0];
  const ref = entry.ref;

  // Pictures first: each unread one is a model call, so the budget is checked before every call.
  // Readings already stored (library_pictures) are reused, so an edited post pays for no picture twice and keeps the same words.
  const urls = [...new Set(blogPictures(page).map((p) => p.url))];
  const readings: PictureReadings = await loadReadings(db, urls);
  if (urls.length && !deps.pictures) problems.push({ step: `${ref} pictures`, message: `${urls.length} pictures not read: no Anthropic key is set` });
  else {
    for (const url of unreadPictures(urls, readings)) {
      if (outOfTime()) throw new OutOfTime();
      try {
        readings[url] = toReading(await deps.pictures!.messages.create(readParams(url)), READER_MODEL);
        await saveReading(db, url, readings[url]);
      } catch (error) {
        problems.push({ step: `${ref} picture`, message: `${url}: ${error instanceof Error ? error.message : error}` });
      }
    }
  }

  const doc = blogDocuments(page, { readings })[0];
  const existed = (await storedPassages(db, BLOG_SOURCE, ref)).length > 0;
  // Text added to an edited post is dated by the edit, not by the post.
  const updatedDay = entry.updatedAt.slice(0, 10);
  const floorDay = existed ? updatedDay : null;
  const edited = existed;
  let passages = 0;
  if (doc || existed) {
    const prepared = doc ? prepareDocuments([doc]).passages : [];
    passages = await importPrepared(db, sources.blog, ref, prepared, floorDay);
    await recordDocument(db, sources.blog.id, ref, parsed.published.$t, entry.updatedAt);
  }

  // The spreadsheets the post links to, each its own document in the spreadsheets source.
  let spreadsheets = 0;
  const title = parsed.title.$t || "Untitled post";
  for (const url of spreadsheetLinks(parsed.content?.$t ?? "")) {
    if (outOfTime()) throw new OutOfTime();
    try {
      const got = await fetchSpreadsheet(url, deps.fetch);
      if (!got) {
        problems.push({ step: `${ref} spreadsheet`, message: `${url}: not available or too big` });
        continue;
      }
      const { sheets } = readWorkbook(got.bytes);
      const sheetDoc = workbookDocument({ post: { ref, title, publishedOn: parsed.published.$t.slice(0, 10) }, url, lastModified: got.lastModified, sheets });
      if (!sheetDoc) continue;
      const prepared = prepareDocuments([sheetDoc]).passages;
      // Spreadsheet text that is new to a document already stored is dated by the edit too.
      const known = (await storedPassages(db, SHEETS_SOURCE, sheetDoc.ref)).length > 0;
      await importPrepared(db, sources.sheets, sheetDoc.ref, prepared, existed || known ? updatedDay : null);
      const modified = got.lastModified ? new Date(got.lastModified) : undefined;
      await recordDocument(db, sources.sheets.id, sheetDoc.ref, parsed.published.$t, modified && !Number.isNaN(modified.getTime()) ? modified.toISOString() : null);
      spreadsheets++;
    } catch (error) {
      if (error instanceof OutOfTime) throw error;
      problems.push({ step: `${ref} spreadsheet`, message: `${url}: ${error instanceof Error ? error.message : error}` });
    }
  }
  return { ref, title, edited, passages, spreadsheets };
}

// ---- The run ----------------------------------------------------------------------------------

async function embedMissing(deps: RefreshDeps, outOfTime: () => boolean, problems: Problem[]): Promise<number> {
  if (!deps.embed) return 0;
  let done = 0;
  while (!outOfTime()) {
    const todo = await passagesToEmbed(deps.db, EMBED_BATCH);
    if (!todo.length) break;
    try {
      const embeddings = await deps.embed(todo.map((p) => `${p.heading}\n\n${p.text}`));
      await saveEmbeddings(deps.db, todo.map((p, i) => ({ id: p.id, embedding: embeddings[i], model: VOYAGE_MODEL })));
      done += todo.length;
    } catch (error) {
      problems.push({ step: "embedding", message: error instanceof Error ? error.message : String(error) });
      break;
    }
  }
  return done;
}

/** Keeps BM25 search honest after new passages: rebuild the index and refresh the statistics, as `library:load` does. */
async function refreshStatistics(db: Executor): Promise<void> {
  if ((await keywordRanking(db)) !== "bm25") return;
  await db.execute(sql`reindex index library_passages_bm25`);
  await db.execute(sql`vacuum (analyze) library_passages`);
}

/**
 * One weekly refresh. Takes the lock, asks Blogger for the posts changed since the last run, works
 * through the oldest few within the time budget, embeds what is new, refreshes the keyword
 * statistics and writes the log. A post that fails is logged and retried next week; the watermark
 * never moves past it.
 */
export async function refreshLibrary(deps: RefreshDeps): Promise<RefreshResult> {
  const clock = deps.now ?? (() => new Date());
  const startedAt = clock();
  const budget = deps.budgetMs ?? REFRESH_BUDGET_MS;
  const elapsed = () => clock().getTime() - startedAt.getTime();
  const noNewWork = () => elapsed() >= budget - RESERVE_MS;
  const noTimeLeft = () => elapsed() >= budget;
  const doFetch = deps.fetch ?? fetch;

  const run = await startRun(deps.db, startedAt);
  if (!run) return { status: "locked" };

  const added: AddedPost[] = [];
  const problems: Problem[] = [];
  try {
    const since = run.watermark ?? new Date(startedAt.getTime() - FIRST_LOOKBACK_DAYS * 86_400_000).toISOString();
    const url = `${FEED}?alt=json&orderby=updated&max-results=100&updated-min=${encodeURIComponent(since)}`;
    const res = await doFetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Blogger's feed answered HTTP ${res.status}`);
    const page = await res.json();
    const raw = ((page as { feed?: { entry?: unknown[] } }).feed?.entry ?? []) as unknown[];
    const parsed = bloggerFeed.parse(page).feed.entry;
    const entries: Entry[] = await unrecordedEntries(
      deps.db,
      BLOG_SOURCE,
      parsed
        .map((e, i) => ({ raw: raw[i], ref: refOf(e.id.$t), updatedAt: e.updated?.$t ?? e.published.$t }))
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()),
    );

    const maxPosts = deps.maxPosts ?? MAX_POSTS_PER_RUN;
    let handled = 0;
    let firstFailure: Entry | undefined;
    let lastGood: Entry | undefined;
    let stopped = false;
    for (const entry of entries.slice(0, maxPosts)) {
      if (noNewWork()) {
        stopped = true;
        break;
      }
      handled++;
      try {
        added.push(await processPost(entry, deps, noNewWork, problems));
        if (!firstFailure) lastGood = entry;
      } catch (error) {
        firstFailure ??= entry;
        if (error instanceof OutOfTime) {
          problems.push({ step: `${entry.ref}`, message: "Out of time: left for the next run." });
          stopped = true;
          break;
        }
        problems.push({ step: entry.ref, message: error instanceof Error ? error.message : String(error) });
      }
    }

    const moreToDo = stopped || entries.length > handled;
    let embedded = 0;
    if (added.length) {
      embedded = await embedMissing(deps, noTimeLeft, problems);
      if (!deps.embed) problems.push({ step: "embedding", message: "No Voyage key is set: the new passages are keyword-only until they are embedded." });
      if (!noTimeLeft()) {
        // The posts are already in: a failing reindex or vacuum must not throw the run's progress away.
        try {
          await refreshStatistics(deps.db);
        } catch (error) {
          problems.push({ step: "statistics", message: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    // Where the next run starts: at the first post that failed or was not reached (a failed one is asked for again),
    // just after the last one done, or, with nothing left, at this run's start.
    const watermark = firstFailure
      ? new Date(firstFailure.updatedAt).toISOString()
      : moreToDo && lastGood
        ? new Date(new Date(lastGood.updatedAt).getTime() + 1).toISOString()
        : moreToDo
          ? since
          : startedAt.toISOString();
    await finishRun(deps.db, run.id, { status: "done", at: clock(), watermark, added, failed: problems, note: moreToDo ? "More posts are waiting for the next run." : undefined });
    return { status: "done", runId: run.id, added, failed: problems, watermark, moreToDo, embedded };
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    await finishRun(deps.db, run.id, { status: "failed", at: clock(), added, failed: problems, note });
    return { status: "failed", runId: run.id, note };
  }
}
