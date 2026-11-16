import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { importLibrary, type LibraryFile } from "./ingest";
import { restampLibrary } from "./restamp";
import { rowsOf } from "./search";

const lectures: LibraryFile = {
  source: {
    id: "a-course",
    title: "A course",
    kind: "timeless",
    licence: "CC BY-NC-SA 3.0",
    licenceUrl: "https://example.org/old-terms",
    credit: "C. Teacher, A course (2011)",
    url: "https://example.org/course",
    fetchedOn: "2026-11-02",
  },
  passages: [
    { ref: "l1", heading: "Lecture 1 (2011)", url: "https://example.org/course/1", text: "In 1987 the market fell 22.6% in a day." },
    { ref: "l2", heading: "Lecture 2 (2011)", url: "https://example.org/course/2", text: "Bonds pay coupons." },
    { ref: "l3", heading: "Lecture 3", url: "https://example.org/course/3", text: "A quoted chart.", licence: "Third-party chart, used by permission", credit: "D. Charter" },
  ],
};

const updated = { ...lectures.source, licenceUrl: "https://example.org/terms", credit: "C. Teacher, A course (Accessed November 2, 2026). License: CC BY-NC-SA" };

async function staleDb(): Promise<Db> {
  const db = await testDb();
  await importLibrary(db, lectures);
  // As an older load stored them: the heading's year counted.
  await db.execute(sql`update library_passages set latest_year = 2011 where ref in ('l1', 'l2')`);
  return db;
}

const stored = (db: Db) =>
  rowsOf<{ ref: string; credit: string; licence: string; latest_year: number | null }>(db, sql`select ref, credit, licence, latest_year from library_passages order by ref`);

describe("re-stamping the stored Library (#25, #26)", () => {
  it("dry run counts what would change and writes nothing", async () => {
    const db = await staleDb();
    const before = await stored(db);

    const result = await restampLibrary(db, [updated], { write: false });

    expect(result).toEqual({ sources: ["a-course"], credits: { "a-course": 2 }, years: { "a-course": 2 } });
    expect(await stored(db)).toEqual(before);
  });

  it("re-dates passages from their text, brings the source and the passages that carried its old credit up to date, keeps a passage's own credit, and is idempotent", async () => {
    const db = await staleDb();

    await restampLibrary(db, [updated], { write: true });

    expect(await stored(db)).toEqual([
      { ref: "l1", credit: updated.credit, licence: "CC BY-NC-SA 3.0", latest_year: 1987 },
      { ref: "l2", credit: updated.credit, licence: "CC BY-NC-SA 3.0", latest_year: null },
      { ref: "l3", credit: "D. Charter", licence: "Third-party chart, used by permission", latest_year: null },
    ]);
    expect(await rowsOf(db, sql`select licence_url as "licenceUrl", credit from library_sources where id = 'a-course'`)).toEqual([{ licenceUrl: updated.licenceUrl, credit: updated.credit }]);
    expect(await restampLibrary(db, [updated], { write: true })).toEqual({ sources: [], credits: {}, years: {} });
  });

  it("skips a source the database does not hold", async () => {
    const db = await staleDb();

    const result = await restampLibrary(db, [{ ...updated, id: "not-loaded" }], { write: true });

    expect(result.sources).toEqual([]);
    expect(result.credits).toEqual({});
    expect(await rowsOf(db, sql`select id from library_sources order by id`)).toEqual([{ id: "a-course" }]);
  });
});
