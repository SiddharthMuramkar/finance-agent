import { describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { importLibrary, type LibraryFile } from "./ingest";
import { loadPassageView, searchLibrary, searchResultBlocks, searchResultText } from "./library";
import { MACHINE_READ_NOTE } from "./pictures";

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

const pictureBlog: LibraryFile = {
  source: {
    id: "a-blog",
    title: "A blog",
    kind: "dated",
    licence: "All rights reserved; short quotes with credit",
    licenceUrl: "https://example.org/terms",
    credit: "A. Writer, A blog",
    url: "https://example.org/blog",
    fetchedOn: "2026-11-03",
  },
  passages: [
    { ref: "p1", heading: "Tesla", url: "https://example.org/blog/1", publishedOn: "2018-10-20", text: "[picture] Tesla inputs\n\n[picture] Revenue growth | 25%. The jackpot table." },
    { ref: "p2", heading: "Plain", url: "https://example.org/blog/2", publishedOn: "2018-10-20", text: "The annuity discount is plain prose." },
  ],
};

describe("picture text marked as machine-read", () => {
  it("adds the note to the first result's credit block when a result holds picture text, and not otherwise", async () => {
    const db = await testDb();
    await importLibrary(db, pictureBlog);
    const withPicture = await searchLibrary({ db, map }, "Tesla revenue growth jackpot table");
    const without = await searchLibrary({ db, map }, "plain prose annuity discount");

    const blocks = searchResultBlocks(withPicture);
    if (typeof blocks === "string") throw new Error("expected search results");
    expect(blocks[0].content[0].text).toContain(MACHINE_READ_NOTE);
    expect(blocks.slice(1).every((b) => !b.content[0].text.includes(MACHINE_READ_NOTE))).toBe(true);
    expect(searchResultText(withPicture)).toContain(MACHINE_READ_NOTE);
    expect(without.results.map((r) => r.ref)).toEqual(["p2"]);
    expect(searchResultText(without)).not.toContain(MACHINE_READ_NOTE);
  });

  it("flags the Passage view of a passage with picture text, even when the quote limit cuts it", async () => {
    const db = await testDb();
    await importLibrary(db, { ...pictureBlog, source: { ...pictureBlog.source, quoteWords: 3 } });
    const idOf = async (query: string) => (await searchLibrary({ db, map }, query)).results[0].id;

    expect(await loadPassageView({ db, map }, await idOf("Tesla revenue growth"))).toMatchObject({ status: "shown", machineRead: true });
    expect(await loadPassageView({ db, map }, await idOf("plain prose"))).toMatchObject({ status: "shown", machineRead: false });
  });
});
