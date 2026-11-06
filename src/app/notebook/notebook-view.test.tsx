import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TopicNote } from "@/learner/notes";
import { applySettings } from "@/widgets/settings";
import type { Notebook, NotebookRow } from "@/learner/notebook";
import { NotebookView } from "./notebook-view";
import { UndoToast } from "./undo";

const now = new Date("2026-11-03T00:00:00Z");
const notes: TopicNote[] = [
  {
    topicId: "pv",
    title: "Present value",
    stage: "foundation",
    passed: true,
    filled: {
      formulas: [{ formulaId: "present-value", values: { amount: 1100, ratePercent: 10, years: 1 } }],
      insight: { ownWords: "Later money is worth less", written: "Waiting has a price." },
      principle: "A dollar later is worth less than a dollar now.",
      connections: [{ text: "Bond prices fall when yields rise.", titles: ["Bond basics"] }],
      mistakes: ["Added the interest"],
    },
    lines: [{ id: 7, text: "Divide, do not subtract", createdAt: now, updatedAt: now }],
    saved: [],
  },
  { topicId: "bonds", title: "Bond prices", stage: "follow", passed: false, lines: [], saved: [] },
];

/** A Notebook row for a note: status from the note, a Session when asked. */
const rowOf = (note: TopicNote, over: Partial<NotebookRow> = {}): NotebookRow => ({
  topicId: note.topicId,
  title: note.title,
  stage: note.stage,
  status: note.passed ? "passed" : "not_started",
  sessionId: null,
  lastActive: null,
  action: null,
  found: [],
  note,
  ...over,
});
const book = (list: TopicNote[], older: Notebook["older"] = []): Notebook => ({ rows: list.map((n) => rowOf(n)), older });

const PLAY = `root = Widget("Cash now or later", [rate])
$rate = 5
rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")`;

describe("saved replies and Widgets on a Topic Note", () => {
  const saved: TopicNote["saved"] = [
    { id: 1, kind: "reply", text: "Discounting is **the price of waiting**.\n\n```sources\n[{\"n\":1,\"title\":\"Library passage (hidden until the reveal)\",\"href\":\"/passages/9\",\"credit\":null}]\n```", savedAt: now, again: { kind: "reply", sessionId: 3, turnSeq: 0 } },
    { id: 2, kind: "widget", code: applySettings(PLAY, { $rate: 8 }), title: "Cash now or later", savedAt: now, again: { kind: "widget", widgetIndex: -1, settings: { $rate: 8 } } },
  ];
  const html = renderToStaticMarkup(<NotebookView notebook={book([{ ...notes[1], saved }])} showAll />);

  it("shows them on a Topic that is not passed yet, a reply drawn like an old Session with its sources folded", () => {
    expect(html).toContain('data-saved-item="reply"');
    expect(html).toMatch(/<strong[^>]*>the price of waiting<\/strong>/);
    expect(html).toContain('data-testid="sources-fold"');
    expect(html).toContain("1 source");
  });

  // The Renderer fills a slider's $variable after the first render (in the browser), so a static render cannot show the number;
  // the saved numbers are checked where they are written into the code (src/learner/saved.test.ts, src/widgets/settings.test.ts).
  it("draws a saved Widget, live, with its slider, ready to play with again", () => {
    expect(html).toContain('data-saved-item="widget"');
    expect(html).toContain("Widget · Cash now or later");
    expect(html).toMatch(/<input[^>]*type="range"/);
  });

  it("heads them in Topic words, and never says lesson", () => {
    expect(html).toContain("Saved from Topics");
    expect(html.toLowerCase()).not.toContain("lesson");
  });

  it("keeps a Topic with something saved on the printed page, and has no Save button of its own", () => {
    expect(html).toContain("has([data-line],[data-saved])");
    expect(html).not.toContain('data-testid="save-to-notes"');
  });
});

