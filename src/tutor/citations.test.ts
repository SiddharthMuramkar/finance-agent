import { describe, expect, it } from "vitest";
import { importLibrary, type LibraryFile } from "@/library/ingest";
import { scriptedClient } from "@/test/scripted-client";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { HIDDEN_SOURCE_TITLE } from "./citations";
import { loadCurrentSession } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";

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

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "What is present value?"));

    const expected =
      "As A textbook by B. Author puts it, present value discounts each payment back to today[1](/passages/1?blocks=1-2), and a higher rate lowers it[1](/passages/1?blocks=2-3)." +
      "\n\nSources:\n\n1. [Present value](/passages/1)\n";
    expect(streamed(events)).toBe(expected);
    const lines = await loadCurrentSession(db);
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

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "Hi"));

    expect(streamed(events)).toBe(
      "One[1](/passages/7?blocks=1-2) two[2](/passages/3?blocks=1-3)[1](/passages/7?blocks=2-3)\n\nSources:\n\n1. [Bonds](/passages/7)\n2. [Stocks](/passages/3)\n",
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

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "Hi"));

    expect(streamed(events)).toBe(`Prose[1](/passages/2?blocks=1-2)\n\n${widget}\n\nAfter.\n\nSources:\n\n1. [PV](/passages/2)\n`);
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

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "Hi"));

    const expected =
      "Timeless[1](/passages/1?blocks=1-2) and later[2](/passages/2?blocks=1-2)" +
      `\n\nSources:\n\n1. [Present value](/passages/1)\n2. [${HIDDEN_SOURCE_TITLE}](/passages/2)\n`;
    expect(streamed(events)).toBe(expected);
    expect((await loadCurrentSession(db, presentValueOnly())).at(-1)?.text).toBe(expected);
  });

  it("leaves a reply with no citations, or citations of something other than a Library passage, unchanged", async () => {
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Plain", citations: [{ type: "web_search_result_location", url: "https://x", title: "X", cited_text: "c", encrypted_index: "e" }] }] }]);

    const events = await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "Hi"));

    expect(streamed(events)).toBe("Plain");
  });
});
