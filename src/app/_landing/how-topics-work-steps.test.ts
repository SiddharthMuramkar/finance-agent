import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { HOME_QUICK_TRY, HOME_REVEAL, HOME_REVEAL_FIGURES, HOME_STEPS_CASE, HOME_STEPS_TOPIC, HOME_STORY, HOME_TERM, storyBeats } from "./how-topics-work-steps";

// Spec 2026-11-12 E5: each step of Home's section 3 shows "a real piece of Spine Topic 1 ... written ahead". The pieces
// are copied into Home so it reads no database; this checks them word for word against the Topic file whenever the file
// is in the course (SPINE_01_FILE points the check at another copy, e.g. one taken from the Spine branch).

const FILE = process.env.SPINE_01_FILE ?? join(process.cwd(), "course", "topics", "spine-01-worth.yaml");
const fold = (s: string) => s.replace(/\s+/g, " ").trim();

describe("Home's section 3 pieces of Spine Topic 1 [E5]", () => {
  it("come from Spine Topic 1 in the course outline", () => {
    const outline = parse(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8"));
    const topics = JSON.stringify(outline);
    expect(topics).toContain(`"id":"${HOME_STEPS_TOPIC}"`);
  });

  it("show the story as a scene, one sentence a beat, all on screen", () => {
    expect(storyBeats()).toEqual([
      "February 2000.",
      "Amazon sells books and music online.",
      "In the twelve months to September 1999 it sold $1,117 million and lost $410 million on its operations.",
      "Its shares cost $84.",
      "A professor in New York, Aswath Damodaran, writes down what he thinks its future looks like: how big it gets, what it keeps of each sale, what its growth costs and how risky it is.",
      "What is Amazon worth, and is $84 a fair price for it?",
    ]);
  });

  it("draw the reveal's two bars from figures the reveal itself states", () => {
    expect(HOME_REVEAL).toContain(`$${HOME_REVEAL_FIGURES.value.toFixed(2)} a share`);
    expect(HOME_REVEAL).toContain(`$${HOME_REVEAL_FIGURES.price} price`);
  });

  it("give the Quick try one right choice and a fix on every wrong one", () => {
    const right = HOME_QUICK_TRY.choices.filter((c) => c.id === HOME_QUICK_TRY.answer);
    expect(right).toHaveLength(1);
    expect(right[0].fix).toBeUndefined();
    for (const c of HOME_QUICK_TRY.choices.filter((c) => c.id !== HOME_QUICK_TRY.answer)) expect(c.fix, c.id).toBeTruthy();
  });

  it.runIf(existsSync(FILE))("match the Topic file word for word", () => {
    const topic = parse(readFileSync(FILE, "utf8"));
    expect(topic.id).toBe(HOME_STEPS_TOPIC);
    const kase = topic.cases.find((c: { id: string }) => c.id === HOME_STEPS_CASE);
    expect(fold(kase.story)).toBe(HOME_STORY);
    expect(fold(kase.reveal)).toBe(HOME_REVEAL);
    const term = topic.terms.find((t: { term: string }) => t.term === HOME_TERM.term);
    expect({ term: term.term, means: term.means, pro: term.pro, example: term.example, inStory: term.inStory }).toEqual(HOME_TERM);
    const tries = topic.checks.flatMap((c: { quickTries?: unknown[] }) => c.quickTries ?? []);
    const tried = tries.find((t: { id: string }) => t.id === HOME_QUICK_TRY.id);
    expect(tried.ask).toBe(HOME_QUICK_TRY.ask);
    expect(tried.skill).toBe(HOME_QUICK_TRY.skill);
    expect(tried.answer).toBe(HOME_QUICK_TRY.answer);
    expect(tried.choices.map((c: { id: string; text: string; mistake?: { fix: string } }) => ({ id: c.id, text: c.text, ...(c.mistake && { fix: c.mistake.fix }) }))).toEqual(HOME_QUICK_TRY.choices);
  });
});
