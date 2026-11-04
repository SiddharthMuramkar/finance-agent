import { describe, expect, it } from "vitest";
import { importLibrary, type LibraryFile } from "@/library/ingest";
import { scriptedClient } from "@/test/scripted-client";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { importCaseData } from "@/case-data/import";
import { foldText, HIDDEN_SOURCE_TITLE } from "./citations";
import { loadCurrentSession } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";
import { OWNER_LEARNER_ID } from "@/db/schema";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const streamed = (events: TurnEvent[]) =>
  events
    .filter((e): e is Extract<TurnEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.text)
    .join("");

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
  passages: [
    { ref: "pv", heading: "Present value", url: "https://example.org/book/pv", text: "Present value discounts each future payment back to today. A higher discount rate gives a lower present value." },
  ],
};

/** A citation as the API returns it for a search_result block. */
function cite(source: string, title: string, start: number, end: number, cited: string) {
  return { type: "search_result_location", source, title, cited_text: cited, search_result_index: 0, start_block_index: start, end_block_index: end };
}

describe("Tutor replies cite Library passages", () => {
  it("marks each cited claim with a numbered link to its passage and lists the reply's sources, the same live and after a reload", async () => {
    const db = await testDb();
    await importLibrary(db, book);
    const source = "/passages/1";
    const { client } = scriptedClient([
      { content: [{ type: "tool_use", id: "search-1", name: "search_library", input: { query: "present value" } }] },
      {
        content: [
          { type: "text", text: "As A textbook by B. Author puts it, " },
          { type: "text", text: "present value discounts each payment back to today", citations: [cite(source, "Present value", 1, 2, "Present value discounts each future payment back to today. ")] },
          { type: "text", text: ", and " },
          { type: "text", text: "a higher rate lowers it", citations: [cite(source, "Present value", 2, 3, "A higher discount rate gives a lower present value.")] },
          { type: "text", text: "." },
        ],
      },
    ]);

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly(), learnerId: OWNER_LEARNER_ID }, "What is present value?"));

    const expected =
      "As A textbook by B. Author puts it, present value discounts each payment back to today[1](/passages/1?blocks=1-2), and a higher rate lowers it[1](/passages/1?blocks=2-3)." +
      foldText([{ n: 1, title: "Present value", href: "/passages/1", credit: book.source.credit }]);
    expect(streamed(events)).toBe(expected);
    const lines = await loadCurrentSession(db, undefined, OWNER_LEARNER_ID);
    expect(lines.at(-1)?.text).toBe(expected);
  });

  it("numbers different passages in the order they are first cited", async () => {
    const db = await testDb();
    const { client } = scriptedClient([
      {
        content: [
          { type: "text", text: "One", citations: [cite("/passages/7", "Bonds", 1, 2, "x")] },
          { type: "text", text: " two", citations: [cite("/passages/3", "Stocks", 1, 3, "y"), cite("/passages/7", "Bonds", 2, 3, "z")] },
        ],
      },
    ]);

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly(), learnerId: OWNER_LEARNER_ID }, "Hi"));

    expect(streamed(events)).toBe(
      "One[1](/passages/7?blocks=1-2) two[2](/passages/3?blocks=1-3)[1](/passages/7?blocks=2-3)" +
        foldText([
          { n: 1, title: "Bonds", href: "/passages/7", credit: null },
          { n: 2, title: "Stocks", href: "/passages/3", credit: null },
        ]),
    );
  });

  it("never puts a marker inside a widget block, so inline widgets still draw", async () => {
    const db = await testDb();
    const widget = '```openui-lang\nroot = Widget("PV", [])\n```';
    const { client } = scriptedClient([
      {
        content: [
          { type: "text", text: "Prose", citations: [cite("/passages/2", "PV", 1, 2, "x")] },
          { type: "text", text: `\n\n${widget.slice(0, 20)}` },
          { type: "text", text: widget.slice(20), citations: [cite("/passages/2", "PV", 1, 2, "x")] },
          { type: "text", text: "\n\nAfter." },
        ],
      },
    ]);

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly(), learnerId: OWNER_LEARNER_ID }, "Hi"));

    expect(streamed(events)).toBe(`Prose[1](/passages/2?blocks=1-2)\n\n${widget}\n\nAfter.${foldText([{ n: 1, title: "PV", href: "/passages/2", credit: null }])}`);
  });

  it("never shows the heading of a cited passage the as-of rule hides now, live or after a reload", async () => {
    const db = await testDb();
    await importLibrary(db, book);
    // After the present value Case's as-of date (24 October 2018); found by a search made before the Learner reached the Case.
    await importLibrary(db, {
      source: { ...book.source, id: "a-blog", title: "A blog", kind: "dated", credit: "A. Writer, A blog" },
      passages: [{ ref: "later", heading: "The winner's choice", url: "https://example.org/blog/later", publishedOn: "2019-03-05", text: "The winner took the cash option." }],
    });
    const { client } = scriptedClient([
      {
        content: [
          { type: "text", text: "Timeless", citations: [cite("/passages/1", "Present value", 1, 2, "x")] },
          { type: "text", text: " and later", citations: [cite("/passages/2", "The winner's choice", 1, 2, "y")] },
        ],
      },
    ]);

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly(), learnerId: OWNER_LEARNER_ID }, "Hi"));

    const expected =
      "Timeless[1](/passages/1?blocks=1-2) and later[2](/passages/2?blocks=1-2)" +
      foldText([
        { n: 1, title: "Present value", href: "/passages/1", credit: book.source.credit },
        { n: 2, title: HIDDEN_SOURCE_TITLE, href: "/passages/2", credit: null },
      ]);
    expect(streamed(events)).toBe(expected);
    expect((await loadCurrentSession(db, presentValueOnly(), OWNER_LEARNER_ID)).at(-1)?.text).toBe(expected);
  });

  it("folds a reply that cites in two loop steps into one list with one numbering, live and after a reload", async () => {
    const db = await testDb();
    await importLibrary(db, book);
    await importLibrary(db, { source: { ...book.source, id: "other-book", title: "Other", credit: "C. Other, Other book" }, passages: [{ ref: "x", heading: "Rates", url: "https://example.org/x", text: "Rates move." }] });
    const { client } = scriptedClient([
      { content: [{ type: "text", text: "First", citations: [cite("/passages/1", "Present value", 1, 2, "x")] }, { type: "tool_use", id: "search-1", name: "search_library", input: { query: "rates" } }] },
      {
        content: [
          { type: "text", text: "Second", citations: [cite("/passages/2", "Rates", 1, 1, "y")] },
          { type: "text", text: " third", citations: [cite("/passages/1", "Present value", 2, 3, "z")] },
        ],
      },
    ]);

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly(), learnerId: OWNER_LEARNER_ID }, "Hi"));

    const expected =
      "First[1](/passages/1?blocks=1-2)\n\nSecond[2](/passages/2?blocks=1-1) third[1](/passages/1?blocks=2-3)" +
      foldText([
        { n: 1, title: "Present value", href: "/passages/1", credit: book.source.credit },
        { n: 2, title: "Rates", href: "/passages/2", credit: "C. Other, Other book" },
      ]);
    expect(streamed(events)).toBe(expected);
    const lines = (await loadCurrentSession(db, presentValueOnly(), OWNER_LEARNER_ID)).filter((l) => l.role === "assistant");
    expect(lines.map((l) => l.text)).toEqual([expected]);
    expect(expected.match(/```sources/g)).toHaveLength(1);
  });

  it("adds the credit of a Case Data figure quoted in the text to the fold, and of none that is not quoted", async () => {
    const db = await testDb();
    const map = presentValueOnly();
    const caseId = map.topic("present-value")!.cases[0].id;
    const data = (id: string, source: string, value: number) => ({
      caseId,
      id,
      label: `Label ${id}`,
      unit: "percent",
      source,
      sourceUrl: `https://example.org/${id}`,
      checkedOn: "2026-11-02",
      checkNote: "Checked.",
      points: [{ date: "2018-10-23", value }],
    });
    await importCaseData(db, [data("long-yield", "US Treasury, par yield curve", 3.37), data("other", "Another source", 2.11)]);
    const { client } = scriptedClient([{ content: [{ type: "text", text: "The 30-year yield was 3.37% that day." }] }]);

    const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hi"));

    const expected = "The 30-year yield was 3.37% that day." + foldText([{ n: null, title: "Label long-yield", href: "https://example.org/long-yield", credit: "US Treasury, par yield curve" }]);
    expect(streamed(events)).toBe(expected);
    expect((await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)?.text).toBe(expected);
  });

  it("leaves a reply with no citations, or citations of something other than a Library passage, unchanged", async () => {
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Plain", citations: [{ type: "web_search_result_location", url: "https://x", title: "X", cited_text: "c", encrypted_index: "e" }] }] }]);

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly(), learnerId: OWNER_LEARNER_ID }, "Hi"));

    expect(streamed(events)).toBe("Plain");
  });
});
