import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap } from "./map";
import { courseOverview, finishStep, navigate, recordCheckResult, TEACHING_STEPS, type Progress, type TopicProgress } from "./navigator";

/** Course Navigator tests for the explore Teaching Step (ADR 0001). */

function topicFile(id: string, path: number, checks: string[], explore?: { before: string; requiredWhenPassed?: boolean }) {
  const lines = [
    `id: ${id}`,
    `title: Topic ${id}`,
    "stage: foundation",
    `path: ${path}`,
    "prerequisites: []",
    "cases:",
    `  - { id: ${id}-case, title: Case, asOf: 2018-10-24, story: Then., reveal: After. }`,
    "concept: Idea.",
    "principle: Lesson.",
    "checks:",
    ...checks.map((c) => `  - { id: ${c}, kind: conversation, prompt: Q, passCriteria: A }`),
  ];
  if (explore) {
    lines.push(
      "insight:",
      "  question: What do you notice?",
      "  written: Later payments shrink.",
      "  foundWhen: The Learner says later payments shrink.",
      "  hints: [Look at the far bars., Compare now with later.]",
      "explore:",
      `  before: ${explore.before}`,
      `  requiredWhenPassed: ${explore.requiredWhenPassed ?? false}`,
    );
  }
  return { name: `${id}.yaml`, text: lines.join("\n") };
}

function courseMap(...files: ReturnType<typeof topicFile>[]): CourseMap {
  const { map, errors } = parseCourseMap(files);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

/** Applies a run of legal moves, failing loudly if any is rejected. */
function play(map: CourseMap, progress: Progress, moves: (string | { pass: string })[]) {
  return moves.reduce((p, move) => {
    const result = typeof move === "string" ? finishStep(map, p, move as never) : recordCheckResult(map, p, move.pass, true);
    if (!result.ok) throw new Error(result.reason);
    return result.progress;
  }, progress);
}

const withInsight = (progress: Progress, topicId: string, insight: "found" | "told" = "found"): Progress => ({
  ...progress,
  topics: { ...progress.topics, [topicId]: { ...progress.topics[topicId], insight } },
});

const where = (map: CourseMap, progress: Progress) => {
  const p = navigate(map, progress)!;
  return p.check ? `${p.step}:${p.check.id}` : p.step;
};

const map = courseMap(topicFile("iv", 10, ["iv-1", "iv-2"], { before: "iv-2" }), topicFile("plain", 20, ["pl-1"]));
const start: Progress = { currentTopicId: "iv", topics: {} };
const atExplore = () => play(map, start, ["story", "concept", "your_turn", { pass: "iv-1" }, "concept"]);

describe("Course Navigator: the explore step", () => {
  it("has seven Teaching Steps, with explore between concept and your turn", () => {
    expect(TEACHING_STEPS).toEqual(["story", "concept", "explore", "your_turn", "check", "reveal", "principle"]);
  });

  it("comes once, after the concept of the anchor Check and before its your turn", () => {
    let p = play(map, start, ["story", "concept", "your_turn", { pass: "iv-1" }]);
    expect(where(map, p)).toBe("concept:iv-2");
    expect(navigate(map, p)?.next).toBe("explore");
    p = play(map, p, ["concept"]);
    expect(where(map, p)).toBe("explore:iv-2");
    expect(navigate(map, p)?.next).toBe("your_turn");
    p = play(map, withInsight(p, "iv"), ["explore"]);
    expect(where(map, p)).toBe("your_turn:iv-2");
    p = play(map, p, ["your_turn", { pass: "iv-2" }]);
    expect(where(map, p)).toBe("reveal");
  });

  it("is skipped for a Topic without an Insight", () => {
    const plain: Progress = { currentTopicId: "plain", topics: {} };
    expect(navigate(map, play(map, plain, ["story"]))?.next).toBe("your_turn");
    expect(where(map, play(map, plain, ["story", "concept"]))).toBe("your_turn:pl-1");
  });

  it("refuses to finish explore until the Insight is found or told", () => {
    const refused = finishStep(map, atExplore(), "explore");
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/Insight/);
    expect(finishStep(map, withInsight(atExplore(), "iv", "told"), "explore")).toMatchObject({ ok: true });
  });

  it("gives a passed Topic explore back only when the Topic marks it as required", () => {
    const passed: TopicProgress = { step: "principle", passedChecks: ["iv-1", "iv-2"], revealShown: true, status: "passed" };
    const due: Progress = { currentTopicId: null, topics: { iv: passed } };
    expect(navigate(map, due)?.topic.id).toBe("plain");

    const required = courseMap(topicFile("iv", 10, ["iv-1", "iv-2"], { before: "iv-2", requiredWhenPassed: true }), topicFile("plain", 20, ["pl-1"]));
    expect(navigate(required, due)).toMatchObject({ topic: { id: "iv" }, step: "explore", status: "passed" });
    expect(finishStep(required, due, "explore")).toMatchObject({ ok: false });
    // Recording the attempt saves the step as explore, so the step stays open until the Tutor finishes it.
    const told = withInsight({ ...due, topics: { iv: { ...passed, step: "explore" } } }, "iv", "told");
    expect(navigate(required, told)).toMatchObject({ topic: { id: "iv" }, step: "explore" });
    const done = play(required, told, ["explore"]);
    expect(navigate(required, done)?.topic.id).toBe("plain");
    expect(done.topics.iv.status).toBe("passed");
  });

  it("leaves a Learner at the anchor's own steps where they are, then sends them through explore before the reveal", () => {
    const atAnchor: Progress = { currentTopicId: "iv", topics: { iv: { step: "check", passedChecks: ["iv-1"], revealShown: false, status: "in_progress" } } };
    expect(where(map, atAnchor)).toBe("check:iv-2");
    const lastPass = play(map, atAnchor, [{ pass: "iv-2" }]);
    expect(where(map, lastPass)).toBe("explore:iv-2");
    expect(lastPass.topics.iv.revealShown).toBe(false);
    const toReveal = play(map, withInsight(lastPass, "iv"), ["explore"]);
    expect(where(map, toReveal)).toBe("reveal");
    expect(toReveal.topics.iv.revealShown).toBe(true);
  });

  it("does not pull a Learner whose reveal was already shown back to explore", () => {
    const atReveal: Progress = { currentTopicId: "iv", topics: { iv: { step: "reveal", passedChecks: ["iv-1", "iv-2"], revealShown: true, status: "in_progress" } } };
    expect(where(map, atReveal)).toBe("reveal");
  });

  it("shows the explore step on the Course Map overview", () => {
    const row = courseOverview(map, atExplore()).find((t) => t.id === "iv");
    expect(row).toMatchObject({ step: "explore", status: "in_progress", current: true });
    expect(row?.checks).toEqual([
      { id: "iv-1", passed: true, here: false },
      { id: "iv-2", passed: false, here: true },
    ]);
  });
});
