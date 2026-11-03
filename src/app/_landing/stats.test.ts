import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { librarySources } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { courseStats, librarySourceCount } from "./stats";

// Counted independently of the Course Map code, straight from the files.
const outline = parse(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8")) as {
  topics: { id: string; cases: unknown[] }[];
};
const files = readdirSync(join(process.cwd(), "course", "topics")).filter((f) => f.endsWith(".yaml"));
const writtenIds = new Set(
  files.map((f) => (parse(readFileSync(join(process.cwd(), "course", "topics", f), "utf8")) as { id: string }).id),
);

describe("Landing stats", () => {
  it("shows Topics written of planned and every Case in the outline", () => {
    const planned = outline.topics.length;
    const written = outline.topics.filter((t) => writtenIds.has(t.id)).length;
    const cases = outline.topics.reduce((n, t) => n + t.cases.length, 0);
    expect(courseStats()).toEqual({ topics: `${written} of ${planned}`, cases });
  });

  it("counts the Library sources", async () => {
    const db = await testDb();
    expect(await librarySourceCount(db)).toBe(0);
    const row = (id: string) => ({
      id,
      title: `Source ${id}`,
      kind: "timeless" as const,
      licence: "CC BY",
      licenceUrl: "https://example.org/licence",
      credit: "Example",
      url: `https://example.org/${id}`,
      fetchedOn: "2026-10-01",
    });
    await db.insert(librarySources).values([row("a"), row("b"), row("c")]);
    expect(await librarySourceCount(db)).toBe(3);
  });
});
