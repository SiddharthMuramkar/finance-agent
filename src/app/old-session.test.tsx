import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { foldText, HIDDEN_SOURCE_TITLE } from "@/tutor/citations";
import { summariseRows } from "@/tutor/session-summary";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { OldSession } from "./old-session";
import { PastSessionHeaderView } from "./past-sessions";

const reply = [
  "## Why discount?",
  "",
  "A rupee today is **worth more** than a rupee next year:",
  "",
  "- you can invest it",
  "- prices rise",
  "",
  "```openui-lang",
  'root = Widget("PV", [])',
  "```",
  "",
  "Try the slider.",
].join("\n");

describe("an old Session page", () => {
  it("shows the Tutor's prose as formatted Markdown, not raw symbols", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "user", text: "Why **discount**?" }, { role: "assistant", text: reply }]} />);
    expect(html).toMatch(/<h2[^>]*>Why discount\?<\/h2>/);
    expect(html).toMatch(/<strong[^>]*>worth more<\/strong>/);
    expect(html.match(/<li[^>]*>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("**worth more**");
    expect(html).not.toContain("## Why");
  });

  it("puts a Widget chip where the Tutor put the Widget, the Widget itself in the panel, and never shows its code", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: reply }]} />);
    const chip = html.indexOf('title="PV"');
    expect(chip).toBeGreaterThan(html.indexOf("prices rise"));
    expect(chip).toBeLessThan(html.indexOf("Try the slider."));
    expect(html).toContain('data-testid="widget-card"');
    expect(html).not.toContain("```");
    expect(html).not.toContain("openui-lang");
  });

  it("draws a stored step divider between the two parts of the reply it cut", () => {
    const html = renderToStaticMarkup(
      <OldSession
        lines={[
          { role: "assistant", text: "Good thinking.", more: true },
          { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } },
          { role: "assistant", text: "Now the concept." },
        ]}
      />,
    );
    const at = html.indexOf("Step 2 of 6 · Concept");
    expect(html).toContain('data-testid="step-divider"');
    expect(at).toBeGreaterThan(html.indexOf("Good thinking."));
    expect(at).toBeLessThan(html.indexOf("Now the concept."));
  });

  it("shows a Markdown table as a table", () => {
    const text = "Rates:\n\n| Year | Open |\n|---|---|\n| 1 | 50 |\n\nDone.";
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text }]} />);
    expect(html).toMatch(/<table/);
    expect(html).not.toContain("|---|");
  });

  it("shows each citation as a small numbered link to its passage and folds the reply's sources into one closed 'N sources' line with heading and credit", () => {
    const text =
      "Present value discounts each payment[1](/passages/4?blocks=1-2)." +
      foldText([
        { n: 1, title: "Present value", href: "/passages/4", credit: "J. Author, A book (OpenStax), CC BY" },
        { n: null, title: "30-year yield", href: "https://example.org/y", credit: "US Treasury" },
      ]);
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text }]} />);
    expect(html).toMatch(/<sup[^>]*><a[^>]*href="\/passages\/4\?blocks=1-2"[^>]*>1<\/a><\/sup>/);
    expect(html.match(/data-testid="sources-fold"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*data-testid="sources-fold"[^>]*\sopen/);
    expect(html).toMatch(/<summary[^>]*>(<svg.*?<\/svg>)?2 sources<\/summary>/);
    expect(html).toMatch(/<a[^>]*href="\/passages\/4"[^>]*>Present value<\/a>/);
    expect(html).toContain("J. Author, A book (OpenStax), CC BY");
    expect(html).toContain("US Treasury");
    expect(html).not.toContain("](/passages");
    expect(html).not.toContain("```");
  });

  it("lists a hidden passage under its hidden title with no credit", () => {
    const text = "Claim[1](/passages/9?blocks=1-2)" + foldText([{ n: 1, title: HIDDEN_SOURCE_TITLE, href: "/passages/9", credit: null }]);
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text }]} />);
    expect(html).toContain(HIDDEN_SOURCE_TITLE);
    expect(html).toMatch(/<summary[^>]*>(<svg.*?<\/svg>)?1 source<\/summary>/);
    expect(html).not.toContain(" — ");
  });
});

describe("a read-only Topic Session's Widgets, updated in place", () => {
  const rates = (start: number) => ["```openui-lang", 'root = Widget("Rates", [rate])', `$rate = ${start}`, 'rate = Slider("rate", "Rate", 0, 10, 0.25, $rate, "percent")', "```"].join("\n");
  const ANNUITY = 'root = Widget("What the annuity is worth today", [rate])\n$rate = 5\nrate = Slider("rate", "Rate", 0, 10, 0.01, $rate, "percent")';
  const tabs = (html: string) => {
    const at = html.indexOf('data-testid="widget-filmstrip"');
    return at === -1 ? 0 : (html.slice(at, html.indexOf('data-testid="widget-card"', at)).match(/data-thumb-key=/g) ?? []).length;
  };

  it("draws a Widget the Tutor drew again under the same title in one tab", () => {
    const lines = [
      { role: "assistant" as const, text: rates(5) },
      { role: "assistant" as const, text: rates(3) },
    ];
    expect(tabs(renderToStaticMarkup(<OldSession lines={lines} inPlace />))).toBe(0);
  });

  it("draws the explore Widget the Tutor reopened in its one Explore tab", () => {
    const html = renderToStaticMarkup(
      <OldSession
        lines={[{ role: "item", kind: WIDGET_OPENED, data: { id: "annuity-worth-today", title: "What the annuity is worth today" } }, { role: "assistant", text: "Try it." }]}
        explore={{ id: "annuity-worth-today", code: ANNUITY }}
        writtenAhead={[{ id: "annuity-worth-today", title: "What the annuity is worth today", code: ANNUITY }]}
        inPlace
      />,
    );
    expect(tabs(html)).toBe(1);
    expect(html).toContain("What the annuity is worth today");
  });
});

