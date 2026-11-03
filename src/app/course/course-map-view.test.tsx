import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TopicOverview } from "@/course/navigator";
import { CourseMapView, ProgressView } from "./course-map-view";

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

  it("shows Check pills only for Topics the Learner has started", () => {
    const html = render();
    expect(row(html, "pv").match(/data-check=/g)).toHaveLength(2);
    expect(row(html, "statements")).not.toContain("data-check=");
    expect(row(html, "compounding")).toContain("data-check=");
    expect(html).toContain("You are here");
  });

  it("shows Passed ✓ on a passed row, which opens the Topic's Session read-only", () => {
    const compounding = row(render(), "compounding");
    expect(compounding).toContain("Passed ✓");
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
    expect(html).toContain("In progress · Teaching Step: your turn");
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

describe("the progress view", () => {
  it("shows each Topic's status as not started, in progress or passed, with Checks passed", () => {
    const html = renderToStaticMarkup(<ProgressView topics={topics.slice(0, 3)} />);
    const rows = [...html.matchAll(/data-status="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(rows).toEqual([
      ["passed", "Passed"],
      ["in_progress", "In progress"],
      ["not_started", "Not started"],
    ]);
    expect(html).toContain("1 of 2");
  });
});
