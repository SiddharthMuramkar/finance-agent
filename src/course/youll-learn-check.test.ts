import { describe, expect, it } from "vitest";
import { loadCourseMap, type Topic } from "./map";
import { youllLearnCheckErrors } from "./youll-learn-check";

const map = loadCourseMap();
const pv = map.topic("present-value")!;

/** A Topic with the given You'll learn bullets and present value's Insight. */
const topicWith = (id: string, youllLearn?: string[]): Topic => ({ ...pv, id, youllLearn });
const good = ["See why money later is worth less than money now.", "Bring payments at different dates to one date before comparing them."];

describe("the You'll learn course check", () => {
  it("passes the real Course Map", () => {
    expect(youllLearnCheckErrors(map.topics)).toEqual([]);
  });

  it("fails a written Topic with no You'll learn", () => {
    expect(youllLearnCheckErrors([topicWith("fresh")])).toEqual([
      "Topic fresh has no You'll learn: give it two or three short bullets drafted from its concept and principle",
    ]);
  });

  it("passes a Topic whose bullets are plain words", () => {
    expect(youllLearnCheckErrors([topicWith("fresh", good)])).toEqual([]);
  });

  it("rejects digits, currency signs and percent signs", () => {
    for (const bad of ["Read a move of 25 basis points.", "Say what $ a dollar buys.", "Turn ₹ into dollars.", "Say a rate in % and in points.", "Price in € and £."]) {
      const errors = youllLearnCheckErrors([topicWith("fresh", [bad, good[1]])]);
      expect(errors, bad).toHaveLength(1);
      expect(errors[0], bad).toContain("Topic fresh has a figure in You'll learn bullet 1; write it in words");
    }
  });

  it("rejects a typed formula, with the raw-formula rule of ADR 0002", () => {
    const errors = youllLearnCheckErrors([topicWith("fresh", [good[0], "Learn that value = cash / rate."])]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Topic fresh types a formula in You'll learn bullet 2 (ADR 0002): an equals sign");
  });

  it("rejects a bullet that repeats the written Insight", () => {
    const insight = pv.insight!.written;
    const errors = youllLearnCheckErrors([topicWith("fresh", [good[0], insight])]);
    expect(errors).toEqual(["Topic fresh's You'll learn bullet 2 repeats its Insight: draft it from the concept and principle only"]);
  });

  it("rejects a bullet that repeats most of the Insight's words in a new order", () => {
    const insight: NonNullable<Topic["insight"]> = { ...pv.insight!, written: "A small change in the interest rate moves the value of a long stream of payments a great deal." };
    const reworded = "The value of a long stream of payments moves a great deal with a small change in the interest rate.";
    expect(youllLearnCheckErrors([{ ...topicWith("fresh", [good[0], reworded]), insight }])).toHaveLength(1);
    expect(youllLearnCheckErrors([{ ...topicWith("fresh", good), insight }])).toEqual([]);
  });

  it("gives every Follow, Judge and Analyse Topic its You'll learn", () => {
    const practice = map.topics.filter((t) => /^(fol|jud|ana)-/.test(t.id));
    expect(practice.length).toBeGreaterThan(0);
    for (const topic of practice) {
      expect(topic.youllLearn?.length ?? 0, topic.id).toBeGreaterThanOrEqual(2);
      expect(topic.youllLearn!.length, topic.id).toBeLessThanOrEqual(3);
    }
  });
});
