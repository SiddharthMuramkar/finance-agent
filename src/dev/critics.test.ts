import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "docs", "critics");
const CRITICS = [
  "affordance",
  "space",
  "colour-liveliness",
  "beginner-persona",
  "math-police",
  "historian",
  "security",
  "final-review",
  "widget-fit",
];
const HEADINGS = ["## Inputs", "## Rubric", "## Output", "## Pass bar", "## Tier"];

const read = (name: string) => readFileSync(join(DIR, `${name}.md`), "utf8");

describe("critic prompt files [S7]", () => {
  it("every critic file has the five headings in order", () => {
    for (const name of CRITICS) {
      const lines = read(name).split("\n");
      const at = HEADINGS.map((h) => lines.indexOf(h));
      for (const i of at) expect(i, `${name}.md heading`).toBeGreaterThanOrEqual(0);
      expect([...at].sort((a, b) => a - b), `${name}.md order`).toEqual(at);
    }
  });

  it("every JSON example parses and matches §8", () => {
    for (const name of CRITICS) {
      const m = read(name).match(/```json\n([\s\S]*?)\n```/);
      expect(m, `${name}.md has a json block`).not.toBeNull();
      const json = JSON.parse(m![1]);
      if (name === "beginner-persona") {
        expect(Object.keys(json)).toEqual(
          expect.arrayContaining(["fun", "lingoLearned", "feltLikeExam", "sumAsked"]),
        );
      }
      if (name === "math-police") {
        expect(Object.keys(json)).toEqual(expect.arrayContaining(["checked", "violations"]));
      }
      if (name === "widget-fit") {
        expect(json.icons).toEqual(expect.objectContaining({ meaningful: expect.any(Array), decorative: expect.any(Array) }));
        expect(json).not.toHaveProperty("emoji");
      }
      if (name === "colour-liveliness") expect(Object.keys(json.scores)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7"]);
    }
  });

  it("the folder has exactly the critics of §8, and the Spine's critics' record (spec 2026-11-12 C8)", () => {
    expect(readdirSync(DIR).sort()).toEqual(
      [...CRITICS.map((c) => `${c}.md`), "README.md", "spine-log.yaml"].sort(),
    );
  });
});
