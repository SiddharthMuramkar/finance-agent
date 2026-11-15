import { stringify } from "yaml";
import { describe, expect, it, vi } from "vitest";
import { loadCourseMap, parseCourseMap, type Topic } from "@/course/map";
import { navigate, type Progress, type TopicProgress } from "@/course/navigator";
import { presentValueOnly } from "@/test/present-value-map";
import { continueLine, homeButton } from "./home-button";

// The member's Continue button keeps the old Home's button rule (moved from _landing/landing.test.tsx).
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("no database in this test");
  },
}));

describe("the Continue button rule: What comes next, in the Course Navigator's order", () => {
  const map = presentValueOnly({ withoutQuiz: true });
  const pv = map.topic("present-value")!;
  const passed = (topic: Topic): TopicProgress => ({ step: "principle", passedChecks: topic.checks.map((c) => c.id), revealShown: true, status: "passed", insight: "found" });
  const progress = (topics: Progress["topics"], currentTopicId: string | null = null): Progress => ({ currentTopicId, topics });

  it("is Open once every Topic is passed and nothing is due", () => expect(homeButton(map, progress({ [pv.id]: passed(pv) }))).toEqual({ kind: "open" }));
  it("is Start for a Learner who has started nothing", () => expect(homeButton(map, progress({}))).toEqual({ kind: "start", topic: pv.title }));
  it("is Resume for the chosen Topic in progress", () =>
    expect(homeButton(map, progress({ [pv.id]: { step: "concept", passedChecks: [], revealShown: false, status: "in_progress" } }, pv.id))).toEqual({ kind: "resume", topic: pv.title }));
  it("is Start for a chosen Topic not yet started", () => {
    const real = loadCourseMap();
    const [first, second] = real.topics;
    expect(homeButton(real, progress({ [first.id]: passed(first) }, second.id))).toEqual({ kind: "start", topic: second.title });
  });
  it("is New in <Topic>: Check N → for a passed Topic with a Check due", () => {
    const text = stringify({ ...pv, connections: undefined, prerequisites: [], checks: [...pv.checks, { id: "pv-new", kind: "conversation", prompt: "Which?", passCriteria: "Compares.", required: true }] });
    const edited = parseCourseMap([{ name: "present-value.yaml", text }]).map!;
    expect(homeButton(edited, progress({ [pv.id]: passed(pv) }))).toEqual({ kind: "next", label: `New in ${pv.title}: Check ${pv.checks.length + 1} →` });
  });
  it("is Next Topic: <title> → after a Topic is passed", () => {
    const real = loadCourseMap();
    const first = real.topic("spine-01-worth")!;
    const done = progress({ [first.id]: passed(first) });
    const next = navigate(real, done)!.topic;
    expect(next.id).not.toBe(first.id);
    expect(homeButton(real, done)).toEqual({ kind: "next", label: `Next Topic: ${next.title} →` });
  });
});

describe("the Continue button's sub-line", () => {
  it("names the Topic, What comes next, or the fallback", () => {
    expect(continueLine({ kind: "resume", topic: "Present value" }, "Study Workspace")).toBe("Present value");
    expect(continueLine({ kind: "next", label: "Next Topic: X →" }, "Study Workspace")).toBe("Next Topic: X →");
    expect(continueLine({ kind: "open" }, "Study Workspace")).toBe("Study Workspace");
  });
});
