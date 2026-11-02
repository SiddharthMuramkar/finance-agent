import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap } from "./map";
import { courseOverview, finishStep, jumpTo, navigate, recordCheckResult, returnToDefaultPath, type Progress, type TopicProgress } from "./navigator";

function topicFile(id: string, path: number, checks: { id: string; required?: boolean }[], prerequisites: string[] = []) {
  const text = [
    `id: ${id}`,
    `title: Topic ${id}`,
    "stage: foundation",
    `path: ${path}`,
    `prerequisites: [${prerequisites.join(", ")}]`,
    "cases:",
    `  - { id: ${id}-case, title: Case, asOf: 2018-10-24, story: Then., reveal: After. }`,
    "concept: Idea.",
    "principle: Lesson.",
    "checks:",
    ...checks.map(
      (c) => `  - { id: ${c.id}, kind: conversation, prompt: Q, passCriteria: A, required: ${c.required ?? false} }`,
    ),
  ].join("\n");
  return { name: `${id}.yaml`, text };
}

function courseMap(...files: ReturnType<typeof topicFile>[]): CourseMap {
  const { map, errors } = parseCourseMap(files);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const empty: Progress = { currentTopicId: null, topics: {} };

/** Applies a run of legal moves, failing loudly if any is rejected. */
function play(map: CourseMap, progress: Progress, moves: (string | { pass: string } | { fail: string })[]) {
  return moves.reduce((p, move) => {
    const result =
      typeof move === "string"
        ? finishStep(map, p, move as never)
        : "pass" in move
          ? recordCheckResult(map, p, move.pass, true)
          : recordCheckResult(map, p, move.fail, false);
    if (!result.ok) throw new Error(result.reason);
    return result.progress;
  }, progress);
}

const twoChecks = courseMap(
  topicFile("pv", 20, [{ id: "pv-1" }, { id: "pv-2" }]),
  topicFile("statements", 30, [{ id: "st-1" }], ["pv"]),
  topicFile("compounding", 10, [{ id: "co-1" }]),
);

describe("Course Navigator", () => {
  it("starts a new Learner at the story of the first Topic on the default path", () => {
    const place = navigate(twoChecks, empty);
    expect(place).toMatchObject({ status: "not_started", step: "story", check: null, next: "concept" });
    expect(place?.topic.id).toBe("compounding");
  });

  it("runs story, then concept, your turn and Check for each Check, then reveal and principle", () => {
    const seen: string[] = [];
    let progress: Progress = { currentTopicId: "pv", topics: {} };
    const record = () => {
      const p = navigate(twoChecks, progress)!;
      seen.push(p.check ? `${p.step}:${p.check.id}` : p.step);
    };
    record();
    for (const move of ["story", "concept", "your_turn", { pass: "pv-1" }, "concept", "your_turn", { pass: "pv-2" }, "reveal"] as const) {
      progress = play(twoChecks, progress, [move]);
      record();
    }
    expect(seen).toEqual([
      "story",
      "concept:pv-1",
      "your_turn:pv-1",
      "check:pv-1",
      "concept:pv-2",
      "your_turn:pv-2",
      "check:pv-2",
      "reveal",
      "principle",
    ]);
  });

  it("rejects an illegal next step and leaves progress unchanged", () => {
    const progress = play(twoChecks, empty, ["story"]);
    expect(finishStep(twoChecks, progress, "reveal")).toEqual({
      ok: false,
      reason: 'Cannot finish "reveal": the current Teaching Step is "concept".',
    });
    expect(finishStep(twoChecks, progress, "story")).toMatchObject({ ok: false });
    expect(navigate(twoChecks, progress)?.step).toBe("concept");
  });

  it("moves past a Check step only through a saved Check result", () => {
    const atCheck = play(twoChecks, { currentTopicId: "pv", topics: {} }, ["story", "concept", "your_turn"]);
    expect(finishStep(twoChecks, atCheck, "check")).toEqual({
      ok: false,
      reason: "Only a saved Check result moves past a Check step.",
    });
  });

  it("keeps a Learner who did not pass at the same Check", () => {
    const atCheck = play(twoChecks, { currentTopicId: "pv", topics: {} }, ["story", "concept", "your_turn"]);
    const after = play(twoChecks, atCheck, [{ fail: "pv-1" }, { fail: "pv-1" }]);
    expect(navigate(twoChecks, after)).toMatchObject({ step: "check", check: { id: "pv-1" } });
  });

  it("rejects a Check result for any Check other than the current one", () => {
    const atCheck = play(twoChecks, { currentTopicId: "pv", topics: {} }, ["story", "concept", "your_turn"]);
    expect(recordCheckResult(twoChecks, atCheck, "pv-2", true)).toEqual({
      ok: false,
      reason: 'Check "pv-2" is not the current Check; the current Check is "pv-1".',
    });
    const atConcept = play(twoChecks, { currentTopicId: "pv", topics: {} }, ["story"]);
    expect(recordCheckResult(twoChecks, atConcept, "pv-1", true)).toMatchObject({ ok: false });
  });

  it("opens the reveal only after the last Check passes, and saves that it was shown", () => {
    const beforeLast = play(twoChecks, { currentTopicId: "pv", topics: {} }, ["story", "concept", "your_turn", { pass: "pv-1" }]);
    expect(beforeLast.topics.pv.revealShown).toBe(false);
    const afterLast = play(twoChecks, beforeLast, ["concept", "your_turn", { pass: "pv-2" }]);
    expect(afterLast.topics.pv).toMatchObject({ step: "reveal", revealShown: true });
  });

  it("passes a Topic only when its principle finishes, then returns to the default path", () => {
    const atPrinciple = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal"]);
    expect(atPrinciple.topics.compounding.status).toBe("in_progress");
    const done = play(twoChecks, atPrinciple, ["principle"]);
    expect(done.topics.compounding.status).toBe("passed");
    expect(navigate(twoChecks, done)).toMatchObject({ topic: { id: "pv" }, step: "story", status: "not_started" });
  });

  it("reports unmet prerequisites without blocking the Topic", () => {
    const place = navigate(twoChecks, { currentTopicId: "statements", topics: {} });
    expect(place).toMatchObject({ topic: { id: "statements" }, unmetPrerequisites: ["pv"] });
  });

  it("returns null when every Topic is passed", () => {
    const passed: TopicProgress = { step: "principle", passedChecks: [], revealShown: true, status: "passed" };
    expect(navigate(twoChecks, { currentTopicId: null, topics: { pv: passed, statements: passed, compounding: passed } })).toBeNull();
  });

  describe("jumps", () => {
    it("reports a chosen Topic's unmet prerequisites so the Learner can be warned, then makes it the current Topic", () => {
      const jump = jumpTo(twoChecks, empty, "statements");
      expect(jump).toMatchObject({ ok: true, unmetPrerequisites: ["pv"] });
      if (!jump.ok) return;
      expect(jump.progress.currentTopicId).toBe("statements");
      expect(navigate(twoChecks, jump.progress)).toMatchObject({ topic: { id: "statements" }, step: "story", status: "not_started" });
    });

    it("reports no unmet prerequisites for a Topic whose prerequisites are passed", () => {
      expect(jumpTo(twoChecks, empty, "pv")).toMatchObject({ ok: true, unmetPrerequisites: [] });
    });

    it("rejects a Topic that is not on the Course Map, or one already passed", () => {
      expect(jumpTo(twoChecks, empty, "nowhere")).toEqual({ ok: false, reason: 'Topic "nowhere" is not on the Course Map.' });
      const done = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
      expect(jumpTo(twoChecks, done, "compounding")).toEqual({ ok: false, reason: 'Topic "compounding" is already passed.' });
    });

    it("keeps other part-finished Topics' progress, so jumping back resumes where the Learner left off", () => {
      const halfwayCompounding = play(twoChecks, empty, ["story", "concept"]);
      const jump = jumpTo(twoChecks, halfwayCompounding, "pv");
      if (!jump.ok) throw new Error(jump.reason);
      const inPv = play(twoChecks, jump.progress, ["story"]);
      expect(inPv.topics.compounding).toEqual(halfwayCompounding.topics.compounding);
      const back = jumpTo(twoChecks, inPv, "compounding");
      if (!back.ok) throw new Error(back.reason);
      expect(navigate(twoChecks, back.progress)).toMatchObject({ topic: { id: "compounding" }, step: "your_turn", status: "in_progress" });
      expect(back.progress.topics.pv).toMatchObject({ step: "concept", status: "in_progress" });
    });

    it("going back returns to the default path, leaving the chosen Topic's progress as it was", () => {
      const jump = jumpTo(twoChecks, empty, "statements");
      if (!jump.ok) throw new Error(jump.reason);
      const started = play(twoChecks, jump.progress, ["story"]);
      const back = returnToDefaultPath(started);
      expect(back.currentTopicId).toBeNull();
      expect(back.topics.statements).toEqual(started.topics.statements);
      expect(navigate(twoChecks, back)?.topic.id).toBe("compounding");
    });

    it("passing the chosen Topic returns the Learner to the default path", () => {
      const jump = jumpTo(twoChecks, empty, "pv");
      if (!jump.ok) throw new Error(jump.reason);
      const passed = play(twoChecks, jump.progress, ["story", "concept", "your_turn", { pass: "pv-1" }, "concept", "your_turn", { pass: "pv-2" }, "reveal", "principle"]);
      expect(passed.currentTopicId).toBeNull();
      expect(navigate(twoChecks, passed)).toMatchObject({ topic: { id: "compounding" }, status: "not_started" });
    });

    it("an off-map question changes nothing: the place is computed from progress alone", () => {
      const progress = play(twoChecks, empty, ["story"]);
      expect(navigate(twoChecks, progress)).toEqual(navigate(twoChecks, structuredClone(progress)));
    });
  });

  describe("course overview", () => {
    it("lists every Topic in default-path order with its status, Checks marked passed, and the Learner's place", () => {
      const progress = play(twoChecks, { currentTopicId: "pv", topics: {} }, ["story", "concept", "your_turn", { pass: "pv-1" }]);
      const view = courseOverview(twoChecks, progress);
      expect(view.map((t) => [t.id, t.status, t.current])).toEqual([
        ["compounding", "not_started", false],
        ["pv", "in_progress", true],
        ["statements", "not_started", false],
      ]);
      expect(view[1].checks).toEqual([
        { id: "pv-1", passed: true, here: false },
        { id: "pv-2", passed: false, here: true },
      ]);
      expect(view[1].step).toBe("concept");
      expect(view[2].unmetPrerequisites).toEqual(["pv"]);
      expect(view[0].onDefaultPath).toBe(true);
    });

    it("marks a passed Topic as passed and the next default-path Topic as the place once the chosen Topic is passed", () => {
      const done = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
      const view = courseOverview(twoChecks, done);
      expect(view.map((t) => [t.id, t.status, t.current])).toEqual([
        ["compounding", "passed", false],
        ["pv", "not_started", true],
        ["statements", "not_started", false],
      ]);
      expect(view[0].checks).toEqual([{ id: "co-1", passed: true, here: false }]);
    });

    it("shows the default-path Topic apart from a chosen one, so the Learner can see where going back leads", () => {
      const jump = jumpTo(twoChecks, empty, "statements");
      if (!jump.ok) throw new Error(jump.reason);
      const view = courseOverview(twoChecks, jump.progress);
      expect(view.find((t) => t.current)?.id).toBe("statements");
      expect(view.find((t) => t.onDefaultPath)?.id).toBe("compounding");
    });
  });

  describe("Course Map edits", () => {
    const halfway = play(twoChecks, { currentTopicId: "pv", topics: {} }, ["story", "concept", "your_turn", { pass: "pv-1" }]);

    it("places the Learner at the first Check without a pass after a Check is inserted before it", () => {
      const edited = courseMap(topicFile("pv", 20, [{ id: "pv-0" }, { id: "pv-1" }, { id: "pv-2" }]));
      expect(navigate(edited, halfway)).toMatchObject({ step: "concept", check: { id: "pv-0" } });
    });

    it("ignores the records of a removed Check", () => {
      const edited = courseMap(topicFile("pv", 20, [{ id: "pv-2" }]));
      expect(navigate(edited, halfway)).toMatchObject({ step: "concept", check: { id: "pv-2" } });
    });

    it("moves to the reveal when the remaining Check is removed", () => {
      const edited = courseMap(topicFile("pv", 20, [{ id: "pv-1" }]));
      expect(navigate(edited, halfway)).toMatchObject({ step: "reveal", check: null });
    });

    it("makes a Check inserted into a passed Topic due only if it is required", () => {
      const done = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
      const optional = courseMap(topicFile("compounding", 10, [{ id: "co-1" }, { id: "co-2" }]), topicFile("pv", 20, [{ id: "pv-1" }]));
      const required = courseMap(topicFile("compounding", 10, [{ id: "co-1" }, { id: "co-2", required: true }]), topicFile("pv", 20, [{ id: "pv-1" }]));
      expect(navigate(optional, done)?.dueChecks).toEqual([]);
      expect(navigate(required, done)?.dueChecks.map((c) => c.id)).toEqual(["co-2"]);
      // The Topic stays passed, so it still counts as a met prerequisite.
      expect(navigate(required, done)).toMatchObject({ topic: { id: "compounding" }, status: "passed" });
      expect(navigate(optional, done)?.topic.id).toBe("pv");
    });

    it("takes the Learner through a due Check before a new Topic, then returns to the default path with the Topic still passed", () => {
      const done = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
      const required = courseMap(topicFile("compounding", 10, [{ id: "co-1" }, { id: "co-2", required: true }]), topicFile("pv", 20, [{ id: "pv-1" }]));
      expect(navigate(required, done)).toMatchObject({ topic: { id: "compounding" }, step: "concept", check: { id: "co-2" } });
      expect(finishStep(required, done, "reveal")).toMatchObject({ ok: false });
      const atCheck = play(required, done, ["concept", "your_turn"]);
      expect(navigate(required, atCheck)).toMatchObject({ step: "check", check: { id: "co-2" }, unmetPrerequisites: [] });
      const after = play(required, atCheck, [{ fail: "co-2" }, { pass: "co-2" }]);
      expect(after.topics.compounding).toMatchObject({ status: "passed", step: "principle" });
      expect(navigate(required, after)).toMatchObject({ topic: { id: "pv" }, status: "not_started", dueChecks: [] });
      expect(finishStep(required, { ...after, currentTopicId: "compounding" }, "principle")).toMatchObject({ ok: false });
    });

    it("after a reorder of Checks, keeps every pass and changes only what comes next", () => {
      const reordered = courseMap(topicFile("pv", 20, [{ id: "pv-2" }, { id: "pv-1" }]), topicFile("compounding", 10, [{ id: "co-1" }]));
      expect(navigate(reordered, halfway)).toMatchObject({ topic: { id: "pv" }, step: "concept", check: { id: "pv-2" } });
      const atFirstAgain = { ...halfway, topics: { pv: { ...halfway.topics.pv, passedChecks: [] } } };
      expect(navigate(reordered, atFirstAgain)).toMatchObject({ check: { id: "pv-2" } });
    });

    it("after a reorder of Topics on the default path, keeps a started Topic current and only changes which new Topic comes next", () => {
      const started = play(twoChecks, empty, ["story"]);
      const reordered = courseMap(
        topicFile("pv", 5, [{ id: "pv-1" }, { id: "pv-2" }]),
        topicFile("statements", 30, [{ id: "st-1" }], ["pv"]),
        topicFile("compounding", 10, [{ id: "co-1" }]),
      );
      expect(navigate(reordered, started)).toMatchObject({ topic: { id: "compounding" }, step: "concept" });
      expect(navigate(reordered, empty)?.topic.id).toBe("pv");
      const done = play(reordered, started, ["concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
      expect(navigate(reordered, done)?.topic.id).toBe("pv");
    });

    it("forgets a chosen Topic that was removed from the Course Map and returns to the default path, keeping its records", () => {
      const jump = jumpTo(twoChecks, empty, "statements");
      if (!jump.ok) throw new Error(jump.reason);
      const started = play(twoChecks, jump.progress, ["story"]);
      const removed = courseMap(topicFile("pv", 20, [{ id: "pv-1" }, { id: "pv-2" }]), topicFile("compounding", 10, [{ id: "co-1" }]));
      expect(navigate(removed, started)?.topic.id).toBe("compounding");
      expect(courseOverview(removed, started).map((t) => t.id)).toEqual(["compounding", "pv"]);
      expect(started.topics.statements).toBeDefined();
    });

    it("an inserted Topic shows on the overview as not started without disturbing the place", () => {
      const inserted = courseMap(
        topicFile("pv", 20, [{ id: "pv-1" }, { id: "pv-2" }]),
        topicFile("statements", 30, [{ id: "st-1" }], ["pv"]),
        topicFile("compounding", 10, [{ id: "co-1" }]),
        topicFile("inflation", 15, [{ id: "in-1" }]),
      );
      expect(navigate(inserted, halfway)).toMatchObject({ topic: { id: "pv" }, check: { id: "pv-2" } });
      expect(courseOverview(inserted, halfway).map((t) => [t.id, t.status])).toEqual([
        ["compounding", "not_started"],
        ["inflation", "not_started"],
        ["pv", "in_progress"],
        ["statements", "not_started"],
      ]);
    });

    it("an added prerequisite shows as unmet when jumping to a Topic not yet started, and does not block the jump", () => {
      const edited = courseMap(topicFile("pv", 20, [{ id: "pv-1" }, { id: "pv-2" }]), topicFile("compounding", 10, [{ id: "co-1" }], ["pv"]));
      expect(jumpTo(edited, empty, "compounding")).toMatchObject({ ok: true, unmetPrerequisites: ["pv"] });
    });

    it("keeps a started Topic current when a new prerequisite is added, reporting it as unmet", () => {
      const edited = courseMap(topicFile("pv", 20, [{ id: "pv-1" }, { id: "pv-2" }], ["compounding"]), topicFile("compounding", 10, [{ id: "co-1" }]));
      expect(navigate(edited, halfway)).toMatchObject({ topic: { id: "pv" }, unmetPrerequisites: ["compounding"] });
    });
  });
});
