import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TopicOverview } from "@/course/navigator";
import { CourseMapView } from "./course-map-view";

const row = (over: Partial<TopicOverview>): TopicOverview => ({
  id: "pct-demo",
  title: "Percent",
  stage: "foundation",
  subject: "Numbers & time value",
  status: "in_progress",
  step: "your_turn",
  checks: [{ id: "c1", passed: false, here: true }],
  unmetPrerequisites: [],
  current: true,
  onDefaultPath: true,
  ...over,
});

describe("a parked Topic on the Course Map", () => {
  it("says when it comes back", () => {
    // 2026-11-05 09:30 UTC is Thursday 3:00 pm in India.
    const html = renderToStaticMarkup(<CourseMapView topics={[row({ parkedUntil: new Date("2026-11-05T09:30:00Z") })]} recommended={null} />);
    expect(html).toContain('data-parked="pct-demo"');
    expect(html).toContain("Parked · back Thu 3:00 pm");
  });

  it("says nothing for a Topic with no parked Skill", () => {
    const html = renderToStaticMarkup(<CourseMapView topics={[row({ parkedUntil: null })]} recommended={null} />);
    expect(html).not.toContain("Parked");
  });
});
