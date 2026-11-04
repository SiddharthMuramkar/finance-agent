import { describe, expect, it } from "vitest";
import { isConverted, loadCourseMap } from "./map";
import { courseOverview, navigate, type Progress, type TeachingStep } from "./navigator";

// Growth, compounding and logs split one idea per Check (spec #229, "The Concept step"; part of #248) as a content-only
// restructure: the three old Check ids stay, three new quiz Checks sit between them, no Check is required, and every
// Learner keeps their saved step. These tests read a Learner's saved place before the split through the Course
// Navigator, on the real Course Map.

const map = loadCourseMap();
const TOPIC = "num-compounding";
const topic = map.topic(TOPIC)!;

/** A Learner saved inside the Topic before the split: at `step`, with these old Checks passed. */
const inTopic = (step: TeachingStep, passed: string[], status: "in_progress" | "passed" = "in_progress"): Progress => ({
  currentTopicId: status === "passed" ? null : TOPIC,
  topics: { [TOPIC]: { step, passedChecks: passed, revealShown: step === "reveal" || step === "principle", status } },
});

describe("Growth, compounding and logs' content-only split", () => {
  it("keeps the old Check ids in their order, adds one Check per idea between them, and requires none", () => {
    expect(isConverted(topic)).toBe(true);
    expect(topic.restructure).toBe("content-only");
    const ids = topic.checks.map((c) => c.id);
    expect(ids).toEqual(["cp-quiz-compounding", "cp-quiz-fall-recover", "cp-quiz-rule-72", "cp-quiz-steady-rate", "cp-quiz-log-return", "cp-sensex-rate"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("leaves a Learner who passed the Topic passed, with no Due Check, and does not pull them back", () => {
    const progress = inTopic("principle", ["cp-quiz-compounding", "cp-quiz-steady-rate", "cp-sensex-rate"], "passed");
    const place = navigate(map, progress)!;
    expect(place.topic.id).not.toBe(TOPIC);
    expect(place.dueChecks).toEqual([]);
    expect(courseOverview(map, progress).find((t) => t.id === TOPIC)).toMatchObject({ status: "passed" });
  });

  it("keeps a Learner at Check 1's Your turn there, now practising compound growth alone", () => {
    const place = navigate(map, inTopic("your_turn", []))!;
    expect(place).toMatchObject({ step: "your_turn", check: { id: "cp-quiz-compounding" } });
    expect(place.check!.card!.skills).toEqual(["compound-growth"]);
  });

  it("takes a Learner who passed the old Check 1 and stood at the old Check 2's concept to the first new card, on fall and recover", () => {
    const place = navigate(map, inTopic("concept", ["cp-quiz-compounding"]))!;
    expect(place).toMatchObject({ step: "concept", check: { id: "cp-quiz-fall-recover" } });
    expect(place.check!.card!.skills).toEqual(["fall-and-recover"]);
  });

  it("keeps a Learner at the reveal with both old quizzes and the conversation passed at the reveal, though the new Checks are not passed", () => {
    const place = navigate(map, inTopic("reveal", ["cp-quiz-compounding", "cp-quiz-steady-rate", "cp-sensex-rate"]))!;
    expect(place).toMatchObject({ step: "reveal", check: null, next: "principle" });
  });
});
