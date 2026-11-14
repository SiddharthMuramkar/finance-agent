import { describe, expect, it } from "vitest";
import { convertedTopic } from "@/course/lesson-fixture";
import { freshSkillState, type SkillState } from "@/teaching/ladder";
import { nextQuickTry, quickTryItem } from "./practice";
import type { QuickTryData } from "./session-item-kinds";

/** The pure picker (spec #229, ticket #243): which Quick try comes next at Your turn, from Skill state and what was shown. */

const topic = convertedTopic();
const check1 = topic.checks[0];
const fluent: SkillState = { ...freshSkillState(), tries: 2, right: 2, streak: 2 };
/** One miss on the Skill in the current attempt, the latest answer. */
const missedOnce: SkillState = { ...freshSkillState(), tries: 1, missesInRow: 1, lastMistake: "used_10" };
/** A miss in the current attempt, then a right answer. */
const missedThenRight: SkillState = { ...freshSkillState(), tries: 2, right: 1, streak: 1 };

describe("nextQuickTry", () => {
  it("opens the first Skill not yet fluent, in card order, with a full try: no first step before a miss (spec G7)", () => {
    const t = nextQuickTry(topic, check1, {}, [], { session: 7 })!;
    expect(t).toMatchObject({ checkId: check1.id, skillId: "pts-to-bp", kind: "choice", choices: expect.any(Array) });
    expect(t.choices!.length).toBeGreaterThanOrEqual(2);
    expect(t.halfDone).toBeUndefined();
    expect(t.prompt).toMatch(/^A rate moves from [\d.]+% to [\d.]+%\. How many basis points\?$/);
  });

  it("gives the half-done try after a miss on the Skill, and a full draw again after a right answer, each under a fresh key", () => {
    const first = nextQuickTry(topic, check1, {}, [], { session: 7 })!;
    const second = nextQuickTry(topic, check1, { "pts-to-bp": missedOnce }, [first], { session: 7 })!;
    expect(second.skillId).toBe("pts-to-bp");
    expect(second.halfDone).toMatch(/^First step, done for you: the move is [\d.]+ points\.$/);
    expect(second.key).not.toBe(first.key);
    const third = nextQuickTry(topic, check1, { "pts-to-bp": missedThenRight }, [first, second], { session: 7 })!;
    expect(third.halfDone).toBeUndefined();
    expect(third.key).not.toBe(second.key);
  });

  it("keeps a miss on one Skill to that Skill: the next Skill's first try is full", () => {
    const t = nextQuickTry(topic, check1, { "pts-to-bp": { ...fluent, tries: 3 } }, [], { session: 7 })!;
    expect(t.skillId).toBe("bp-to-pts");
    expect(t.halfDone).toBeUndefined();
  });

  it("shows a fixed half-done try without its first step when it is the only try left and the Skill has no miss", () => {
    const only = { ...check1, quickTries: check1.quickTries.filter((q) => !("template" in q && q.template === "points-from-bp")) };
    const t = nextQuickTry(topic, only, { "pts-to-bp": fluent }, [], { session: 7 })!;
    expect(t).toMatchObject({ skillId: "bp-to-pts", prompt: "120 bp is how many points?" });
    expect(t.halfDone).toBeUndefined();
    expect(quickTryItem(topic, t.key)).toMatchObject({ item: { id: "pct-demo-try-bp-half" } });
    expect(quickTryItem(topic, t.key)!.halfDone).toBeUndefined();
  });

  it("moves to the next Skill once one is fluent, and after a miss there its fixed half-done try comes first", () => {
    const t = nextQuickTry(topic, check1, { "pts-to-bp": fluent, "bp-to-pts": missedOnce }, [], { session: 7 })!;
    expect(t).toMatchObject({
      skillId: "bp-to-pts",
      prompt: "120 bp is how many points?",
      halfDone: "First step, done for you: 100 bp make 1 point, so divide by 100.",
      kind: "choice",
    });
    expect(t.choices!.map((c) => c.text).sort()).toEqual(["1.2 points", "12 points"]);
  });

  it("returns null once every Skill of the Check is fluent", () => {
    expect(nextQuickTry(topic, check1, { "pts-to-bp": fluent, "bp-to-pts": fluent }, [], { session: 7 })).toBeNull();
  });

  it("gives a half-done try when asked for an easier one only after a miss in the attempt, and keeps to a named Skill", () => {
    const first = nextQuickTry(topic, check1, {}, [], { session: 7 })!;
    const second = nextQuickTry(topic, check1, {}, [first], { session: 7 })!;
    expect(nextQuickTry(topic, check1, {}, [first, second], { session: 7, easier: true })!.halfDone).toBeUndefined();
    expect(nextQuickTry(topic, check1, { "pts-to-bp": missedThenRight }, [first, second], { session: 7, easier: true })!.halfDone).toBeDefined();
    expect(nextQuickTry(topic, check1, {}, [first], { session: 7, skillId: "bp-to-pts" })!.skillId).toBe("bp-to-pts");
  });

  it("is the same for the same inputs (a reload shows the same try), and never carries the answer", () => {
    const a = nextQuickTry(topic, check1, {}, [], { session: 7 });
    expect(nextQuickTry(topic, check1, {}, [], { session: 7 })).toEqual(a);
    expect(Object.keys(a!)).not.toContain("answer");
  });
});

describe("quickTryItem", () => {
  it("works the item out again from its key, so the server marks it", () => {
    const t = nextQuickTry(topic, check1, { "pts-to-bp": fluent, "bp-to-pts": missedOnce }, [], { session: 7 }) as QuickTryData;
    const found = quickTryItem(topic, t.key)!;
    expect(found.item).toMatchObject({ id: "pct-demo-try-bp-half", answer: 1.2 });
    const drawn = nextQuickTry(topic, check1, {}, [], { session: 7 })!;
    expect(quickTryItem(topic, drawn.key)!.item).toMatchObject({ templateId: "bp-from-move" });
    expect(quickTryItem(topic, "qt:7:0:no-such-try")).toBeNull();
  });
});
