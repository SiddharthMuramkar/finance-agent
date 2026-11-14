import { describe, expect, it } from "vitest";
import { isConverted, loadCourseMap } from "./map";
import { courseOverview, navigate, recordCheckResult, type Progress, type TeachingStep } from "./navigator";

// Growth and compounding split one idea per Check (spec #229, "The Concept step"; part of #248) as a content-only
// restructure: the three old Check ids stay, new quiz Checks sit between them, no Check is required, and every
// Learner keeps their saved step. Spec 2026-11-12 H1 then took the log-return Check (cp-quiz-log-return) out: a Learner
// whose place was at it moves on to the Check that now follows, and a pass saved for it is kept and ignored. These tests
// read a Learner's saved place through the Course Navigator, on the real Course Map.

const map = loadCourseMap();
const TOPIC = "num-compounding";
const topic = map.topic(TOPIC)!;

/** A Learner saved inside the Topic before the split: at `step`, with these old Checks passed. */
const inTopic = (step: TeachingStep, passed: string[], status: "in_progress" | "passed" = "in_progress"): Progress => ({
  currentTopicId: status === "passed" ? null : TOPIC,
  topics: { [TOPIC]: { step, passedChecks: passed, revealShown: step === "reveal" || step === "principle", status } },
});

/** The four quiz Checks that came before the log-return Check. */
const BEFORE_LOGS = ["cp-quiz-compounding", "cp-quiz-fall-recover", "cp-quiz-rule-72", "cp-quiz-steady-rate"];

describe("Growth and compounding's content-only split", () => {
  it("keeps the old Check ids in their order, adds one Check per idea between them, and requires none", () => {
    expect(isConverted(topic)).toBe(true);
    expect(topic.restructure).toBe("content-only");
    const ids = topic.checks.map((c) => c.id);
    expect(ids).toEqual([...BEFORE_LOGS, "cp-sensex-rate"]);
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

  describe("without its log-return Check (spec 2026-11-12 H1)", () => {
    it("is named Growth and compounding", () => {
      expect(topic.title).toBe("Growth and compounding");
    });

    it.each(["concept", "your_turn", "check"] as const)("moves a Learner saved at the removed Check's %s on to the conversation Check, at the same step", (step) => {
      const place = navigate(map, inTopic(step, BEFORE_LOGS))!;
      expect(place).toMatchObject({ topic: { id: TOPIC }, step, check: { id: "cp-sensex-rate", kind: "conversation" } });
    });

    it("keeps a saved pass of the removed Check and ignores it: the conversation Check still has to be passed, then the reveal", () => {
      const progress = inTopic("check", [...BEFORE_LOGS, "cp-quiz-log-return"]);
      expect(navigate(map, progress)).toMatchObject({ step: "check", check: { id: "cp-sensex-rate" } });
      expect(courseOverview(map, progress).find((t) => t.id === TOPIC)).toMatchObject({ status: "in_progress" });
      const moved = recordCheckResult(map, progress, "cp-sensex-rate", true);
      if (!moved.ok) throw new Error(moved.reason);
      expect(moved.progress.topics[TOPIC].passedChecks).toContain("cp-quiz-log-return");
      expect(navigate(map, moved.progress)).toMatchObject({ step: "reveal", check: null });
    });

    it("refuses a result for the removed Check, so nothing can be saved against it", () => {
      expect(recordCheckResult(map, inTopic("check", BEFORE_LOGS), "cp-quiz-log-return", true)).toMatchObject({ ok: false });
    });
  });
});
