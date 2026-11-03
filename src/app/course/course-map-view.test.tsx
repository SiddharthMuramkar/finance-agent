import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TopicOverview } from "@/course/navigator";
import { CourseMapView, ProgressView } from "./course-map-view";

const topics: TopicOverview[] = [
  { id: "compounding", title: "Compounding", stage: "foundation", subject: "Numbers & time value", status: "passed", step: null, checks: [{ id: "co-1", passed: true, here: false }], unmetPrerequisites: [], current: false, onDefaultPath: false },
  {
    id: "pv",
    title: "Present value",
    stage: "foundation",
    subject: "Numbers & time value",
    status: "in_progress",
    step: "concept",
    checks: [
      { id: "pv-1", passed: true, here: false },
      { id: "pv-2", passed: false, here: true },
    ],
    unmetPrerequisites: [],
    current: false,
    onDefaultPath: true,
  },
  { id: "bonds", title: "Bond prices", stage: "follow", subject: null, status: "not_started", step: null, checks: [{ id: "bo-1", passed: false, here: false }], unmetPrerequisites: ["pv"], current: true, onDefaultPath: false },
];

describe("the Course Map page", () => {
  it("shows Topics as stops in order, with Checks marked along the way and the Learner's place", () => {
    const html = renderToStaticMarkup(<CourseMapView topics={topics} />);
    const stops = [...html.matchAll(/data-topic="([^"]+)"/g)].map((m) => m[1]);
    expect(stops).toEqual(["compounding", "pv", "bonds"]);
    expect(html.match(/data-check="passed"/g)).toHaveLength(2);
    expect(html.match(/data-check="here"/g)).toHaveLength(1);
    expect(html).toContain("You are here");
  });

  it("offers a jump to a Topic not yet passed, with a warning that names unmet prerequisites, and a way back to the default path", () => {
    const html = renderToStaticMarkup(<CourseMapView topics={topics} />);
    expect(html).not.toMatch(/data-jump="compounding"/);
    expect(html).toMatch(/data-jump="pv"/);
    expect(html).toContain("Not yet passed: Present value");
    expect(html).toContain("Back to the default path");
  });

  it("has no way back when the Learner is already on the default path", () => {
    const onPath = topics.map((t) => ({ ...t, current: t.id === "pv" }));
    expect(renderToStaticMarkup(<CourseMapView topics={onPath} />)).not.toContain("Back to the default path");
  });

  it("groups Topics under four Stage headings in course order, with a Subject pill on Foundation rows only", () => {
    const more: TopicOverview[] = [
      { ...topics[2], id: "j", title: "Judge one", stage: "judge", current: false },
      { ...topics[2], id: "a", title: "Analyse one", stage: "analyse", current: false },
    ];
    const html = renderToStaticMarkup(<CourseMapView topics={[...topics, ...more]} />);
    expect([...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Foundation", "Follow", "Judge", "Analyse"]);
    expect(html.match(/Numbers &amp; time value/g)).toHaveLength(2);
    const bondsRow = html.split('data-topic="bonds"')[1].split("</li></ol>")[0];
    expect(bondsRow).not.toContain("Numbers");
  });

  it("is an ordinary page that renders the same markup every time from the same progress", () => {
    expect(renderToStaticMarkup(<CourseMapView topics={topics} />)).toBe(renderToStaticMarkup(<CourseMapView topics={topics} />));
  });
});

describe("the progress view", () => {
  it("shows each Topic's status as not started, in progress or passed, with Checks passed", () => {
    const html = renderToStaticMarkup(<ProgressView topics={topics} />);
    const rows = [...html.matchAll(/data-status="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(rows).toEqual([
      ["passed", "Passed"],
      ["in_progress", "In progress"],
      ["not_started", "Not started"],
    ]);
    expect(html).toContain("1 of 2");
  });

  it("has a title and a summary of where the Learner stands, with Next from What comes next", () => {
    const html = renderToStaticMarkup(<ProgressView topics={topics} next="Bond prices" />);
    expect(html).toMatch(/<h1[^>]*>Progress<\/h1>/);
    expect(html).toContain("1 in progress · 1 passed · Next: Bond prices");
  });

  it("leaves Next out of the summary when nothing comes next", () => {
    const html = renderToStaticMarkup(<ProgressView topics={topics} next={null} />);
    expect(html).toContain("1 in progress · 1 passed");
    expect(html).not.toContain("Next:");
  });

  it("links every row to its Topic: choosing it opens that Topic in the Study Workspace", () => {
    const html = renderToStaticMarkup(<ProgressView topics={topics} next="Bond prices" />);
    const rows = [...html.matchAll(/<form[^>]*action="\/api\/open"[^>]*>.*?name="topic" value="([^"]+)".*?<button[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
    expect(rows).toEqual([
      ["compounding", "Compounding"],
      ["pv", "Present value"],
      ["bonds", "Bond prices"],
    ]);
    expect(html).toMatch(/<form[^>]*method="post"/);
  });

  it("has no About you link (About you lives in Settings)", () => {
    const html = renderToStaticMarkup(<ProgressView topics={topics} next="Bond prices" />);
    expect(html).not.toContain("About you");
    expect(html).not.toContain("/profile");
  });
});

describe("the in-progress status wording", () => {
  it("reads as a phrase, not 'at the your turn step'", () => {
    const html = renderToStaticMarkup(<CourseMapView topics={topics.map((t) => (t.status === "in_progress" ? { ...t, step: "your_turn" as const } : t))} />);
    expect(html).toContain("In progress · Teaching Step: your turn");
    expect(html).not.toContain("at the");
  });
});

describe("Topics not written yet", () => {
  it("shows them as coming, not as stops the Learner can jump to", () => {
    const coming = [
      { id: "bond-pricing", title: "Bond basics and pricing", stage: "foundation" as const },
      { id: "fol-erp", title: "Follow: The Price of Risk", stage: "follow" as const },
    ];
    const html = renderToStaticMarkup(<CourseMapView topics={topics} coming={coming} />);
    expect(html).toContain("Coming");
    expect(html).toContain("Bond basics and pricing");
    expect(html).not.toMatch(/data-jump="bond-pricing"/);
    expect([...html.matchAll(/data-coming="([^"]+)"/g)].map((m) => m[1])).toEqual(["bond-pricing", "fol-erp"]);
  });
});

