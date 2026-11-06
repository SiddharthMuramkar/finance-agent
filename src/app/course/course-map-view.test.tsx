import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TopicOverview } from "@/course/navigator";
import { CourseMapView } from "./course-map-view";

const topic = (t: Partial<TopicOverview> & Pick<TopicOverview, "id" | "title">): TopicOverview => ({
  stage: "foundation",
  subject: "Numbers & time value",
  status: "not_started",
  step: null,
  checks: [{ id: `${t.id}-1`, passed: false, here: false }],
  unmetPrerequisites: [],
  current: false,
  onDefaultPath: false,
  ...t,
});

const topics: TopicOverview[] = [
  topic({ id: "compounding", title: "Compounding", status: "passed", checks: [{ id: "co-1", passed: true, here: false }] }),
  topic({
    id: "pv",
    title: "Present value",
    status: "in_progress",
    step: "concept",
    checks: [
      { id: "pv-1", passed: true, here: false },
      { id: "pv-2", passed: false, here: true },
    ],
    current: true,
    onDefaultPath: true,
  }),
  topic({ id: "statements", title: "Reading a balance sheet", subject: "Financial statements" }),
  topic({ id: "bonds", title: "Bond prices", stage: "follow", subject: null, unmetPrerequisites: ["pv"] }),
  topic({ id: "j", title: "Judge one", stage: "judge", subject: null }),
  topic({ id: "a", title: "Analyse one", stage: "analyse", subject: null }),
];

const recommended = { topicId: "pv", label: "Resume: Present value" };
const render = (over: Partial<Parameters<typeof CourseMapView>[0]> = {}) =>
  renderToStaticMarkup(<CourseMapView topics={topics} recommended={recommended} sessions={{ compounding: 41 }} {...over} />);
/** One Topic row's markup: from its data-topic up to the next row or the end of its list. */
const row = (html: string, id: string) => html.split(`data-topic="${id}"`)[1].split(/data-topic=|<\/ol>/)[0];

