import { asc, eq } from "drizzle-orm";
import { libraryPassages } from "@/db/schema";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { importLibrary, importLibraryDocument, passagesToEmbed, saveEmbeddings, type LibraryFile } from "./ingest";

const source: LibraryFile["source"] = {
  id: "a-blog",
  title: "A blog",
  kind: "dated",
  licence: "All rights reserved; short quotes with credit",
  licenceUrl: "https://example.org/terms",
  credit: "A. Writer, A blog",
  url: "https://example.org/blog",
  fetchedOn: "2026-11-02",
  quoteWords: 60,
};

const passage = (post: number, n: number, text: string) => ({ ref: `post-${post}#${n}`, heading: `Post ${post}`, url: `https://example.org/blog/${post}`, publishedOn: "2018-10-20", text });

async function rowsOf(db: Db) {
  const rows = await db.select({ ref: libraryPassages.ref, text: libraryPassages.text, embedding: libraryPassages.embedding }).from(libraryPassages).where(eq(libraryPassages.sourceId, "a-blog")).orderBy(asc(libraryPassages.ref));
  return rows.map((r) => ({ ref: r.ref, text: r.text, embedded: r.embedding !== null }));
}

async function embedAll(db: Db) {
  const todo = await passagesToEmbed(db, 100);
  await saveEmbeddings(db, todo.map((p) => ({ id: p.id, embedding: Array.from({ length: 1024 }, () => 0.01), model: "test" })));
}

describe("importing one document", () => {
  it("replaces only that post's passages, and keeps the embedding of text that did not change", async () => {
    const db = await testDb();
    await importLibrary(db, { source, passages: [passage(1, 1, "One A."), passage(1, 2, "One B."), passage(2, 1, "Two."), passage(12, 1, "Twelve.")] });
    await embedAll(db);

    const result = await importLibraryDocument(db, {
      source,
      document: "post-1",
      passages: [passage(1, 1, "One A."), passage(1, 2, "One B edited."), passage(1, 3, "One C.")],
    });

    expect(result).toEqual({ passages: 3, removed: 0 });
    expect(await rowsOf(db)).toEqual([
      { ref: "post-1#1", text: "One A.", embedded: true },
      { ref: "post-1#2", text: "One B edited.", embedded: false },
      { ref: "post-1#3", text: "One C.", embedded: false },
      { ref: "post-12#1", text: "Twelve.", embedded: true },
      { ref: "post-2#1", text: "Two.", embedded: true },
    ]);
  });

  it("removes passages the post no longer has, and all of them when the post is now empty, leaving other posts alone", async () => {
    const db = await testDb();
    await importLibrary(db, { source, passages: [passage(1, 1, "One A."), passage(1, 2, "One B."), passage(12, 1, "Twelve.")] });

    const shrunk = await importLibraryDocument(db, { source, document: "post-1", passages: [passage(1, 1, "One A.")] });
    const emptied = await importLibraryDocument(db, { source, document: "post-1", passages: [] });

    expect(shrunk).toEqual({ passages: 1, removed: 1 });
    expect(emptied).toEqual({ passages: 0, removed: 1 });
    expect((await rowsOf(db)).map((r) => r.ref)).toEqual(["post-12#1"]);
  });

  it("refuses passages from another document, and still refuses a source the Library keeps out", async () => {
    const db = await testDb();

    await expect(importLibraryDocument(db, { source, document: "post-1", passages: [passage(2, 1, "Two.")] })).rejects.toThrow(/belong to document post-1/);
    await expect(importLibraryDocument(db, { source: { ...source, id: "investopedia", title: "Investopedia" }, document: "post-1", passages: [passage(1, 1, "x")] })).rejects.toThrow(
      /not allowed in the Library/,
    );
  });
});
