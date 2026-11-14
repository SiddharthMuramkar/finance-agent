import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "./lesson-fixture";
import { parseCourseMap, type CourseMap } from "./map";
import { finishFromPractice, finishStep, navigate, nextOffer, takeNext, type Progress } from "./navigator";

/**
 * Course Navigator, Your turn in a converted Topic (spec #229, ticket #243): it finishes only from fluency, which code
 * works out from Skill state; the Tutor's finish_teaching_step and the Learner's Next cannot end it.
 */

function mapOf(data: object): CourseMap {
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const converted = mapOf(CONVERTED_TOPIC_DATA);
/** The same Topic, not converted: no Skills, cards or Quick tries. */
const plain = mapOf({
  ...CONVERTED_TOPIC_DATA,
  skills: [],
  templates: [],
  questions: CONVERTED_TOPIC_DATA.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
    answer: q.answer,
    explanation: q.explanation,
    source: q.source,
  })),
  checks: [
    { id: "pct-demo-check-1", kind: "quiz", questions: ["pct-demo-headline"], perAttempt: 1, passRule: { correct: 1 } },
    { id: "pct-demo-check-3", kind: "conversation", prompt: "Say the move.", passCriteria: "Says it." },
  ],
});

const atYourTurn = (topicId = "pct-demo"): Progress => ({
  currentTopicId: topicId,
  topics: { [topicId]: { step: "your_turn", passedChecks: [], revealShown: false, status: "in_progress" } },
});

describe("Your turn in a converted Topic", () => {
  it("is refused when the Tutor reports it finished", () => {
    const move = finishStep(converted, atYourTurn(), "your_turn");
    expect(move).toEqual({ ok: false, reason: expect.stringContaining("Quick tries") });
  });

  it("offers no Next, so the Learner cannot take one past it", () => {
    expect(nextOffer(converted, atYourTurn(), { begun: true })).toBeNull();
    expect(takeNext(converted, atYourTurn(), "check", { begun: true }).ok).toBe(false);
  });

  it("finishes from practice once code says every Skill of the Check is fluent, and moves on to the Check", () => {
    expect(finishFromPractice(converted, atYourTurn(), false).ok).toBe(false);
    const move = finishFromPractice(converted, atYourTurn(), true);
    expect(move.ok).toBe(true);
    if (move.ok) expect(navigate(converted, move.progress)).toMatchObject({ step: "check", check: { id: "pct-demo-check-1" } });
  });

  it("finishes from practice only at a converted Your turn", () => {
    const atConcept: Progress = { currentTopicId: "pct-demo", topics: { "pct-demo": { step: "concept", passedChecks: [], revealShown: false, status: "in_progress" } } };
    expect(finishFromPractice(converted, atConcept, true).ok).toBe(false);
    expect(finishFromPractice(plain, atYourTurn(), true).ok).toBe(false);
  });
});

describe("Your turn in a Topic not converted", () => {
  it("behaves as before: the Tutor finishes it and Next is offered", () => {
    expect(finishStep(plain, atYourTurn(), "your_turn").ok).toBe(true);
    expect(nextOffer(plain, atYourTurn(), { begun: true })).toMatchObject({ kind: "next", step: "check" });
  });
});
