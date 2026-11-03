import { describe, expect, it } from "vitest";
import { importLibrary, type LibraryFile } from "@/library/ingest";
import { NO_VOYAGE_KEY, VOYAGE_DOWN } from "@/library/library";
import { scriptedClient, type ScriptedRequest } from "@/test/scripted-client";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { runTutorTurn, type TurnEvent } from "./turn";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

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
  passages: [{ ref: "pv", heading: "Present value", url: "https://example.org/book/pv", text: "Present value discounts each future payment back to today at the discount rate." }],
};

const blog: LibraryFile = {
  source: {
    id: "a-blog",
    title: "A blog",
    kind: "dated",
    licence: "Short quotes with credit",
    licenceUrl: "https://example.org/terms",
    credit: "A. Writer, A blog",
    url: "https://example.org/blog",
    fetchedOn: "2026-11-02",
  },
  // After the present value Case's as-of date (24 October 2018).
  passages: [{ ref: "later", heading: "The winner's choice", url: "https://example.org/blog/later", publishedOn: "2019-03-05", text: "The winner took the cash option; present value explains why." }],
};

type SearchResultBlock = { type: "search_result"; source: string; title: string; content: { type: "text"; text: string }[]; citations?: { enabled: boolean } };

/** The tool_result content the Tutor received for its search, from the request that followed the call. */
function searchContent(requests: ScriptedRequest[]): string | SearchResultBlock[] {
  const blocks = requests[1].messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])) as { type: string; tool_use_id?: string; content?: unknown }[];
  const result = blocks.find((b) => b.type === "tool_result" && b.tool_use_id === "search-1");
  return result?.content as string | SearchResultBlock[];
}

/** All the text the Tutor received for its search, whether as plain text or inside search results. */
function searchResult(requests: ScriptedRequest[]): string {
  const content = searchContent(requests);
  if (typeof content === "string") return content;
  return content.flatMap((r) => r.content.map((b) => b.text)).join("\n");
}

const searchThenReply = [
  { content: [{ type: "tool_use", id: "search-1", name: "search_library", input: { query: "present value discount rate" } }] },
  { content: [{ type: "text", text: "As A textbook by B. Author puts it, present value discounts each payment." }] },
];

describe("search_library tool in the Tutor Turn", () => {
  it("is offered to the Tutor, whose instructions say not to name sources in the Tutor's sentences", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Hello." }] }]);

    await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "Hi"));

    expect(requests[0].tools).toContainEqual({ name: "search_library" });
    expect(TUTOR_INSTRUCTIONS).toContain("do not name sources in your sentences");
  });

  it("returns passages with their credit line, keyword-only without Voyage, and hides later dated passages before the reveal", async () => {
    const db = await testDb();
    await importLibrary(db, book);
    await importLibrary(db, blog);
    const { client, requests } = scriptedClient(structuredClone(searchThenReply));

    await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "What does the Library say about present value?"));

    const text = searchResult(requests);
    expect(text).toContain("Source: B. Author, A textbook (Publisher, 2022), CC BY 4.0");
    expect(text).toContain("https://example.org/book/pv");
    expect(text).toContain("Present value discounts each future payment");
    expect(text).toContain(NO_VOYAGE_KEY);
    expect(text).toContain("dated passages published after 2018-10-24, and reference passages that mention a later year, are hidden");
    expect(text).not.toContain("The winner took the cash option");
  });

  it("returns found passages as search_result blocks with citations enabled, each linking to its passage view and opening with its credit line", async () => {
    const db = await testDb();
    await importLibrary(db, {
      ...book,
      passages: [{ ref: "pv", heading: "Present value", url: "https://example.org/book/pv", text: "Present value discounts each future payment back to today. A higher discount rate gives a lower present value." }],
    });
    const { client, requests } = scriptedClient(structuredClone(searchThenReply));

    await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "What does the Library say about present value?"));

    const content = searchContent(requests);
    expect(Array.isArray(content)).toBe(true);
    const [result] = content as SearchResultBlock[];
    expect(result.type).toBe("search_result");
    expect(result.citations).toEqual({ enabled: true });
    expect(result.source).toMatch(/^\/passages\/\d+$/);
    expect(result.title).toBe("Present value");
    // The first block is the credit; then one block per sentence, so a citation points at the exact sentence.
    expect(result.content[0].text).toContain("Source: B. Author, A textbook (Publisher, 2022), CC BY 4.0");
    expect(result.content.slice(1).map((b) => b.text)).toEqual(["Present value discounts each future payment back to today. ", "A higher discount rate gives a lower present value."]);
  });

  it("still tells the Tutor each source's quote limit inside the search results", async () => {
    const db = await testDb();
    await importLibrary(db, { ...book, source: { ...book.source, quoteWords: 60 } });
    const { client, requests } = scriptedClient(structuredClone(searchThenReply));

    await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "What does the Library say about present value?"));

    expect(searchResult(requests)).toContain('Quote at most 60 words from "A textbook" at a time, with credit');
  });

  it("tells the Tutor when Voyage is down and keyword results are used instead", async () => {
    const db = await testDb();
    await importLibrary(db, book);
    const { client, requests } = scriptedClient(structuredClone(searchThenReply));
    const embedQuery = async (): Promise<number[]> => {
      throw new Error("Voyage 503");
    };

    await collect(runTutorTurn({ db, client, embedQuery, map: presentValueOnly() }, "What does the Library say about present value?"));

    const text = searchResult(requests);
    expect(text).toContain(VOYAGE_DOWN);
    expect(text).toContain("Source: B. Author, A textbook");
  });

  it("says plainly when nothing matches", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient(structuredClone(searchThenReply));

    await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "What does the Library say about present value?"));

    expect(searchResult(requests)).toContain("No Library passage matched");
  });

  it("scopes a search to one writer with the source filter, so the writer's name is not in the query", async () => {
    const db = await testDb();
    await importLibrary(db, book);
    await importLibrary(db, {
      ...book,
      source: { ...book.source, id: "other-book", title: "Another textbook", credit: "C. Other, Another textbook (Press, 2020)", url: "https://example.org/other" },
      passages: [{ ref: "pv2", heading: "Present value again", url: "https://example.org/other/pv", text: "Present value discounts every future payment at the discount rate, said the other author." }],
    });
    const { client, requests } = scriptedClient([
      { content: [{ type: "tool_use", id: "search-1", name: "search_library", input: { query: "present value discount rate", source: "B. Author" } }] },
      { content: [{ type: "text", text: "As B. Author puts it, present value discounts each payment." }] },
    ]);

    await collect(runTutorTurn({ db, client, map: presentValueOnly() }, "What does B. Author say about present value?"));

    const text = searchResult(requests);
    expect(text).toContain("Present value discounts each future payment back to today");
    expect(text).not.toContain("said the other author");
  });

  it("tells the Tutor, in its instructions, to use the source filter instead of putting a writer's name in the query", () => {
    expect(TUTOR_INSTRUCTIONS).toContain("source filter");
    expect(TUTOR_INSTRUCTIONS).toContain("never put a writer's name in the query");
  });
});
