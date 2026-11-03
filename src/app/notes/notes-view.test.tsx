import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TopicNote } from "@/learner/notes";
import { applySettings } from "@/widgets/settings";
import { NotesView } from "./notes-view";

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

const PLAY = `root = Widget("Cash now or later", [rate])
$rate = 5
rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")`;

describe("saved replies and Widgets on a Topic Note", () => {
  const saved: TopicNote["saved"] = [
    { id: 1, kind: "reply", text: "Discounting is **the price of waiting**.\n\n```sources\n[{\"n\":1,\"title\":\"Library passage (hidden until the reveal)\",\"href\":\"/passages/9\",\"credit\":null}]\n```", savedAt: now, again: { kind: "reply", sessionId: 3, turnSeq: 0 } },
    { id: 2, kind: "widget", code: applySettings(PLAY, { $rate: 8 }), title: "Cash now or later", savedAt: now, again: { kind: "widget", widgetIndex: -1, settings: { $rate: 8 } } },
  ];
  const html = renderToStaticMarkup(<NotesView notes={[{ ...notes[1], saved }]} />);

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

describe("the Notes page", () => {
  const html = renderToStaticMarkup(<NotesView notes={notes} showAll />);

  it("lists Topics in the order given, one note each", () => {
    expect([...html.matchAll(/data-note="([^"]+)"/g)].map((m) => m[1])).toEqual(["pv", "bonds"]);
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
      <NotesView notes={[{ ...notes[0], filled: { ...notes[0].filled!, insight: { ownWords: "Later money is worth less" } } }]} />,
    );
    expect(found).toContain("Later money is worth less");
    expect(found).not.toContain("data-written-insight");
  });

  it("prints cleanly: controls and empty Topics are hidden on paper, and the print block sets a light page", () => {
    expect(html).toMatch(/<form[^>]*print:hidden/);
    expect(html).toMatch(/data-note="bonds"[^>]*print:\[&amp;:not\(:has|print:\[&amp;:not\(:has[^>]*data-note="bonds"/);
    expect(html).not.toMatch(/data-note="pv"[^>]*print:/);
    const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media print/);
  });
});

describe("the Notes filter", () => {
  const empty = (topicId: string, title: string): TopicNote => ({ topicId, title, stage: "follow", passed: false, lines: [], saved: [] });
  const withLine: TopicNote = { ...empty("rates", "Interest rates"), lines: [{ id: 9, text: "Rates move prices", createdAt: now, updatedAt: now }] };
  const all = [notes[0], empty("bonds", "Bond prices"), withLine, empty("fx", "Currencies")];
  const shown = (html: string) => [...html.matchAll(/data-note="([^"]+)"/g)].map((m) => m[1]);

  it("has a visible page title", () => {
    expect(renderToStaticMarkup(<NotesView notes={all} />)).toMatch(/<h1[^>]*>Notes<\/h1>/);
  });

  it("lists only Topics with a note by default (passed, own lines or saved items), and offers Show all Topics", () => {
    const html = renderToStaticMarkup(<NotesView notes={all} />);
    expect(shown(html)).toEqual(["pv", "rates"]);
    expect(html).toMatch(/<a[^>]*href="\/notes\?all=1"[^>]*>Show all Topics<\/a>/);
  });

  it("shows every Topic with Show all Topics on, and turning it off goes back to the Topics with notes", () => {
    const html = renderToStaticMarkup(<NotesView notes={all} showAll />);
    expect(shown(html)).toEqual(["pv", "bonds", "rates", "fx"]);
    expect(html).toMatch(/<a[^>]*href="\/notes"[^>]*>Show only Topics with notes<\/a>/);
  });

  it("gives a Learner with no notes a short line instead of empty cards", () => {
    const html = renderToStaticMarkup(<NotesView notes={[empty("bonds", "Bond prices"), empty("fx", "Currencies")]} />);
    expect(shown(html)).toEqual([]);
    expect(html).toContain("data-notes-empty");
    expect(html).toContain("No notes yet.");
    expect(html.toLowerCase()).not.toContain("lesson");
  });

  it("gives each note an anchor, so Open notes lands on its Topic", () => {
    expect(renderToStaticMarkup(<NotesView notes={all} />)).toContain('id="note-rates"');
  });
});
