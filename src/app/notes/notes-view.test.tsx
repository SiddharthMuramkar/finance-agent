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
  const html = renderToStaticMarkup(<NotesView notes={notes} />);

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