describe("the Course Map page", () => {
  it("starts with one Recommended next card that shows What comes next", () => {
    const html = render();
    const card = html.split("data-recommended-next")[1];
    expect(html.indexOf("data-recommended-next")).toBeLessThan(html.indexOf("data-topic="));
    expect(card).toContain("Recommended next");
    expect(card).toContain("Resume: Present value →");
    expect(html.match(/data-recommended-next/g)).toHaveLength(1);
  });

  it("lays the Recommended next card and the off-path card side by side, and marks a todo Topic with a dot, not a ring", () => {
    const html = render();
    expect(html).toMatch(/<div class="[^"]*md:grid-cols-2[^"]*"><div data-recommended-next/);
    expect(html).toMatch(/data-dot="todo"[^>]*class="[^"]*bg-\[var\(--brand-line\)\]/);
    expect(html).not.toMatch(/data-dot="todo"[^>]*border-2/);
  });

  it("has no Recommended next card once every Topic is passed", () => {
    expect(render({ recommended: null })).not.toContain("data-recommended-next");
  });

  it("groups Foundation Topics by Subject in collapsible sections, with only the current Subject open", () => {
    const html = render();
    const subjects = [...html.matchAll(/<details[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => tag.includes("data-subject"))
      .map((tag) => [tag.match(/data-subject="([^"]+)"/)![1], / open=""/.test(tag)]);
    expect(subjects).toEqual([
      ["Numbers &amp; time value", true],
      ["Financial statements", false],
    ]);
    expect(html.split('data-subject="Financial statements"')[1]).toContain('data-topic="statements"');
  });

  it("gives Follow, Judge and Analyse their own sections after Foundation", () => {
    const html = render();
    expect([...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Foundation", "Follow", "Judge", "Analyse"]);
    const stops = [...html.matchAll(/data-topic="([^"]+)"/g)].map((m) => m[1]);
    expect(stops).toEqual(["compounding", "pv", "statements", "bonds", "j", "a"]);
  });

  it("makes each Topic row one whole-row link, with no separate per-row button", () => {
    const html = render();
    expect(html).not.toContain("Study this Topic");
    for (const id of ["compounding", "pv", "statements", "bonds"]) {
      expect(row(html, id)).not.toMatch(/<button/);
      expect(row(html, id).match(/<a [^>]*data-row-link/g)).toHaveLength(1);
    }
  });

  it("shows prerequisites as Do first links that open that Topic", () => {
    const bonds = row(render(), "bonds");
    expect(bonds).toMatch(/Do first: (<span>)?<a [^>]*data-jump="pv"[^>]*>Present value<\/a>/);
  });

  it("marks the Learner's place", () => {
    expect(render()).toContain("You are here");
  });

  it("shows Passed ✓ on a passed row, which opens the Topic's Session read-only", () => {
    const compounding = row(render(), "compounding");
    expect(compounding).toContain(">Passed</span>");
    expect(compounding).toMatch(/<a [^>]*href="\/sessions\/41"/);
    expect(compounding).not.toContain("data-jump");
  });

  it("offers a way back to the default path only when the Learner left it", () => {
    expect(render()).not.toContain("Back to the default path");
    const chose = topics.map((t) => ({ ...t, current: t.id === "bonds" }));
    expect(render({ topics: chose })).toContain("Back to the default path");
  });

  it("renders the same markup every time from the same progress", () => {
    expect(render()).toBe(render());
  });
});

describe("the in-progress status wording", () => {
  it("reads as a phrase, not 'at the your turn step'", () => {
    const html = render({ topics: topics.map((t) => (t.status === "in_progress" ? { ...t, step: "your_turn" as const } : t)) });
    expect(html).toContain("Teaching Step: your turn");
    expect(html).not.toContain("at the");
  });
});

describe("Topics not written yet", () => {
  it("shows them as coming, not as stops the Learner can open", () => {
    const coming = [
      { id: "bond-pricing", title: "Bond basics and pricing", stage: "foundation" as const },
      { id: "fol-erp", title: "Follow: The Price of Risk", stage: "follow" as const },
    ];
    const html = render({ coming });
    expect(html).toContain("Coming");
    expect(html).not.toMatch(/data-jump="bond-pricing"/);
    expect([...html.matchAll(/data-coming="([^"]+)"/g)].map((m) => m[1])).toEqual(["bond-pricing", "fol-erp"]);
  });
});

describe("the Course Map shows progress", () => {
  it("has the title Course Map and a summary of where the Learner stands, with Next from What comes next", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*>Course Map<\/h1>/);
    expect(html).toMatch(/data-progress-summary[^>]*>1 in progress · 1 passed · 4 to go · Next: Present value</);
  });

  it("leaves Next out of the summary when nothing comes next", () => {
    const html = render({ recommended: null });
    expect(html).toMatch(/data-progress-summary[^>]*>1 in progress · 1 passed · 4 to go</);
    expect(html).not.toContain("Next:");
  });

  it("shows Checks passed as 'n of m' with one bar segment per Check, passed ones filled", () => {
    const pv = row(render(), "pv");
    expect(pv).toContain("1 of 2");
    expect(pv.match(/data-segment="filled"/g)).toHaveLength(1);
    expect(pv.match(/data-segment="empty"/g)).toHaveLength(1);
    expect(pv).toContain("bg-[var(--mint)]");
    expect(pv).toContain("bg-[var(--hairline)]");
    const three = topics.map((t) => (t.id === "pv" ? { ...t, checks: [...t.checks, { id: "pv-3", passed: true, here: false }] } : t));
    const html = row(render({ topics: three }), "pv");
    expect(html).toContain("2 of 3");
    expect(html.match(/data-segment="filled"/g)).toHaveLength(2);
  });

  it("shows each Topic's status as a static Tag, never a button", () => {
    const html = render();
    for (const [id, words] of [["compounding", "Passed"], ["pv", "In progress"], ["statements", "Not started"]] as const) {
      expect(row(html, id)).toContain(`<span data-affordance="tag"`);
      expect(row(html, id)).toMatch(new RegExp(`data-affordance="tag"[^>]*>${words}</span>`));
    }
  });

  it("shows 'n of m passed' on a group header", () => {
    const many = Array.from({ length: 6 }, (_, i) => topic({ id: `m${i}`, title: `Topic ${i}`, subject: "Bonds & credit", status: i < 4 ? "passed" : "not_started" }));
    expect(render({ topics: many, recommended: null })).toContain("4 of 6 passed");
  });

  it("lays each group's Topics out as a card grid", () => {
    expect(render()).toMatch(/<ol class="[^"]*card-grid/);
  });

  it("no longer exports the Progress view", async () => {
    const mod: Record<string, unknown> = await import("./course-map-view");
    expect(mod.ProgressView).toBeUndefined();
  });
});
