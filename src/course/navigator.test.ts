import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "./map";
import {
  courseOverview,
  finishStep,
  jumpTo,
  navigate,
  recordCheckResult,
  returnToDefaultPath,
  reviewsDue,
  nextOffer,
  stepSequence,
  takeNext,
  whatComesNext,
  type Progress,
  type TopicProgress,
} from "./navigator";

function topicFile(
  id: string,
  path: number,
  checks: { id: string; required?: boolean }[],
  prerequisites: string[] = [],
  explore?: { before: string; requiredWhenPassed?: boolean },
) {
  const lines = [
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

    it("carries each Topic's Subject, or null when it has none", () => {
      const withSubject = { ...twoChecks, topics: twoChecks.topics.map((t) => (t.id === "pv" ? { ...t, subject: "Numbers & time value" as const } : t)) };
      expect(courseOverview(withSubject, empty).map((t) => t.subject)).toEqual([null, "Numbers & time value", null]);
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

describe("Teaching Steps: the step sequence", () => {
  const labels = (map: CourseMap, progress: Progress, topicId: string) => stepSequence(map, progress, topicId)!.steps.map((s) => s.label);

  it("numbers Percent's twelve steps, with Step 2 of 12 · Concept second", () => {
    const course = loadCourseMap();
    expect(labels(course, empty, "num-percent-bps")).toEqual([
      "Step 1 of 12 · Story",
      "Step 2 of 12 · Concept",
      "Step 3 of 12 · Your turn",
      "Step 4 of 12 · Check",
      "Step 5 of 12 · Concept",
      "Step 6 of 12 · Your turn",
      "Step 7 of 12 · Check",
      "Step 8 of 12 · Concept",
      "Step 9 of 12 · Your turn",
      "Step 10 of 12 · Check",
      "Step 11 of 12 · Reveal",
      "Step 12 of 12 · Principle",
    ]);
  });

  const insightMap = courseMap(
    topicFile("plain", 10, [{ id: "pl-1" }]),
    topicFile("annuity", 20, [{ id: "an-1" }, { id: "an-2" }], [], { before: "an-2" }),
  );

  it("puts Explore once, only in a Topic with an Insight, after the Concept of the Check that tests it", () => {
    expect(labels(insightMap, empty, "plain")).toEqual([
      "Step 1 of 6 · Story",
      "Step 2 of 6 · Concept",
      "Step 3 of 6 · Your turn",
      "Step 4 of 6 · Check",
      "Step 5 of 6 · Reveal",
      "Step 6 of 6 · Principle",
    ]);
    expect(labels(insightMap, empty, "annuity")).toEqual([
      "Step 1 of 10 · Story",
      "Step 2 of 10 · Concept",
      "Step 3 of 10 · Your turn",
      "Step 4 of 10 · Check",
      "Step 5 of 10 · Concept",
      "Step 6 of 10 · Explore",
      "Step 7 of 10 · Your turn",
      "Step 8 of 10 · Check",
      "Step 9 of 10 · Reveal",
      "Step 10 of 10 · Principle",
    ]);
  });

  it("groups the steps by Check for the strip", () => {
    const groups = stepSequence(insightMap, empty, "annuity")!.groups.map((g) => [g.check ? `Check ${g.check.number}` : null, g.steps.map((s) => s.step)]);
    expect(groups).toEqual([
      [null, ["story"]],
      ["Check 1", ["concept", "your_turn", "check"]],
      ["Check 2", ["concept", "explore", "your_turn", "check"]],
      [null, ["reveal", "principle"]],
    ]);
  });

  it("marks the Learner's place, which moves along as steps finish", () => {
    const start = { currentTopicId: "annuity", topics: {} };
    expect(stepSequence(insightMap, start, "annuity")!.current).toBe(0);
    const atExplore = play(insightMap, start, ["story", "concept", "your_turn", { pass: "an-1" }, "concept"]);
    const seq = stepSequence(insightMap, atExplore, "annuity")!;
    expect(seq.steps[seq.current!].label).toBe("Step 6 of 10 · Explore");
  });

  it("for a Learner who passed the Insight's Check before the Insight existed, puts Explore just before Reveal", () => {
    // Before the Insight was written, the Checks were in the other order and the Learner passed an-2 first.
    const before = courseMap(topicFile("plain", 10, [{ id: "pl-1" }]), topicFile("annuity", 20, [{ id: "an-2" }, { id: "an-1" }]));
    const pastAnchor = play(before, { currentTopicId: "annuity", topics: {} }, ["story", "concept", "your_turn", { pass: "an-2" }]);
    const seq = stepSequence(insightMap, pastAnchor, "annuity")!;
    expect(seq.steps.map((s) => s.step)).toEqual(["story", "concept", "your_turn", "check", "concept", "your_turn", "check", "explore", "reveal", "principle"]);
    expect(seq.groups.at(-1)!.steps.map((s) => s.step)).toEqual(["explore", "reveal", "principle"]);
    expect(seq.steps[seq.current!]).toMatchObject({ step: "concept", check: { number: 1 } });
    const atLateExplore = play(insightMap, pastAnchor, ["concept", "your_turn", { pass: "an-1" }]);
    const late = stepSequence(insightMap, atLateExplore, "annuity")!;
    expect(late.steps[late.current!].label).toBe("Step 8 of 10 · Explore");
  });

  it("lists only the due steps in a Due Check run", () => {
    const done = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
    const required = courseMap(topicFile("compounding", 10, [{ id: "co-1" }, { id: "co-2", required: true }]), topicFile("pv", 20, [{ id: "pv-1" }]));
    const run = stepSequence(required, done, "compounding")!;
    expect(run).toMatchObject({ dueRun: true, current: 0 });
    expect(run.steps.map((s) => s.label)).toEqual(["Step 1 of 3 · Concept", "Step 2 of 3 · Your turn", "Step 3 of 3 · Check"]);
    expect(run.groups).toEqual([{ check: { id: "co-2", number: 2 }, steps: run.steps }]);

    const exploreAdded = courseMap(topicFile("compounding", 10, [{ id: "co-1" }], [], { before: "co-1", requiredWhenPassed: true }), topicFile("pv", 20, [{ id: "pv-1" }]));
    expect(stepSequence(exploreAdded, done, "compounding")!.steps.map((s) => s.label)).toEqual(["Step 1 of 1 · Explore"]);
  });

  it("lists a passed Topic with nothing due in full, with no place in it", () => {
    const done = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
    expect(stepSequence(twoChecks, done, "compounding")).toMatchObject({ dueRun: false, current: null });
    expect(stepSequence(twoChecks, done, "compounding")!.steps).toHaveLength(6);
    expect(stepSequence(twoChecks, done, "nowhere")).toBeNull();
  });
});

describe("Teaching Steps: the Learner's Next", () => {
  const insightMap = courseMap(topicFile("annuity", 10, [{ id: "an-1" }, { id: "an-2" }], [], { before: "an-2" }));
  const start: Progress = { currentTopicId: "annuity", topics: {} };
  const begun = { begun: true };

  it("names the step that follows the one being taught", () => {
    expect(nextOffer(insightMap, start, begun)).toEqual({ kind: "next", step: "concept", label: "Next: Concept", advances: true });
    const atYourTurn = play(insightMap, start, ["story", "concept"]);
    expect(nextOffer(insightMap, atYourTurn, begun)).toMatchObject({ kind: "next", step: "check", label: "Next: Check" });
  });

  it("reads Complete this Topic at Principle", () => {
    const atPrinciple = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal"]);
    expect(nextOffer(twoChecks, atPrinciple, begun)).toEqual({ kind: "complete", label: "Complete this Topic" });
  });

  it("reads Just tell me at Explore until the Insight is settled, then names Your turn", () => {
    const atExplore = play(insightMap, start, ["story", "concept", "your_turn", { pass: "an-1" }, "concept"]);
    expect(nextOffer(insightMap, atExplore, begun)).toEqual({ kind: "just_tell_me", label: "Just tell me" });
    const settled: Progress = { ...atExplore, topics: { annuity: { ...atExplore.topics.annuity, insight: "told" } } };
    expect(nextOffer(insightMap, settled, begun)).toMatchObject({ kind: "next", step: "your_turn", label: "Next: Your turn" });
  });

  it("offers no Next while a Check is open, nor after a miss", () => {
    const atCheck = play(insightMap, start, ["story", "concept", "your_turn"]);
    expect(nextOffer(insightMap, atCheck, begun)).toBeNull();
    expect(nextOffer(insightMap, atCheck, { begun: false })).toBeNull();
    const missed = play(insightMap, atCheck, [{ fail: "an-1" }]);
    expect(nextOffer(insightMap, missed, begun)).toBeNull();
  });

  it("after a quiz pass, names the step not yet begun, and taking it teaches that step without moving on", () => {
    const passed = play(insightMap, start, ["story", "concept", "your_turn", { pass: "an-1" }]);
    expect(nextOffer(insightMap, passed, { begun: false })).toEqual({ kind: "next", step: "concept", label: "Next: Concept", advances: false });
    const taken = takeNext(insightMap, passed, "concept", { begun: false });
    expect(taken).toMatchObject({ ok: true, teach: { step: "concept", label: "Step 5 of 10 · Concept" } });
    if (taken.ok) expect(taken.progress).toEqual(passed);
  });

  it("taking Next moves on one step and says which numbered step to teach", () => {
    const taken = takeNext(insightMap, start, "concept", begun);
    expect(taken).toMatchObject({ ok: true, teach: { step: "concept", label: "Step 2 of 10 · Concept" } });
    if (taken.ok) expect(navigate(insightMap, taken.progress)?.step).toBe("concept");
  });

  it("taking Complete this Topic passes the Topic and teaches nothing more", () => {
    const atPrinciple = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal"]);
    const taken = takeNext(twoChecks, atPrinciple, "complete", begun);
    expect(taken).toMatchObject({ ok: true, teach: null });
    if (taken.ok) expect(taken.progress.topics.compounding.status).toBe("passed");
  });

  it("ends a Due Check run of Explore alone with Complete this Topic, leaving the Topic passed", () => {
    const done = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
    const exploreAdded = courseMap(topicFile("compounding", 10, [{ id: "co-1" }], [], { before: "co-1", requiredWhenPassed: true }), topicFile("pv", 20, [{ id: "pv-1" }]));
    expect(nextOffer(exploreAdded, done, begun)).toEqual({ kind: "just_tell_me", label: "Just tell me" });
    const settled: Progress = { ...done, topics: { compounding: { ...done.topics.compounding, insight: "found", step: "explore" } } };
    expect(nextOffer(exploreAdded, settled, begun)).toEqual({ kind: "complete", label: "Complete this Topic" });
    const taken = takeNext(exploreAdded, settled, "complete", begun);
    expect(taken).toMatchObject({ ok: true, teach: null });
    if (taken.ok) expect(navigate(exploreAdded, taken.progress)).toMatchObject({ topic: { id: "pv" }, dueChecks: [] });
  });

  it("never lets Next past a Check without a saved pass, past an unsettled Explore, or onto a step it does not name", () => {
    const atCheck = play(insightMap, start, ["story", "concept", "your_turn"]);
    expect(takeNext(insightMap, atCheck, "concept", begun)).toEqual({ ok: false, reason: "A Check is open: only a saved pass moves past it." });
    const missed = play(insightMap, atCheck, [{ fail: "an-1" }]);
    expect(takeNext(insightMap, missed, "concept", begun)).toMatchObject({ ok: false });
    const atExplore = play(insightMap, start, ["story", "concept", "your_turn", { pass: "an-1" }, "concept"]);
    expect(takeNext(insightMap, atExplore, "your_turn", begun)).toEqual({
      ok: false,
      reason: "Explore is not settled: the Learner has not found the Insight or been told it.",
    });
    expect(takeNext(insightMap, start, "reveal", begun)).toEqual({ ok: false, reason: 'Next names "concept", not "reveal".' });
  });
});

describe("What comes next", () => {
  const passedCompounding = play(twoChecks, empty, ["story", "concept", "your_turn", { pass: "co-1" }, "reveal", "principle"]);
  const dueCheck = courseMap(
    topicFile("compounding", 10, [{ id: "co-1" }, { id: "co-2", required: true }]),
    topicFile("pv", 20, [{ id: "pv-1" }]),
    topicFile("statements", 30, [{ id: "st-1" }]),
  );

  it("is a chosen Topic the Learner has not passed, first of all", () => {
    const jump = jumpTo(dueCheck, passedCompounding, "statements");
    if (!jump.ok) throw new Error(jump.reason);
    expect(whatComesNext(dueCheck, jump.progress)).toMatchObject({ kind: "chosen", topic: { id: "statements" }, label: "Resume: Topic statements" });
  });

  it("else a Due Check, named by its Topic and number", () => {
    expect(whatComesNext(dueCheck, passedCompounding)).toMatchObject({
      kind: "due",
      topic: { id: "compounding" },
      check: { id: "co-2", number: 2 },
      label: "New in Topic compounding: Check 2",
    });
  });

  it("else a due Explore, named as such", () => {
    const exploreAdded = courseMap(topicFile("compounding", 10, [{ id: "co-1" }], [], { before: "co-1", requiredWhenPassed: true }), topicFile("pv", 20, [{ id: "pv-1" }]));
    expect(whatComesNext(exploreAdded, passedCompounding)).toMatchObject({ kind: "due", check: null, label: "New in Topic compounding: Explore" });
  });

  it("else the next unpassed Topic on the default path", () => {
    expect(whatComesNext(twoChecks, passedCompounding)).toMatchObject({ kind: "next_topic", topic: { id: "pv" }, label: "Next Topic: Topic pv" });
    expect(whatComesNext(twoChecks, empty)).toMatchObject({ kind: "next_topic", topic: { id: "compounding" } });
  });

  it("is nothing once every Topic is passed", () => {
    const passed: TopicProgress = { step: "principle", passedChecks: [], revealShown: true, status: "passed" };
    expect(whatComesNext(twoChecks, { currentTopicId: null, topics: { pv: passed, statements: passed, compounding: passed } })).toBeNull();
  });
});

describe("reviews due", () => {
  const q = (n: number) => `  - { id: q${n}, prompt: "Q${n}?", choices: [{ id: a, text: A }, { id: b, text: B }], answer: a, explanation: E, source: S }`;
  const { map: reviewMap, errors } = parseCourseMap([
    {
      name: "t.yaml",
      text: [
        "id: t", "title: T", "stage: foundation", "path: 1", "cases:",
        "  - { id: c, title: C, asOf: 2018-10-24, story: S, reveal: R }",
        "concept: C", "principle: P", "questions:", q(1), q(2), q(3),
        "checks:", "  - { id: quiz, kind: quiz, questions: [q1, q2, q3], passRule: { correct: 2 } }",
      ].join("\n"),
    },
  ]);
  if (!reviewMap) throw new Error(errors.join("\n"));
  const hour = 3_600_000;
  const now = new Date("2026-03-10T12:00:00Z");
  const card = (questionId: string, hoursFromNow: number) => ({ questionId, due: new Date(now.getTime() + hoursFromNow * hour) });

  it("offers only cards due at the given time, most overdue first", () => {
    const due = reviewsDue(reviewMap, [card("q1", -2), card("q2", 5), card("q3", -30)], now, 0, 10);
    expect(due.offered.map((c) => c.questionId)).toEqual(["q3", "q1"]);
    expect(due.dueCount).toBe(2);
  });

  it("a card becomes due exactly when its time arrives", () => {
    const cards = [card("q1", 1)];
    expect(reviewsDue(reviewMap, cards, now, 0, 10).offered).toEqual([]);
    expect(reviewsDue(reviewMap, cards, new Date(now.getTime() + hour), 0, 10).offered).toHaveLength(1);
  });

  it("caps the offer at the limit minus reviews already done this Session, so a long break is no backlog", () => {
    const cards = [card("q1", -3), card("q2", -2), card("q3", -1)];
    expect(reviewsDue(reviewMap, cards, now, 0, 2).offered.map((c) => c.questionId)).toEqual(["q1", "q2"]);
    const afterOne = reviewsDue(reviewMap, cards, now, 1, 2);
    expect(afterOne.offered.map((c) => c.questionId)).toEqual(["q1"]);
    expect(afterOne.dueCount).toBe(3);
    expect(reviewsDue(reviewMap, cards, now, 2, 2).offered).toEqual([]);
    expect(reviewsDue(reviewMap, cards, now, 5, 2).offered).toEqual([]);
  });

  it("the default cap is 10", () => {
    const many = Array.from({ length: 12 }, (_, i) => card("q1", -i - 1));
    expect(reviewsDue(reviewMap, many, now, 0).offered).toHaveLength(10);
  });

  it("ignores a question removed from the Course Map", () => {
    expect(reviewsDue(reviewMap, [card("gone", -5), card("q1", -1)], now, 0, 10).offered.map((c) => c.questionId)).toEqual(["q1"]);
  });

  it("never changes a Topic's passed status: reviews are not part of Progress", () => {
    const passed: Progress = { currentTopicId: null, topics: { t: { step: "principle", passedChecks: ["quiz"], revealShown: true, status: "passed" } } };
    const before = JSON.stringify(passed);
    reviewsDue(reviewMap, [card("q1", -100)], now, 0, 10);
    expect(JSON.stringify(passed)).toBe(before);
    expect(navigate(reviewMap, passed)).toBeNull();
  });
});
