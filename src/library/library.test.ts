import { describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import type { Db } from "@/db/types";
import { saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { importLibrary, passagesToEmbed, saveEmbeddings, type LibraryFile } from "./ingest";
import { NO_VOYAGE_KEY, searchLibrary, VOYAGE_DOWN } from "./library";

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
