import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 2026-11-05 §0 and E2a: colours come from theme tokens only, never a literal.

const DIR = __dirname;
const sources = readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("pressed toggle", () => {
  it("the LingoCard's In the story button has a visible pressed face in the stylesheet", () => {
    const css = readFileSync(join(DIR, "../../../app/globals.css"), "utf8");
    expect(css).toMatch(/\.story-toggle\[aria-pressed="true"\]/);
    expect(readFileSync(join(DIR, "lingo-card.tsx"), "utf8")).toContain("story-toggle");
  });
});

describe("wave 3 sources", () => {
  it("has the five parts' files", () => {
    expect(sources).toEqual(expect.arrayContaining(["story-scene.tsx", "lingo-card.tsx", "timeline-strip.tsx", "two-paths.tsx", "money-jar.tsx", "index.ts"]));
  });

  for (const file of sources) {
    it(`${file} has no #hex, rgb( or hsl( colour literal`, () => {
      const code = readFileSync(join(DIR, file), "utf8");
      expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code).not.toMatch(/\brgba?\(/);
      expect(code).not.toMatch(/\bhsla?\(/);
    });
  }
});
