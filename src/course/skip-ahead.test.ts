import { describe, expect, it } from "vitest";
import { loadCourseMap, writtenQuestions, type Topic } from "./map";
import { courseOverview, navigate, type Progress } from "./navigator";
import { baseQuestionId, computedKeyedQuestion, parseComputedInstanceId, parseTemplateInstanceId } from "./quiz";
import { passBySkipAhead, SKIP_AHEAD_MAX, SKIP_AHEAD_MIN, skipAheadOffered, skipAheadPassed, skipAheadQuestions } from "./skip-ahead";
import { spineShapeProblems } from "./spine-check";
import { spineData, spineMap, spineTopic } from "./spine-fixture";

// Skip ahead (spec 2026-11-12 A8): "I know this: quiz me" opens one mixed quiz with one question for each Skill of the
// Topic, at least four and at most eight; missing no more than one passes the whole Topic; a Topic whose last Check is a
// conversation Check about the Learner's own work offers none, and no Spine Topic has one.

const map = loadCourseMap();
const NONE: Progress = { currentTopicId: null, topics: {} };
const skillOf = (topic: Topic, id: string) => topic.questions.find((q) => q.id === baseQuestionId(id))?.skill ?? map.template(parseTemplateInstanceId(id)?.templateId ?? "")?.skill;

describe("the questions of a skip-ahead quiz", () => {
  it("asks one question for each Skill of Percent, points and basis points: five Skills, five questions", () => {
    const topic = map.topic("num-percent-bps")!;
    const ids = skipAheadQuestions(map, topic, "1.num-percent-bps.2026-11-13");
    expect(ids).toHaveLength(topic.skills.length);
    expect(ids.map((id) => skillOf(topic, id)).sort()).toEqual(topic.skills.map((s) => s.id).sort());
  });

  it("asks one question for each Skill a quiz Check of Growth and compounding tests, and at least four", () => {
    const topic = map.topic("num-compounding")!;
    const ids = skipAheadQuestions(map, topic, "seed");
    expect(ids.map((id) => skillOf(topic, id))).toEqual(["compound-growth", "fall-and-recover", "rule-of-72", "cagr"]);
  });

  it("picks again by the seed where a Skill has several questions, the same pick for the same seed", () => {
    const topic = map.topic("num-compounding")!;
    const picks = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => skipAheadQuestions(map, topic, seed)[1]));
    expect(picks.size).toBeGreaterThan(1);
    expect(skipAheadQuestions(map, topic, "a")).toEqual(skipAheadQuestions(map, topic, "a"));
  });

  it("draws from the quiz Checks' written questions for a Topic without Skills, at most eight", () => {
    const topic = map.topic("present-value")!;
    expect(topic.skills).toEqual([]);
    const ids = skipAheadQuestions(map, topic, "seed");
    expect(ids).toHaveLength(SKIP_AHEAD_MAX);
    const written = new Set(writtenQuestions(topic).map((q) => q.id));
    for (const id of ids) expect(written.has(id), id).toBe(true);
  });

  it("fills a Spine Topic with two Skills up to four from its Check, and never asks a predict question", () => {
    const topic = spineTopic();
    const ids = skipAheadQuestions(spineMap(), topic, "seed");
    expect(topic.skills).toHaveLength(2);
    expect(ids).toHaveLength(SKIP_AHEAD_MIN);
    expect(new Set(ids.map((id) => skillOf(topic, id)))).toEqual(new Set(["price-value", "levers"]));
    expect(ids.map(baseQuestionId)).not.toContain("worth-q-predict");
  });

  it("draws a computed question afresh by the seed, so the next day does not bring back the same choices (D5)", () => {
    const topic = spineTopic();
    const lever = (day: string) => skipAheadQuestions(spineMap(), topic, `1.${topic.id}.${day}`).find((id) => baseQuestionId(id) === "worth-q-lever");
    const days = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"].map(lever).filter((id): id is string => Boolean(id));
    expect(days.length).toBeGreaterThan(0);
    for (const id of days) expect(parseComputedInstanceId(id)).toMatchObject({ questionId: "worth-q-lever" });
    const choiceSets = new Set(days.map((id) => computedKeyedQuestion(spineMap(), id)!.choices.map((c) => c.id).sort().join()));
    expect(choiceSets.size).toBeGreaterThan(1);
  });
});

