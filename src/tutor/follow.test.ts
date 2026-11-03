import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { importLibrary, type LibraryFile } from "@/library/ingest";
import { scriptedClient, type ScriptedRequest } from "@/test/scripted-client";
import { testDb } from "@/test/pglite";
import { loadPastes, PASTE_PREFIX } from "./pasted";
import { listSessions, loadSession } from "./transcript";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { runTutorTurn, type TurnEvent } from "./turn";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** A one-Topic Follow course whose Case is a dated piece. */
function followMap(piece: string): CourseMap {
  const text = `
id: fol-a
title: Follow a writer's post
stage: follow
path: 1
cases:
  - id: fol-a-case
    title: A writer's post on a ride-hailing company
    asOf: 2014-12-02
    story: On 2 December 2014 the writer published a post handing readers the controls of a valuation.
    reveal: The company listed in 2019 at a price far from the writer's range.
${piece
  .split("\n")
  .map((l) => `    ${l}`)
  .join("\n")}
concept: A valuation is a story turned into numbers.
principle: Gaps in value are mostly gaps in narrative.
checks:
  - id: fol-a-check
    kind: conversation
    prompt: Explain each step of the argument.
    passCriteria: Names each step.
`;
  const { map, errors } = parseCourseMap([{ name: "fol-a.yaml", text }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const libraryMap = () =>
  followMap(`piece:
  author: A. Writer
  title: Up, up and away
  published: 2014-12-02
  url: https://example.org/blog/up
  from: library
  librarySource: Writer`);

const pasteMap = () =>
  followMap(`piece:
  author: B. Writer
  title: A newsletter piece
  published: 2014-12-01
  url: https://example.org/news/piece
  from: paste`);

/** A tool result's text: plain, or the text inside its search_result blocks. */
function toolResultText(content: unknown): string {
  if (!Array.isArray(content)) return String(content);
  return (content as { content?: { text: string }[] }[]).flatMap((r) => (r.content ?? []).map((b) => b.text)).join("\n");
}

/** Every text the Tutor was sent in a request: user text blocks, system messages and tool results. */
function sentTexts(request: ScriptedRequest): string[] {
  return request.messages.flatMap((m) => {
    if (typeof m.content === "string") return [m.content];
    return (m.content as { type: string; text?: string; content?: unknown }[]).flatMap((b) =>
      b.type === "text" ? [b.text!] : b.type === "tool_result" ? [toolResultText(b.content)] : [],
    );
  });
}

const blog: LibraryFile = {
  source: {
    id: "writer-blog",
    title: "A. Writer's blog",
    kind: "dated",
    licence: "Short quotes with credit",
    licenceUrl: "https://example.org/terms",
    credit: "A. Writer, Musings on Markets",
    url: "https://example.org/blog",
    fetchedOn: "2026-11-02",
    quoteWords: 60,
  },
  passages: [
    { ref: "up-1", heading: "Up, up and away", url: "https://example.org/blog/up", publishedOn: "2014-12-02", text: "Step one is the potential market for car service, which I size from urban taxis upwards." },
    { ref: "later-1", heading: "The listing", url: "https://example.org/blog/listing", publishedOn: "2019-05-09", text: "The potential market story met the listing price of the car service company." },
  ],
};

describe("Follow Topics: a dated piece as a Case", () => {
  it("tells the Tutor which piece the Case studies and that its text comes from the Library through the source filter, quoted briefly with credit", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Let's read it." }] }]);

    await collect(runTutorTurn({ db, client, map: libraryMap() }, "Continue."));

    const context = sentTexts(requests[0]).join("\n");
    expect(context).toContain('Piece studied: A. Writer, "Up, up and away", published 2014-12-02 (https://example.org/blog/up).');
    expect(context).toContain('call search_library with source "Writer"');
    expect(context).toContain("short passages with credit");
    // The piece as published is the story; the outcome stays back.
    expect(context).not.toContain("listed in 2019");
  });

  it("finds the piece's passages through search_library's source filter, with the credit and the quote limit, and hides the writer's later posts before the reveal", async () => {
    const db = await testDb();
    await importLibrary(db, blog);
    const { client, requests } = scriptedClient([
      { content: [{ type: "tool_use", id: "search-1", name: "search_library", input: { query: "potential market car service", source: "Writer" } }] },
      { content: [{ type: "text", text: "As A. Writer puts it, step one is the potential market." }] },
    ]);

    await collect(runTutorTurn({ db, client, map: libraryMap() }, "What is step one?"));

    const result = sentTexts(requests[1]).find((t) => t.startsWith("Library search"))!;
    expect(result).toContain("Step one is the potential market for car service");
    expect(result).toContain("Source: A. Writer, Musings on Markets");
    expect(result).toContain("Quote at most 60 words");
    expect(result).not.toContain("met the listing price");
  });
});

describe("Follow Topics: text the Learner pastes", () => {
  const passage = "Paragraph one of the newsletter piece argues that cheap prices hide a subsidy, and that the subsidy cannot last forever.";

  it("tells the Tutor, before anything is pasted, that it has not seen the piece and must ask for the part being studied", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Please paste the opening." }] }]);

    await collect(runTutorTurn({ db, client, map: pasteMap() }, "Continue."));

    const context = sentTexts(requests[0]).join("\n");
    expect(context).toContain('Piece studied: B. Writer, "A newsletter piece", published 2014-12-01');
    expect(context).toContain("not in the Library");
    expect(context).toContain("The Learner has not pasted any of it in this Session, so you have not seen its text");
    expect(context).not.toContain("search_library with source");
  });

  it("gives pasted text to the Tutor as marked text appended to the Learner's message, followed by context that counts what it has seen", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([
      { content: [{ type: "text", text: "Please paste the opening." }] },
      { content: [{ type: "text", text: "The first step is the subsidy claim." }] },
    ]);

    await collect(runTutorTurn({ db, client, map: pasteMap() }, "Continue."));
    await collect(runTutorTurn({ db, client, map: pasteMap() }, { message: "Here is the opening.", paste: passage }));

    const msgs = requests[1].messages;
    const learner = msgs.at(-2)!;
    expect(learner.role).toBe("user");
    expect(learner.content).toEqual([
      { type: "text", text: "Here is the opening." },
      { type: "text", text: `${PASTE_PREFIX}\n${passage}` },
    ]);
    const context = msgs.at(-1)!;
    expect(context.role).toBe("system");
    expect(context.content).toContain("Passages the Learner pasted in this Session: 1 (20 words)");
    expect(context.content).toContain("say plainly that you have not seen it");
  });

  it("stores pasted text privately with its Session, never in the Library, and shows it in the transcript only as a short label", async () => {
    const db = await testDb();
    await importLibrary(db, blog);
    const { client } = scriptedClient([
      { content: [{ type: "text", text: "Thanks." }] },
      { content: [{ type: "tool_use", id: "search-1", name: "search_library", input: { query: "cheap prices hide a subsidy" } }] },
      { content: [{ type: "text", text: "Nothing in the Library." }] },
    ]);

    await collect(runTutorTurn({ db, client, map: pasteMap() }, { message: "Here is the opening.", paste: passage }));
    const { requests: searchRequests, client: searchClient } = scriptedClient([
      { content: [{ type: "tool_use", id: "search-2", name: "search_library", input: { query: "cheap prices hide a subsidy" } }] },
      { content: [{ type: "text", text: "Nothing in the Library." }] },
    ]);
    await collect(runTutorTurn({ db, client: searchClient, map: pasteMap() }, "Is this in the Library?"));

    const session = (await listSessions(db))[0];
    expect(await loadPastes(db, session.id)).toEqual([expect.objectContaining({ sessionId: session.id, text: passage, words: 20 })]);
    const result = sentTexts(searchRequests[1]).find((t) => t.startsWith("Library search"))!;
    expect(result).toContain("No Library passage matched");
    expect(result).not.toContain("subsidy cannot last");
    const lines = await loadSession(db, session.id);
    expect(lines[0]).toEqual({ role: "user", text: 'Here is the opening.\n\n(Pasted passage, 20 words: "Paragraph one of the newsletter piece …")' });
  });

  it("keeps pasted text across a break, because the Topic keeps its Session", async () => {
    const db = await testDb();
    let now = new Date("2026-11-02T09:00:00Z");
    const { client, requests } = scriptedClient([
      { content: [{ type: "text", text: "Thanks." }] },
      { content: [{ type: "text", text: "Welcome back; please paste the part again." }] },
    ]);

    await collect(runTutorTurn({ db, client, map: pasteMap(), now: () => now }, { message: "Here is the opening.", paste: passage }));
    now = new Date("2026-11-02T20:00:00Z");
    await collect(runTutorTurn({ db, client, map: pasteMap(), now: () => now }, "Where were we?"));

    const context = sentTexts(requests[1]).join("\n");
    expect(context).toContain(passage);
    expect(context).not.toContain("The Learner has not pasted any of it in this Session");
  });

  it("keeps the pasted text when a failed turn is retried", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([{ error: new Error("connection reset") }, { content: [{ type: "text", text: "Got it." }] }]);

    await collect(runTutorTurn({ db, client, map: pasteMap() }, { message: "Here is the opening.", paste: passage }));
    await collect(runTutorTurn({ db, client, map: pasteMap() }, { resume: true }));

    expect(sentTexts(requests.at(-1)!)).toContain(`${PASTE_PREFIX}\n${passage}`);
  });
});

describe("Follow Topics: the Tutor's instructions", () => {
  it("say to work only from text the Tutor has seen, and to say plainly when it has not seen a passage", () => {
    expect(TUTOR_INSTRUCTIONS).toContain("Work only from the text you have actually been given");
    expect(TUTOR_INSTRUCTIONS).toContain("say plainly that you have not seen it");
  });
});
