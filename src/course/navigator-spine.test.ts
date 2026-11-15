import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { loadCourseMap, parseCourseMap, readOutlineText, readTopicFiles, type CourseMap } from "./map";
import { courseOverview, defaultPath, finishStep, firstTopic, jumpTo, spineLive, navigate, recordCheckResult, reviewsDue, whatComesNext, type Progress, type TopicProgress } from "./navigator";
import { parseOutline, spineTopics } from "./outline";

// Spec 2026-11-12 C1, C7 and C8 (ADR 0004): the written Spine Topics, in Spine order, are the default path, then Follow,
// Judge and Analyse; an Elective is never next unless the Learner chose it; nothing a Learner has is lost.

const caseOf = (id: string) => `    cases:\n      - { title: Case of ${id}, asOf: 2000-02-01, outcome: What happened., sources: ["https://example.org/${id}"], verified: true }\n`;
const spine = (id: string, n: number) => `  - id: ${id}\n    title: Spine question ${n}\n    stage: spine\n    spine: ${n}\n    minutes: 12\n    drawsOn: [e1]\n${caseOf(id)}`;
const elective = (id: string, prerequisites = "") => `  - id: ${id}\n    title: Elective ${id}\n    stage: foundation\n    subject: "Numbers & time value"\n${prerequisites}${caseOf(id)}`;
const later = (id: string, stage: string) => `  - id: ${id}\n    title: ${stage} ${id}\n    stage: ${stage}\n${caseOf(id)}`;

// Spine 2 sits first in the file: the Spine runs in its own order. The Electives come after it, then the later Stages.
// The Spine goes live once Spine Topics 1 to 5 are written (C8); s6 is the one a live Spine can still be missing.
const LIVE = ["s1", "s2", "s3", "s4", "s5"];
const OUTLINE = parseOutline(
  `topics:\n${[spine("s2", 2), spine("s1", 1), spine("s3", 3), spine("s4", 4), spine("s5", 5), spine("s6", 6), elective("e1"), elective("e2", "    prerequisites: [e1]\n"), later("f1", "follow"), later("j1", "judge"), later("a1", "analyse")].join("")}`,
);

const file = (id: string) => ({
  name: `${id}.yaml`,
  text: `id: ${id}\ntitle: Topic ${id}\ncases:\n  - { id: ${id}-case, title: Case, asOf: 2000-02-01, story: Then., reveal: After. }\nconcept: Idea.\nprinciple: Lesson.\nchecks:\n  - { id: ${id}-check, kind: conversation, prompt: Q, passCriteria: A }\n`,
});