describe("whether the Topic Start card offers skip ahead", () => {
  it("offers it on an unpassed Topic with four questions or more, and not on one already passed", () => {
    expect(skipAheadOffered(map, NONE, "present-value")).toBe(true);
    const passed: Progress = { currentTopicId: null, topics: { "present-value": { step: "principle", passedChecks: [], revealShown: true, status: "passed" } } };
    expect(skipAheadOffered(map, passed, "present-value")).toBe(false);
  });

  it("does not offer it on a Topic with fewer than four questions to ask", () => {
    expect(skipAheadQuestions(map, map.topic("eco-gdp-cycles")!, "seed").length).toBeLessThan(SKIP_AHEAD_MIN);
    expect(skipAheadOffered(map, NONE, "eco-gdp-cycles")).toBe(false);
  });

  it("does not offer it on a Topic whose last Check is a conversation Check about the Learner's own work", () => {
    const own = spineData((d) => void ((d.checks.at(-1) as { ownWork?: boolean }).ownWork = true));
    expect(skipAheadOffered(spineMap(), NONE, "spine-01-worth")).toBe(true);
    expect(skipAheadOffered(spineMap(own), NONE, "spine-01-worth")).toBe(false);
  });

  it("offers it on the ready-Case valuation Topic, as on any other Spine Topic (Owner, 2026-11-16)", () => {
    const topic = map.topic("spine-15-value-yourself")!;
    expect(skipAheadOffered(map, NONE, topic.id)).toBe(true);
    const ids = skipAheadQuestions(map, topic, "1.spine-15-value-yourself.2026-11-16");
    expect(ids.length).toBeGreaterThanOrEqual(SKIP_AHEAD_MIN);
    expect(ids.map((id) => skillOf(topic, id))).toEqual(expect.arrayContaining(topic.skills.map((s) => s.id)));
  });

  it("fails a Spine Topic with a Check about the Learner's own work: on the Spine the Learner judges a published Story", () => {
    const own = spineTopic(spineData((d) => void ((d.checks.at(-1) as { ownWork?: boolean }).ownWork = true)));
    expect(spineShapeProblems(own)).toContain(
      'has a Check about the Learner\'s own work ("worth-talk"); on the Spine the Learner judges a published Story, so drop ownWork (the Learner\'s own Estimate comes in an Assignment)',
    );
    expect(spineShapeProblems(spineTopic())).toEqual([]);
  });
});

describe("the pass rule and what a pass does", () => {
  it("passes with no more than one miss", () => {
    expect(skipAheadPassed(6, 6)).toBe(true);
    expect(skipAheadPassed(5, 6)).toBe(true);
    expect(skipAheadPassed(4, 6)).toBe(false);
    expect(skipAheadPassed(3, 4)).toBe(true);
    expect(skipAheadPassed(2, 4)).toBe(false);
  });

  it("passes every Check and the whole Topic, so the Course Map shows it passed and the path goes on", () => {
    const at: Progress = { currentTopicId: "present-value", topics: { "present-value": { step: "story", passedChecks: [], revealShown: false, status: "in_progress" } } };
    const move = passBySkipAhead(map, at, "present-value");
    if (!move.ok) throw new Error(move.reason);
    const topic = map.topic("present-value")!;
    expect(move.progress.topics["present-value"]).toMatchObject({ status: "passed", passedChecks: topic.checks.map((c) => c.id) });
    expect(courseOverview(map, move.progress).find((t) => t.id === "present-value")).toMatchObject({ status: "passed" });
    expect(navigate(map, move.progress)?.topic.id).not.toBe("present-value");
  });

  it("is refused for a Topic already passed", () => {
    const passed: Progress = { currentTopicId: null, topics: { "present-value": { step: "principle", passedChecks: [], revealShown: true, status: "passed" } } };
    expect(passBySkipAhead(map, passed, "present-value")).toMatchObject({ ok: false });
  });
});