describe("the read-only layout", () => {
  const html = renderToStaticMarkup(<OldSession lines={[{ role: "user", text: "Hi" }, { role: "assistant", text: reply }]} />);

  it("has the conversation and the Widget panel side by side, and a way back to the workspace", () => {
    expect(html).toContain('aria-label="Widget panel"');
    expect(html).toMatch(/<a[^>]*href="\/study"[^>]*>Back to the workspace<\/a>/);
    // A raised button the affordance audit can judge (it read as a bare link on an Earlier attempt's page, B3b).
    expect(html).toMatch(/<a[^>]*data-affordance="button"[^>]*>Back to the workspace<\/a>/);
  });

  it("has no composer, no Resume and nothing to send", () => {
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Ask the Tutor");
    expect(html).not.toContain("Resume");
    expect(html).not.toContain(">Send<");
  });
});

describe("the old Session page on an iPad", () => {
  it("read view uses the same frame as the workspace, side by side from the narrowest width", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: "Hi" }]} />);
    const grid = html.match(/<div[^>]*data-testid="old-session"[^>]*>/)![0];
    expect(grid).toContain("grid-cols-[minmax(360px,2fr)_minmax(0,3fr)]");
    expect(grid).toContain("gap-[var(--gap)]");
    expect(grid).not.toMatch(/\bgrid-cols-1\b/);
  });
});

describe("working out a Session's Topics and Widgets from its messages", () => {
  it("reads Topic lines in order, once each, and counts Widgets net of corrections", () => {
    const ctx = (t: string) => `Course Navigator: where.\nTopic: ${t} (Foundations Stage).\nTeaching Step: concept.`;
    const fenced = '```openui-lang\nroot = Widget("x", [])\n```';
    const out = summariseRows([
      { role: "user", content: [{ type: "text", text: `Where the Learner stands:\n${ctx("Present value")}` }] },
      { role: "assistant", content: [{ type: "text", text: fenced }] },
      { role: "user", content: "Widget check by code: broken" },
      { role: "assistant", content: [{ type: "text", text: fenced }] },
      { role: "system", content: ctx("Annuities") },
      { role: "system", content: ctx("Present value") },
      { role: "assistant", content: [{ type: "text", text: fenced }] },
    ]);
    expect(out).toEqual({ topics: ["Present value", "Annuities"], widgets: 2 });
  });
});

const sep5 = new Date("2026-09-05T08:00:00Z");
const oct24 = new Date("2026-10-24T08:00:00Z");

describe("a Topic Session page header", () => {
  const unpassed = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "topic", topicId: "bonds", title: "Bond prices", lastActive: oct24, passed: false }} />);

  it("starts with a back link to the Topic's Notebook row, then the Topic and the date of last activity", () => {
    const back = unpassed.search(/<a[^>]*href="\/notebook#note-bonds"[^>]*>← Notebook/);
    expect(back).toBeGreaterThanOrEqual(0);
    expect(back).toBeLessThan(unpassed.indexOf("Bond prices"));
    expect(unpassed).toContain("24 Oct 2026");
    expect(unpassed).not.toContain("Past Sessions");
  });

  it("goes back to the plain Notebook when the Session has no Topic", () => {
    const html = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "topic", topicId: null, title: "Free questions", lastActive: oct24, passed: false }} />);
    expect(html).toMatch(/<a[^>]*href="\/notebook"[^>]*>← Notebook/);
  });

  it("offers Resume this Topic, which opens that Topic in the Study Workspace", () => {
    expect(unpassed).toMatch(/<form[^>]*action="\/api\/open"/);
    expect(unpassed).toMatch(/name="topic" value="bonds"/);
    expect(unpassed).toContain("Resume this Topic");
    expect(unpassed).not.toContain("Passed ✓");
  });

  it("shows Passed ✓ instead once the Topic is passed", () => {
    const passed = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "topic", topicId: "bonds", title: "Bond prices", lastActive: oct24, passed: true }} />);
    expect(passed).toContain("Passed ✓");
    expect(passed).not.toContain("Resume");
    expect(passed).not.toContain("/api/open");
  });
});

describe("an Older session page header", () => {
  it("links back to the Notebook, shows its date and Topics and that it is read-only, with no Resume", () => {
    const html = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "older", date: sep5, topics: ["Present value", "Annuities"] }} />);
    expect(html).toMatch(/<a[^>]*href="\/notebook"[^>]*>← Notebook/);
    expect(html).toContain("5 Sep 2026");
    expect(html).not.toContain("Sept");
    expect(html).toContain("Annuities");
    expect(html).toContain("Older session · read-only");
    expect(html).not.toContain("Resume");
    expect(html).not.toContain("/api/open");
  });

  it("says No Topic when it touched none", () => {
    expect(renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "older", date: sep5, topics: [] }} />)).toContain("No Topic");
  });
});

describe("an old stored Continue.", () => {
  it("draws as a → next step divider, never as a Learner bubble", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: "That is the story." }, { role: "user", text: "Continue." }, { role: "assistant", text: "Now the concept." }]} />);
    const at = html.indexOf("→ next step");
    expect(at).toBeGreaterThan(html.indexOf("That is the story."));
    expect(at).toBeLessThan(html.indexOf("Now the concept."));
    expect(html).toContain('role="separator"');
    expect(html).not.toContain("Continue.");
  });
});