/** The Course Map with these Topic files written; the rest of the outline is Coming. */
function written(...ids: string[]): CourseMap {
  const { map, errors } = parseCourseMap(ids.map(file), OUTLINE.outline);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const empty: Progress = { currentTopicId: null, topics: {} };
const passed: TopicProgress = { step: "principle", passedChecks: [], revealShown: true, status: "passed" };
const passing = (...ids: string[]): Progress => ({ currentTopicId: null, topics: Object.fromEntries(ids.map((id) => [id, { ...passed, passedChecks: [`${id}-check`] }])) });

/** Finishes the Topic the Learner is in, from wherever they are in it, taking its steps as the Tutor and the Learner would. */
function passCurrent(map: CourseMap, progress: Progress): Progress {
  let p = progress;
  const id = navigate(map, p)!.topic.id;
  while (p.topics[id]?.status !== "passed") {
    const place = navigate(map, p)!;
    const result = place.step === "check" ? recordCheckResult(map, p, place.check!.id, true) : finishStep(map, p, place.step);
    if (!result.ok) throw new Error(result.reason);
    p = result.progress;
  }
  return p;
}

/** The Topics the default path leads a new Learner through, one pass at a time, until it ends. */
function walk(map: CourseMap): string[] {
  const seen: string[] = [];
  let p = empty;
  for (let place = navigate(map, p); place; place = navigate(map, p)) {
    seen.push(place.topic.id);
    p = passCurrent(map, p);
  }
  return seen;
}

describe("the default path with the Spine", () => {
  it("is valid as an outline", () => {
    expect(OUTLINE.errors).toEqual([]);
  });

  it("with no Spine Topic written, runs every Topic in outline order, as before the Spine (C8)", () => {
    const map = written("e1", "e2", "f1", "j1", "a1");
    expect(defaultPath(map).map((t) => t.id)).toEqual(["e1", "e2", "f1", "j1", "a1"]);
    expect(walk(map)).toEqual(["e1", "e2", "f1", "j1", "a1"]);
    expect(firstTopic(map)?.id).toBe("e1");
  });

  it("with some of Spine Topics 1 to 5 missing, keeps the path from before the Spine: the Spine is not live yet (C8)", () => {
    const map = written("s3", "s1", "s2", "s4", "s6", "e1", "e2", "f1", "j1", "a1");
    expect(spineLive(map)).toBe(false);
    expect(defaultPath(map).map((t) => t.id)).toEqual(["e1", "e2", "f1", "j1", "a1"]);
    expect(walk(map)).toEqual(["e1", "e2", "f1", "j1", "a1"]);
    expect(firstTopic(map)?.id).toBe("e1");
    // A Spine Topic written early can still be chosen from the Course Map.
    expect(jumpTo(map, empty, "s1")).toMatchObject({ ok: true });
  });

  it("once Spine Topics 1 to 5 are written, leads through the written ones in Spine order, skips the rest, then Follow, Judge and Analyse, never an Elective", () => {
    const map = written("s3", "s1", "s5", "s2", "s4", "e1", "e2", "f1", "j1", "a1");
    expect(spineLive(map)).toBe(true);
    expect(defaultPath(map).map((t) => t.id)).toEqual([...LIVE, "f1", "j1", "a1"]);
    expect(walk(map)).toEqual([...LIVE, "f1", "j1", "a1"]);
    expect(firstTopic(map)?.id).toBe("s1");
  });

  it("with every Spine Topic written, leads through all of them in Spine order first", () => {
    const map = written(...LIVE, "s6", "e1", "e2", "f1", "j1", "a1");
    expect(walk(map)).toEqual([...LIVE, "s6", "f1", "j1", "a1"]);
    expect(whatComesNext(map, empty)).toMatchObject({ kind: "next_topic", label: "Next Topic: Topic s1" });
  });

  it("ends once the default path is passed, though Electives are still open to choose", () => {
    const map = written(...LIVE, "e1", "f1");
    expect(navigate(map, passing(...LIVE, "f1"))).toBeNull();
    expect(whatComesNext(map, passing(...LIVE, "f1"))).toBeNull();
    expect(jumpTo(map, passing(...LIVE, "f1"), "e1")).toMatchObject({ ok: true, unmetPrerequisites: [] });
  });

  it("makes an Elective current only when the Learner chooses it, with its prerequisites as hints (Do first)", () => {
    const map = written(...LIVE, "e1", "e2", "f1");
    const jump = jumpTo(map, empty, "e2");
    expect(jump).toMatchObject({ ok: true, unmetPrerequisites: ["e1"] });
    if (!jump.ok) return;
    expect(navigate(map, jump.progress)).toMatchObject({ topic: { id: "e2" }, step: "story", unmetPrerequisites: ["e1"] });
  });

  it("does not pass a Spine Topic when the Elective it draws on is passed (C7)", () => {
    const map = written(...LIVE, "e1", "f1");
    const jump = jumpTo(map, empty, "e1");
    if (!jump.ok) throw new Error(jump.reason);
    const after = passCurrent(map, jump.progress);
    expect(after.topics).toMatchObject({ e1: { status: "passed" } });
    expect(after.topics.s1).toBeUndefined();
    expect(navigate(map, after)).toMatchObject({ topic: { id: "s1" }, status: "not_started" });
  });

  it("keeps a Learner in the middle of an Elective on it (Resume), then sends them to the first Spine Topic they have not passed (C7)", () => {
    const map = written(...LIVE, "e1", "e2", "f1");
    const midway: Progress = { currentTopicId: "e2", topics: { s1: { ...passed, passedChecks: ["s1-check"] }, e2: { step: "concept", passedChecks: [], revealShown: false, status: "in_progress" } } };
    expect(whatComesNext(map, midway)).toMatchObject({ kind: "chosen", label: "Resume: Topic e2" });
    expect(navigate(map, midway)).toMatchObject({ topic: { id: "e2" }, step: "concept" });
    expect(whatComesNext(map, passCurrent(map, midway))).toMatchObject({ kind: "next_topic", label: "Next Topic: Topic s2" });
  });

  it("still takes a Learner back to a passed Elective for a required Check added since, before the next Spine Topic", () => {
    const withDue = parseCourseMap(
      [file("s1"), { ...file("e1"), text: `${file("e1").text}  - { id: e1-new, kind: conversation, prompt: Q, passCriteria: A, required: true }\n` }],
      OUTLINE.outline,
    ).map!;
    expect(navigate(withDue, passing("e1"))).toMatchObject({ topic: { id: "e1" }, check: { id: "e1-new" } });
  });

  it("lists each Spine Topic's number and length, and which Spine Topics use an Elective's idea, written or coming", () => {
    const view = courseOverview(written(...LIVE, "e1", "e2", "f1"), empty);
    expect(view.find((t) => t.id === "s1")).toMatchObject({ spine: 1, minutes: 12, current: true, onDefaultPath: true });
    expect(view.find((t) => t.id === "e1")?.usedInSpine).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view.find((t) => t.id === "e2")).not.toHaveProperty("usedInSpine");
    expect(view.find((t) => t.id === "e2")).not.toHaveProperty("spine");
  });
});

