import { describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import type { Db } from "@/db/types";
import { saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { importLibrary, passagesToEmbed, saveEmbeddings, type LibraryFile } from "./ingest";
import { loadPassageView, NO_VOYAGE_KEY, searchLibrary, searchResultText, VOYAGE_DOWN } from "./library";

const map = parseCourseMap([
  {
    name: "pv.yaml",
    text: `
id: pv
title: PV
stage: foundation
path: 1
cases:
  - { id: jackpot, title: A jackpot, asOf: 2018-10-24, story: Then., reveal: Later. }
concept: Idea.
principle: Lesson.
checks:
  - { id: pv-check, kind: conversation, prompt: Explain., passCriteria: Explains. }
`,
  },
]).map!;

const blog: LibraryFile = {
  source: {
    id: "a-blog",
    title: "A blog",
    kind: "dated",
    licence: "All rights reserved; short quotes with credit",
    licenceUrl: "https://example.org/terms",
    credit: "A. Writer, A blog",
    url: "https://example.org/blog",
    fetchedOn: "2026-11-02",
  },
  passages: [
    { ref: "before", heading: "Lottery annuities", url: "https://example.org/blog/1", publishedOn: "2018-10-20", text: "The jackpot annuity pays thirty graduated instalments; discount them to compare with the cash option." },
    { ref: "after", heading: "The jackpot winner", url: "https://example.org/blog/2", publishedOn: "2019-03-05", text: "The jackpot winner took the cash option rather than the annuity." },
  ],
};

const book: LibraryFile = {
  source: {
    id: "a-book",
    title: "A textbook",
    kind: "timeless",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    credit: "B. Author, A textbook (Publisher, 2022), CC BY 4.0",
    url: "https://example.org/book",
    fetchedOn: "2026-11-02",
  },
  passages: [{ ref: "ch1", heading: "Annuities", url: "https://example.org/book/1", publishedOn: "2022-01-01", text: "An annuity is a series of equal payments; its present value discounts each jackpot instalment." }],
};

async function libraryDb(): Promise<Db> {
  const db = await testDb();
  await importLibrary(db, blog);
  await importLibrary(db, book);
  return db;
}

async function passRevealOf(db: Db) {
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
  await saveCheckResult(db, map, { checkId: "pv-check", passed: true, evidence: "Explained.", model: "m", toolCallId: "t1" });
  await saveFinishedStep(db, map, "reveal");
}

describe("Library search", () => {
  it("before the reveal returns no dated passage from after the Case's as-of date, but keeps earlier and timeless passages", async () => {
    const db = await libraryDb();

    const found = await searchLibrary({ db, map }, "jackpot cash option annuity");

    expect(found.asOf).toBe("2018-10-24");
    expect(found.results.map((r) => r.ref).sort()).toEqual(["before", "ch1"]);
  });

  it("before the reveal also hides a timeless passage that mentions a year after the as-of date, since reference text can tell an ending", async () => {
    const db = await libraryDb();
    await importLibrary(db, {
      ...book,
      passages: [
        ...book.passages,
        { ref: "ch2", heading: "Lottery payouts", url: "https://example.org/book/2", text: "In 2019 the jackpot annuity winner chose the cash option." },
        { ref: "ch3", heading: "Older jackpots", url: "https://example.org/book/3", text: "In 2016 a jackpot annuity was declined for the cash option." },
      ],
    });

    const before = await searchLibrary({ db, map }, "jackpot cash option annuity");
    await passRevealOf(db);
    const after = await searchLibrary({ db, map }, "jackpot cash option annuity");

    expect(before.results.map((r) => r.ref)).not.toContain("ch2");
    expect(before.results.map((r) => r.ref)).toContain("ch3");
    expect(after.results.map((r) => r.ref)).toContain("ch2");
  });

  it("after the reveal returns dated passages from after the as-of date too", async () => {
    const db = await libraryDb();
    await passRevealOf(db);

    const found = await searchLibrary({ db, map }, "jackpot cash option annuity");

    expect(found.asOf).toBeNull();
    expect(found.results.map((r) => r.ref)).toContain("after");
  });

  /** A 1024-dimension vector pointing mostly along one axis, standing in for a Voyage embedding. */
  const axis = (i: number, wobble = 0) => Array.from({ length: 1024 }, (_, j) => (j === i ? 1 : j === i + 1 ? wobble : 0));

  async function embedAll(db: Db, vectors: Record<string, number[]>) {
    const todo = await passagesToEmbed(db, 100);
    await saveEmbeddings(db, todo.map((p) => ({ id: p.id, embedding: vectors[p.ref], model: "voyage-4" })));
  }

  it("combines keyword and vector results in SQL: a passage sharing no word with the query is found by its embedding", async () => {
    const db = await libraryDb();
    await embedAll(db, { before: axis(1), after: axis(2), ch1: axis(3) });

    const found = await searchLibrary({ db, map, embedQuery: async () => axis(3, 0.1) }, "lump sum");

    expect(found.mode).toBe("combined");
    expect(found.fallback).toBeNull();
    expect(found.results[0].ref).toBe("ch1");
  });

  it("applies the as-of rule to vector results too", async () => {
    const db = await libraryDb();
    await embedAll(db, { before: axis(1), after: axis(2), ch1: axis(3) });

    const found = await searchLibrary({ db, map, embedQuery: async () => axis(2) }, "who won");

    expect(found.results.map((r) => r.ref)).not.toContain("after");
  });

  it("falls back to keyword results when Voyage fails, and says so", async () => {
    const db = await libraryDb();
    await embedAll(db, { before: axis(1), after: axis(2), ch1: axis(3) });
    const down = async (): Promise<number[]> => {
      throw new Error("503 Service Unavailable");
    };

    const found = await searchLibrary({ db, map, embedQuery: down }, "annuity instalment");

    expect(found.mode).toBe("keyword");
    expect(found.fallback).toBe(VOYAGE_DOWN);
    expect(found.results.map((r) => r.ref).sort()).toEqual(["before", "ch1"]);
  });

  it("without a Voyage key searches keywords only and says so", async () => {
    const found = await searchLibrary({ db: await libraryDb(), map }, "annuity");

    expect(found.mode).toBe("keyword");
    expect(found.fallback).toBe(NO_VOYAGE_KEY);
  });

  it("each result carries its source, licence, credit and publication date", async () => {
    const found = await searchLibrary({ db: await libraryDb(), map }, "annuity present value");

    expect(found.results.find((r) => r.ref === "ch1")).toMatchObject({
      sourceTitle: "A textbook",
      kind: "timeless",
      licence: "CC BY 4.0",
      credit: "B. Author, A textbook (Publisher, 2022), CC BY 4.0",
      publishedOn: "2022-01-01",
      url: "https://example.org/book/1",
    });
  });
});

describe("scoping a search to one source or writer", () => {
  it("returns only passages from sources whose id, title or credit match, whatever the query's other words", async () => {
    const db = await libraryDb();

    const found = await searchLibrary({ db, map }, "jackpot annuity", { source: "a. writer" });

    expect(found.results.map((r) => r.sourceId)).toEqual(["a-blog"]);
    expect(found.source).toBe("a. writer");
  });

  it("matches a source by its title too, and treats % and _ as plain characters", async () => {
    const db = await libraryDb();

    expect((await searchLibrary({ db, map }, "annuity", { source: "textbook" })).results.map((r) => r.ref)).toEqual(["ch1"]);
    expect((await searchLibrary({ db, map }, "annuity", { source: "%" })).results).toEqual([]);
  });

  it("still applies the as-of rule inside the scope", async () => {
    const db = await libraryDb();

    const found = await searchLibrary({ db, map }, "jackpot winner cash option", { source: "blog" });

    expect(found.results.map((r) => r.ref)).toEqual(["before"]);
  });

  it("tells the Tutor which sources exist when none matches the name", async () => {
    const found = await searchLibrary({ db: await libraryDb(), map }, "annuity", { source: "Nobody" });
    const text = searchResultText(found);

    expect(found.results).toEqual([]);
    expect(text).toContain('No Library source matches "Nobody"');
    expect(text).toContain("A blog");
    expect(text).toContain("A textbook");
  });
});

describe("sources kept out of the Library", () => {
  const as = (source: Partial<LibraryFile["source"]>): LibraryFile => ({ ...blog, source: { ...blog.source, ...source } });

  it.each([
    ["Buffett's letters", { id: "buffett-letters", title: "Berkshire shareholder letters", url: "https://www.berkshirehathaway.com/letters/letters.html" }],
    ["Zitron's articles", { id: "wheres-your-ed-at", title: "Where's Your Ed At", url: "https://www.wheresyoured.at/" }],
    ["the CNBC Buffett Archive", { id: "cnbc-archive", title: "CNBC Warren Buffett Archive", url: "https://buffett.cnbc.com/" }],
    ["Investopedia", { id: "investopedia", title: "Investopedia", url: "https://www.investopedia.com/terms/b/bond.asp" }],
    ["YouTube transcripts", { id: "lectures", title: "A lecture", url: "https://www.youtube.com/watch?v=abc" }],
    ["RBI primers, until RBI allows storing", { id: "rbi-primer", title: "RBI primer", url: "https://www.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=711" }],
  ])("refuses %s", async (_name, source) => {
    await expect(importLibrary(await testDb(), as(source))).rejects.toThrow(/not allowed in the Library/);
  });

  it("every source the load script knows is allowed", async () => {
    const { readFileSync } = await import("node:fs");
    const sources = JSON.parse(readFileSync("scripts/library/sources.json", "utf8")) as { id: string; kind: string }[];
    const { isBlockedSource } = await import("./ingest");

    expect(sources.length).toBeGreaterThan(1);
    expect(sources.filter((s) => isBlockedSource(s as never))).toEqual([]);
  });
});

describe("short quotes only", () => {
  it("tells the Tutor how many words it may quote from a source with a quote limit, and says nothing for one without", async () => {
    const db = await testDb();
    await importLibrary(db, { ...blog, source: { ...blog.source, quoteWords: 40 } });
    await importLibrary(db, book);

    const found = await searchLibrary({ db, map }, "jackpot annuity instalments");
    const text = searchResultText(found);

    expect(found.results.find((r) => r.ref === "before")?.quoteWords).toBe(40);
    expect(found.results.find((r) => r.ref === "ch1")?.quoteWords).toBeNull();
    expect(text).toMatch(/Quote at most 40 words from "A blog"/);
    expect(text.match(/Quote at most/g)).toHaveLength(1);
  });
});

describe("passage view (where a citation leads)", () => {
  async function idOf(db: Db, ref: string): Promise<number> {
    const found = await searchLibrary({ db, map }, "jackpot cash option annuity instalments");
    const hit = found.results.find((r) => r.ref === ref);
    if (hit) return hit.id;
    await passRevealOf(db);
    return (await searchLibrary({ db, map }, "jackpot cash option annuity instalments")).results.find((r) => r.ref === ref)!.id;
  }

  it("shows a passage with no quote limit in full, with its credit, licence, date and link, and marks the cited sentences", async () => {
    const db = await testDb();
    await importLibrary(db, {
      ...book,
      passages: [{ ref: "ch1", heading: "Annuities", url: "https://example.org/book/1", text: "An annuity is a series of equal payments. Its present value discounts each jackpot instalment." }],
    });
    const id = await idOf(db, "ch1");

    const view = await loadPassageView({ db, map }, id, { from: 2, to: 3 });

    expect(view).toMatchObject({
      status: "shown",
      heading: "Annuities",
      credit: "B. Author, A textbook (Publisher, 2022), CC BY 4.0",
      licence: "CC BY 4.0",
      url: "https://example.org/book/1",
      publishedOn: null,
      shortened: false,
    });
    if (view.status !== "shown") throw new Error("not shown");
    expect(view.sentences).toEqual([
      { text: "An annuity is a series of equal payments. ", cited: false },
      { text: "Its present value discounts each jackpot instalment.", cited: true },
    ]);
  });

  it("for a source with a quote limit shows only the cited sentences, cut to that many words, and points to the original", async () => {
    const db = await testDb();
    await importLibrary(db, {
      ...blog,
      source: { ...blog.source, quoteWords: 5 },
      passages: [{ ref: "before", heading: "Lottery annuities", url: "https://example.org/blog/1", publishedOn: "2018-10-20", text: "First sentence here. The jackpot annuity pays thirty graduated instalments over many years. Last one." }],
    });
    const id = await idOf(db, "before");

    const view = await loadPassageView({ db, map }, id, { from: 2, to: 3 });

    if (view.status !== "shown") throw new Error("not shown");
    expect(view.quoteWords).toBe(5);
    expect(view.shortened).toBe(true);
    expect(view.sentences).toEqual([{ text: "The jackpot annuity pays thirty …", cited: true }]);
    expect(view.url).toBe("https://example.org/blog/1");
  });

  it("hides a dated passage published after the as-of date while the Case is before its reveal, and shows it after", async () => {
    const db = await libraryDb();
    const id = await idOf(db, "after");
    // idOf passed the reveal to find it; start again before the reveal.
    const fresh = await libraryDb();

    expect(await loadPassageView({ db: fresh, map }, id)).toEqual({ status: "hidden", asOf: "2018-10-24" });
    expect((await loadPassageView({ db, map }, id)).status).toBe("shown");
  });

  it("says a passage that does not exist is missing", async () => {
    expect(await loadPassageView({ db: await testDb(), map }, 999)).toEqual({ status: "missing" });
  });
});
