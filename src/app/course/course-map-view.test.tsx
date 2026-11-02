import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TopicOverview } from "@/course/navigator";
import { CourseMapView, ProgressView } from "./course-map-view";

const topics: TopicOverview[] = [
  { id: "compounding", title: "Compounding", stage: "foundation", status: "passed", step: null, checks: [{ id: "co-1", passed: true, here: false }], unmetPrerequisites: [], current: false, onDefaultPath: false },
  {
    id: "pv",
    title: "Present value",
    stage: "foundation",
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
  { id: "bonds", title: "Bond prices", stage: "follow", status: "not_started", step: null, checks: [{ id: "bo-1", passed: false, here: false }], unmetPrerequisites: ["pv"], current: true, onDefaultPath: false },
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
});
