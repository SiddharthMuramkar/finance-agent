import { sql } from "drizzle-orm";
import type { Executor } from "./ingest.ts";
import { rowsOf } from "./search.ts";

// Packages and .ts-suffixed relative imports only, so scripts/library/drop-source.mjs runs it from the laptop.

/** A database that can run interactive transactions (the Neon WebSocket pool, or PGlite in tests). */
export type TransactionalDb = Executor & { transaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> };

/** What a source holds in the database: its passages and its library_documents rows. */
export type SourceCounts = { passages: number; documents: number };

/** What a source holds, or null when the database has no such source. */
export async function sourceCounts(db: Executor, sourceId: string): Promise<SourceCounts | null> {
  const [row] = await rowsOf<SourceCounts>(
    db,
    sql`select (select count(*)::integer from library_passages where source_id = s.id) as passages,
               (select count(*)::integer from library_documents where source_id = s.id) as documents
        from library_sources s where s.id = ${sourceId}`,
  );
  return row ?? null;
}

/**
 * Removes one Library source (#38: OpenStax 2e, once its CC BY 1e replacement is loaded). With
 * `apply` false it only counts. With `apply` true it deletes the source's passages, then its
 * library_documents rows, then the library_sources row, in one transaction, and returns what it
 * deleted: a failure part-way leaves everything in place. Throws when the database has no such source.
 */
export async function dropSource(db: TransactionalDb, sourceId: string, { apply }: { apply: boolean }): Promise<SourceCounts> {
  const counts = await sourceCounts(db, sourceId);
  if (!counts) throw new Error(`the database has no Library source "${sourceId}"`);
  if (!apply) return counts;
  return db.transaction(async (tx) => {
    const passages = await rowsOf<{ id: number }>(tx, sql`delete from library_passages where source_id = ${sourceId} returning id`);
    const documents = await rowsOf<{ ref: string }>(tx, sql`delete from library_documents where source_id = ${sourceId} returning ref`);
    const source = await rowsOf<{ id: string }>(tx, sql`delete from library_sources where id = ${sourceId} returning id`);
    // Another run dropped it between the count and now: nothing here to remove.
    if (!source.length) throw new Error(`the database has no Library source "${sourceId}"`);
    return { passages: passages.length, documents: documents.length };
  });
}