describe("a Notebook row's Topic Note", () => {
  const html = renderToStaticMarkup(<NotebookView notebook={book(notes)} showAll />);

  it("lists Topics in the order given, one note each", () => {
    expect([...html.matchAll(/data-notebook-row="([^"]+)"/g)].map((m) => m[1])).toEqual(["pv", "bonds"]);
  });

  it("draws a passed Topic's filled-in part: Formula Card with numbers, both Insight versions, principle, Connections, mistakes", () => {
    expect(html).toContain('data-formula="present-value"');
    expect(html).toContain("$1,000.00");
    expect(html).toContain("Later money is worth less");
    expect(html).toContain("Waiting has a price.");
    expect(html).toContain("A dollar later is worth less");
    expect(html).toContain("Bond prices fall when yields rise.");
    expect(html).toContain("Added the interest");
  });

  it("shows the Learner's own line, and offers lines on a Topic that is not passed yet without filling it in", () => {
    expect(html).toContain("Divide, do not subtract");
    expect(html).toContain('data-add-line="bonds"');
    expect(html).toContain("Fills in when you pass this Topic.");
    expect(html.match(/data-filled/g)).toHaveLength(1);
  });

  it("leaves out only the written Insight when the Learner found it themselves", () => {
    const found = renderToStaticMarkup(
      <NotebookView notebook={book([{ ...notes[0], filled: { ...notes[0].filled!, insight: { ownWords: "Later money is worth less" } } }])} showAll={false} />,
    );
    expect(found).toContain("Later money is worth less");
    expect(found).not.toContain("data-written-insight");
  });

  it("prints cleanly: controls and empty Topics are hidden on paper, and the print block sets a light page", () => {
    expect(html).toMatch(/<form[^>]*print:hidden/);
    expect(html).toMatch(/data-notebook-row="bonds"[^>]*print:\[&amp;:not\(:has|print:\[&amp;:not\(:has[^>]*data-notebook-row="bonds"/);
    expect(html).not.toMatch(/data-notebook-row="pv"[^>]*print:/);
    const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media print/);
  });
});

describe("notebook rows", () => {
  const empty = (topicId: string, title: string): TopicNote => ({ topicId, title, stage: "follow", passed: false, lines: [], saved: [] });
  const rows = [
    rowOf(notes[0], { sessionId: 12, lastActive: now, action: "read", found: ["You found the rate."] }),
    rowOf(empty("bonds", "Bond prices"), { status: "in_progress", sessionId: 13, lastActive: now, action: "resume" }),
    rowOf(empty("fx", "Currencies")),
  ];
  const older = [{ id: 5, date: new Date("2026-09-05T08:00:00Z"), topics: ["Present value"] }];
  const html = renderToStaticMarkup(<NotebookView notebook={{ rows, older }} showAll={false} />);
  const ids = (h: string) => [...h.matchAll(/data-notebook-row="([^"]+)"/g)].map((m) => m[1]);

  it("has the page title Notebook, and never says Past Sessions or lesson", () => {
    expect(html).toMatch(/<h1[^>]*>Notebook<\/h1>/);
    expect(html).not.toContain("Past Sessions");
    expect(html.toLowerCase()).not.toContain("lesson");
  });

  it("has one row per Topic in the order given, each with the anchor note-<topicId> and its status Tag", () => {
    expect(ids(html)).toEqual(["pv", "bonds", "fx"]);
    expect(html).toContain('id="note-bonds"');
    expect(html).toMatch(/data-affordance="tag"[^>]*>Passed</);
    expect(html).toMatch(/data-affordance="tag"[^>]*>In progress</);
    expect(html).toMatch(/data-affordance="tag"[^>]*>Not started</);
    expect(html).toContain("Last worked on 3 Nov 2026");
  });

  it("gives an in-progress row a Resume form posting its Topic to /api/open", () => {
    const row = html.slice(html.indexOf('data-notebook-row="bonds"'), html.indexOf('data-notebook-row="fx"'));
    expect(row).toMatch(/<form[^>]*action="\/api\/open"/);
    expect(row).toMatch(/name="topic" value="bonds"/);
    expect(row).toContain("Resume");
  });

  it("gives a passed row a Read link to its Session, and says what the Learner found", () => {
    const row = html.slice(html.indexOf('data-notebook-row="pv"'), html.indexOf('data-notebook-row="bonds"'));
    expect(row).toMatch(/<a[^>]*href="\/sessions\/12"[^>]*>Read<\/a>/);
    expect(row).toContain("What you found");
    expect(row).toContain("You found the rate.");
    expect(row).not.toContain("/api/open");
  });

  it("leaves a row with no action without a Resume or Read", () => {
    const row = html.slice(html.indexOf('data-notebook-row="fx"'));
    expect(row).not.toContain("Resume");
    expect(row).not.toMatch(/>Read</);
  });

  it("lists Older sessions under their own heading, each linking to its Session", () => {
    expect(html).toMatch(/<h2[^>]*>Older sessions<\/h2>/);
    expect(html.indexOf('href="/sessions/5"')).toBeGreaterThan(html.indexOf("Older sessions"));
    expect(html).toContain("5 SEP 2026");
  });

  it("offers Show all Topics, and turning it off goes back", () => {
    expect(html).toMatch(/<a[^>]*href="\/notebook\?all=1"[^>]*>Show all Topics<\/a>/);
    const all = renderToStaticMarkup(<NotebookView notebook={{ rows, older: [] }} showAll />);
    expect(all).toMatch(/<a[^>]*href="\/notebook"[^>]*>Show only Topics with something in them<\/a>/);
    expect(all).not.toContain("Older sessions");
  });

  it("gives a Learner with nothing yet a short line instead of empty cards", () => {
    const none = renderToStaticMarkup(<NotebookView notebook={{ rows: [], older: [] }} showAll={false} />);
    expect(ids(none)).toEqual([]);
    expect(none).toContain("data-notebook-empty");
    expect(none).toContain("Nothing here yet.");
  });

  it("leaves a slot for Earlier attempts, empty until a Topic is started over", () => {
    expect(html).toContain("data-earlier-attempts");
  });
});

describe("Undo after a removal", () => {
  it("shows a toast that says what went and offers Undo", () => {
    const html = renderToStaticMarkup(<UndoToast message="Removed from notes." onUndo={() => {}} />);
    expect(html).toMatch(/role="status"/);
    expect(html).toContain("Removed from notes.");
    expect(html).toMatch(/<button[^>]*data-undo-remove[^>]*>Undo<\/button>/);
    expect(html).toContain("print:hidden");
  });

  it("says so when the Undo itself failed", () => {
    const html = renderToStaticMarkup(<UndoToast message="Removed from notes." failed onUndo={() => {}} />);
    expect(html).toContain("Could not undo. Try again.");
  });

  it("has no toast on the page until something is removed", () => {
    expect(renderToStaticMarkup(<NotebookView notebook={book(notes)} showAll={false} />)).not.toContain("data-undo-remove");
  });
});