// C7 on the real course: the same Learner, read with the Course Map as it was before the Spine and as it is now.
describe("a Learner with progress, before and after the Spine", () => {
  const raw = parse(readOutlineText()) as { topics: { stage: string }[] };
  // The course as it was before the Spine: no Spine entries in the outline and no Spine Topic files.
  const before = parseCourseMap(
    readTopicFiles().filter((f) => !f.name.startsWith("spine-")),
    parseOutline(stringify({ topics: raw.topics.filter((t) => t.stage !== "spine") })).outline,
  ).map!;
  // The course as it is now: every Spine Topic is written, so the Spine is live (C8, ADR 0004).
  const after = loadCourseMap();
  // The same course with Spine Topics 1 to 5 written, to see where this Learner goes once the Spine is live (C8), and
  // with Spine Topic 1 alone, which is not live yet. A Spine Topic file not written is stood in for by a minimal one.
  const outline = parseOutline(readOutlineText()).outline!;
  const files = readTopicFiles();
  const spineFile = (n: number) => {
    const id = spineTopics(outline).find((t) => t.spine === n)!.id;
    return files.some((f) => f.name === `${id}.yaml`) ? [] : [file(id)];
  };
  const spineOneId = spineTopics(outline).find((t) => t.spine === 1)!.id;
  const withSpine = parseCourseMap([...files, ...[1, 2, 3, 4, 5].flatMap(spineFile)], outline).map!;
  const spineOneOnly = parseCourseMap([...files.filter((f) => !f.name.startsWith("spine-") || f.name === `${spineOneId}.yaml`), ...spineFile(1)], outline).map!;

  const learner: Progress = {
    currentTopicId: "fs-income",
    topics: {
      "num-percent-bps": { ...passed, passedChecks: before.topic("num-percent-bps")!.checks.map((c) => c.id) },
      "present-value": { ...passed, passedChecks: before.topic("present-value")!.checks.map((c) => c.id) },
      "fs-income": { step: "your_turn", passedChecks: [], revealShown: false, status: "in_progress" },
    },
  };
  const shown = (map: CourseMap) => courseOverview(map, learner).map((t) => [t.id, t.status, t.checks.filter((c) => c.passed).map((c) => c.id), t.current]);
  const offSpine = (map: CourseMap) => shown(map).filter(([id]) => map.topic(String(id))?.stage !== "spine");

  it("has the Spine live on the real course, now that every Spine Topic is written (C8, ADR 0004)", () => {
    expect(spineLive(after)).toBe(true);
    expect(spineLive(spineOneOnly)).toBe(false);
  });

  it("shows every pass and the Learner's place as before, on every Topic that was there before", () => {
    // Every written Spine Topic is new, so only the Topics that were there before are compared.
    expect(offSpine(after)).toEqual(shown(before));
    expect(offSpine(withSpine)).toEqual(shown(before));
    expect(offSpine(spineOneOnly)).toEqual(shown(before));
  });

  it("still offers Resume for the Topic they are in", () => {
    for (const map of [before, after, withSpine, spineOneOnly]) expect(whatComesNext(map, learner)).toMatchObject({ kind: "chosen", label: `Resume: ${before.topic("fs-income")!.title}` });
  });

  it("goes on to Spine Topic 1 after that Topic once the Spine is live, and as before until then", () => {
    const done: Progress = { currentTopicId: null, topics: { ...learner.topics, "fs-income": { ...passed, passedChecks: before.topic("fs-income")!.checks.map((c) => c.id) } } };
    expect(navigate(before, done)?.topic.id).not.toBe("spine-01-worth");
    expect(firstTopic(before)?.id).toBe("num-percent-bps");
    // The real course: the Spine is live, so the Welcome and the path lead to Spine Topic 1.
    expect(navigate(after, done)?.topic.id).toBe("spine-01-worth");
    expect(firstTopic(after)?.id).toBe("spine-01-worth");
    expect(navigate(withSpine, done)?.topic.id).toBe("spine-01-worth");
    expect(firstTopic(withSpine)?.id).toBe("spine-01-worth");
    // Spine Topic 1 alone does not take the Spine live: the path and the Welcome stay as before (C8).
    expect(navigate(spineOneOnly, done)?.topic.id).toBe(navigate(before, done)?.topic.id);
    expect(firstTopic(spineOneOnly)?.id).toBe("num-percent-bps");
  });

  it("keeps offering the Reviews of the Electives they passed", () => {
    const questionId = before.topic("present-value")!.questions[0].id;
    const due = new Date("2026-11-01T00:00:00Z");
    const card = { questionId, due };
    expect(reviewsDue(after, [card], new Date("2026-11-13T00:00:00Z"), 0).offered).toEqual([card]);
    expect(reviewsDue(withSpine, [card], new Date("2026-11-13T00:00:00Z"), 0).offered).toEqual([card]);
  });
});
