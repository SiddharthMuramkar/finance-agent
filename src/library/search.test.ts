import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { importLibrary, type LibraryFile } from "./ingest";
import { searchPassages } from "./search";

// Source diversity in the Library search (#38): unscoped, no source fills the top 5 (at most 2 documents
// each, 1 for an archival source such as FOMC records or SEC filings) and no document gets two places (a
// ref's part before "#" is its document); scoped to a source, the order is the fused one. The text repeats
// "federal funds rate" n times, so keyword rank follows n (PGlite: full-text).
const source = (id: string, title: string, kind: "dated" | "timeless", passages: [string, number][]): LibraryFile => ({
  source: {
    id,
    title,
    kind,
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    credit: `${title}, CC BY 4.0`,
    url: `https://example.org/${id}`,
    fetchedOn: "2026-11-15",
  },
  passages: passages.map(([ref, n]) => ({
    ref,
    heading: ref,
    url: `https://example.org/${id}/${ref}`,
    publishedOn: "1994-02-04",
    text: `${Array.from({ length: n }, () => "The federal funds rate moved.").join(" ")} Other words.`,
  })),
});

async function libraryDb(): Promise<Db> {
  const db = await testDb();
  await importLibrary(db, source("fomc-records", "Committee records", "dated", [["f1", 8], ["f2", 7], ["f3", 6]]));
  await importLibrary(db, source("lectures", "Some lectures", "timeless", [["l1", 5], ["l2", 4], ["l3", 3]]));
  await importLibrary(db, source("explainers", "Bank explainers", "timeless", [["n1", 2]]));
  await importLibrary(db, source("a-book", "A textbook", "timeless", [["b1", 1]]));
  return db;
}

const refs = async (db: Db, q: { source?: string; limit?: number }) =>
  (await searchPassages(db, { query: "federal funds rate", asOf: null, ranking: "full-text", ...q })).map((r) => r.ref);

describe("source diversity in the Library search", () => {
  it("unscoped, keeps the fused order but lets no source fill the top 5: two passages a source, one an archival source", async () => {
    const db = await libraryDb();

    // Fused order: f1 f2 f3 l1 l2 l3 n1 b1. Without the cap the top 5 would be three Committee records and two lectures.
    expect(await refs(db, {})).toEqual(["f1", "l1", "l2", "n1", "b1"]);
  });

  it("puts a source's further passages after every source's best ones, in fused order", async () => {
    expect(await refs(await libraryDb(), { limit: 10 })).toEqual(["f1", "l1", "l2", "n1", "b1", "f2", "f3", "l3"]);
  });

  it("counts a source whose id starts with sec- as archival too, so one filing leads", async () => {
    const db = await testDb();
    await importLibrary(db, source("sec-filings", "Some filings", "dated", [["10-k-1#1", 4], ["10-k-1#2", 3], ["10-q-2#1", 2]]));
    await importLibrary(db, source("a-book", "A textbook", "timeless", [["b1", 1]]));

    // Fused order: 10-k-1#1 10-k-1#2 10-q-2#1 b1. Teaching text would lead with both filings, b1 third.
    expect(await refs(db, {})).toEqual(["10-k-1#1", "b1", "10-k-1#2", "10-q-2#1"]);
  });

  it("scoped to a source, keeps the fused order", async () => {
    const db = await libraryDb();

    expect(await refs(db, { source: "fomc" })).toEqual(["f1", "f2", "f3"]);
    expect(await refs(db, { source: "lectures" })).toEqual(["l1", "l2", "l3"]);
  });
});

// Two chapters' and a lecture's passages ("<document>#<n>"), so one document has several candidates.
async function documentsDb(): Promise<Db> {
  const db = await testDb();
  await importLibrary(db, source("a-book", "A textbook", "timeless", [["ch1#1", 9], ["ch1#2", 8], ["ch2#1", 7], ["ch3#1", 6]]));
  await importLibrary(db, source("lectures", "Some lectures", "timeless", [["lec1#1", 5], ["lec1#2", 4], ["lec2#1", 3]]));
  await importLibrary(db, source("fomc-records", "Committee records", "dated", [["mtg1#1", 2], ["mtg2#1", 1]]));
  return db;
}

describe("document diversity in the Library search", () => {
  it("unscoped, gives a document one place in the top 5, and counts a source's two places in documents", async () => {
    // Fused order: ch1#1 ch1#2 ch2#1 ch3#1 lec1#1 lec1#2 lec2#1 mtg1#1 mtg2#1. Capped by source alone, the top 5
    // would hold ch1 twice and lec1 twice; counted in passages, ch1's second passage would take the book's second place.
    expect(await refs(await documentsDb(), {})).toEqual(["ch1#1", "ch2#1", "lec1#1", "lec2#1", "mtg1#1"]);
  });

  it("puts a document's further passages after every document's best one, in fused order", async () => {
    expect(await refs(await documentsDb(), { limit: 10 })).toEqual(["ch1#1", "ch2#1", "lec1#1", "lec2#1", "mtg1#1", "ch1#2", "ch3#1", "lec1#2", "mtg2#1"]);
  });

  it("scoped to a source, keeps the fused order, a document's passages together", async () => {
    expect(await refs(await documentsDb(), { source: "a-book" })).toEqual(["ch1#1", "ch1#2", "ch2#1", "ch3#1"]);
  });
});
