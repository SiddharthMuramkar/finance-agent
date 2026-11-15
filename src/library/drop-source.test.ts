import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { dropSource, sourceCounts } from "./drop-source";
import { importLibrary, type LibraryFile } from "./ingest";
import { rowsOf } from "./search";

const book = (id: string): LibraryFile => ({
  source: {
    id,
    title: `Book ${id}`,
    kind: "timeless",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    credit: `A. Author, Book ${id}, CC BY 4.0`,
    url: `https://example.org/${id}`,
    fetchedOn: "2026-11-15",
  },
  passages: [
    { ref: "m1#1", heading: "Present value", url: `https://example.org/${id}/m1`, text: "A dollar today is worth more than a dollar next year." },
    { ref: "m2#1", heading: "Bonds", url: `https://example.org/${id}/m2`, text: "A bond pays coupons and returns its face value." },
  ],
});

/** Two editions loaded, each with one library_documents row. */
async function twoEditions(): Promise<Db> {
  const db = await testDb();
  for (const id of ["book-2e", "book-1e"]) {
    await importLibrary(db, book(id));
    await db.execute(sql`insert into library_documents (source_id, ref, published_at) values (${id}, 'm1', '2025-12-04T00:00:00Z')`);
  }
  return db;
}

const held = (db: Db) =>
  rowsOf<{ id: string; passages: number; documents: number }>(
    db,
    sql`select s.id, (select count(*)::integer from library_passages p where p.source_id = s.id) as passages,
               (select count(*)::integer from library_documents d where d.source_id = s.id) as documents
        from library_sources s order by s.id`,
  );

describe("dropping a Library source (#38)", () => {
  it("dry run counts the source's passages and documents and deletes nothing", async () => {
    const db = await twoEditions();
    const before = await held(db);

    expect(await dropSource(db, "book-2e", { apply: false })).toEqual({ passages: 2, documents: 1 });
    expect(await held(db)).toEqual(before);
  });

  it("with apply, deletes the source's passages, documents and source row, and leaves the other source whole", async () => {
    const db = await twoEditions();

    expect(await dropSource(db, "book-2e", { apply: true })).toEqual({ passages: 2, documents: 1 });

    expect(await held(db)).toEqual([{ id: "book-1e", passages: 2, documents: 1 }]);
    expect(await sourceCounts(db, "book-2e")).toBeNull();
  });

  it("refuses a source the database does not hold", async () => {
    const db = await twoEditions();

    await expect(dropSource(db, "book-3e", { apply: false })).rejects.toThrow(/no Library source "book-3e"/);
    await expect(dropSource(db, "book-3e", { apply: true })).rejects.toThrow(/no Library source "book-3e"/);
    expect((await held(db)).map((s) => s.id)).toEqual(["book-1e", "book-2e"]);
  });

  it("runs in one transaction: when the last delete fails, the passages and documents are still there", async () => {
    const db = await twoEditions();
    // Something else still points at the source row, so deleting it fails after the passages and documents went.
    await db.execute(sql`create table pinned (source_id text not null references library_sources (id))`);
    await db.execute(sql`insert into pinned values ('book-2e')`);
    const before = await held(db);

    await expect(dropSource(db, "book-2e", { apply: true })).rejects.toThrow();

    expect(await held(db)).toEqual(before);
  });
});
