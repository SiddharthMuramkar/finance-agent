import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { spineOutline } from "@/course/spine-fixture";
import { courseFacts, courseStats } from "./stats";

// Counted independently of the Course Map code, straight from the files.
const outline = parse(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8")) as {
  topics: { id: string; subject?: string; cases: unknown[] }[];
};
const files = readdirSync(join(process.cwd(), "course", "topics")).filter((f) => f.endsWith(".yaml"));
const writtenIds = new Set(
  files.map((f) => (parse(readFileSync(join(process.cwd(), "course", "topics", f), "utf8")) as { id: string }).id),
);

describe("Landing stats", () => {
  it("counts the Topics written, their subjects and every Case in the outline", () => {
    const written = outline.topics.filter((t) => writtenIds.has(t.id));
    const cases = outline.topics.reduce((n, t) => n + t.cases.length, 0);
    const subjects = new Set(written.map((t) => t.subject).filter(Boolean)).size;
    expect(courseStats()).toMatchObject({ topics: written.length, subjects, cases });
  });
});

describe("courseFacts", () => {
  it("reads the Spine, the Electives per Subject and the reading Stages from the outline it is given", () => {
    const facts = courseFacts(spineOutline(), new Set(["spine-01-worth"]));
    expect(facts.spine).toEqual([{ n: 1, title: "What is a business worth?", minutes: 10 }]);
    expect(facts.minutes).toEqual({ low: 10, high: 10 });
    expect(facts.electives).toBe(2);
    expect(facts.bySubject).toEqual([
      { name: "Financial statements", count: 1 },
      { name: "Valuation & corporate finance", count: 1 },
    ]);
    expect(facts.byStage).toEqual([
      { stage: "follow", count: 0 },
      { stage: "judge", count: 0 },
      { stage: "analyse", count: 0 },
    ]);
    expect(facts.topics).toBe(1);
  });
});
