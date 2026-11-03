import { sql } from "drizzle-orm";
import type { Executor } from "./ingest.ts";
import type { PictureReading, PictureReadings } from "./pictures.ts";

// The stored side of the Library's picture and document records (tables library_pictures and
// library_documents). A picture is read by the model once, ever: the reading is kept by the picture's
// original-size address, so the weekly refresh (which starts with nothing on disk) pays for it only
// once and an edited post gets the very same words back. Packages and relative imports only, so the
// laptop scripts can use it too.

async function rowsOf<T>(db: Executor, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as { rows?: T[] } | T[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

/** The readings already stored for these picture addresses. */
export async function loadReadings(db: Executor, urls: string[]): Promise<PictureReadings> {
  const unique = [...new Set(urls)];
  if (!unique.length) return {};
  const rows = await rowsOf<{ url: string; text: string | null; model: string; stop_reason: string | null; problems: string[] }>(
    db,
    sql`select url, text, model, stop_reason, problems from library_pictures where url in (${sql.join(unique.map((u) => sql`${u}`), sql`, `)})`,
  );
  return Object.fromEntries(rows.map((r) => [r.url, { text: r.text, model: r.model, stopReason: r.stop_reason, problems: r.problems ?? [] } satisfies PictureReading]));
}

/**
 * Stores a picture's reading. An address already stored keeps its first reading (a second reading
 * would not be word for word the same), unless that reading was cut off by the length limit: a
 * complete reading then replaces it.
 */
export async function saveReading(db: Executor, url: string, reading: PictureReading): Promise<void> {
  await db.execute(sql`
    insert into library_pictures (url, text, model, stop_reason, problems)
    values (${url}, ${reading.text}, ${reading.model}, ${reading.stopReason}, ${JSON.stringify(reading.problems)}::jsonb)
    on conflict (url) do update set text = excluded.text, model = excluded.model, stop_reason = excluded.stop_reason,
      problems = excluded.problems, read_at = now()
      where library_pictures.stop_reason = 'max_tokens'`);
}

/** Notes a document's published and updated times, as the weekly refresh and the backfill saw them. */
export async function recordDocument(db: Executor, sourceId: string, ref: string, publishedAt: string | null, updatedAt: string | null): Promise<void> {
  await db.execute(sql`
    insert into library_documents (source_id, ref, published_at, updated_at)
    values (${sourceId}, ${ref}, ${publishedAt}::timestamptz, ${updatedAt}::timestamptz)
    on conflict (source_id, ref) do update set published_at = excluded.published_at, updated_at = excluded.updated_at, recorded_at = now()`);
}
