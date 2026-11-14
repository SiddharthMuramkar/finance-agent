import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { courseStats } from "./stats";

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
    expect(courseStats()).toEqual({ topics: written.length, subjects, cases });
  });
});
