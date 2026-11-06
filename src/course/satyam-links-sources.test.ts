import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCourseMap, readOutlineText } from "./map";
import { parseOutline } from "./outline";

/**
 * Historian findings on PR #491.
 * CG-H1: a question that teaches a term must cite a source that defines that term. OpenStax Principles of Finance 2e,
 * 6.6, defines only profit margin (net income / net sales), never operating margin; the SEC's Beginners' Guide to
 * Financial Statements does ("Operating Margin = Income from Operations / Net Revenues").
 * CG-H2: the Satyam figures are for the quarter to 30 September 2008; December 2008 is only the as-of date, so a title
 * must say "as of December 2008", never a bare "(December 2008)" that reads as the period of the figures.
 */

// Term -> pages checked to define it (fetched 6 Nov 2026). A question whose right answer is the term cites one of them.
const DEFINING_SOURCES: Record<string, string[]> = {
  "operating margin": ["https://www.sec.gov/about/reports-publications/beginners-guide-financial-statements"],
};

const BARE_AS_OF = /(?<!as of )December 2008/;

describe("fs-links sources and titles", () => {
  const map = loadCourseMap();
  const topic = map.topics.find((t) => t.id === "fs-links");

  it("CG-H1: a question answered by a defined term cites a page that defines it", () => {
    const answered = (topic?.questions ?? []).flatMap((q) => {
      const right = q.choices.find((c) => c.id === q.answer)?.text.trim().toLowerCase() ?? "";
      return right in DEFINING_SOURCES ? [{ id: q.id, term: right, source: q.source }] : [];
    });
    expect(answered.map((a) => a.id)).toContain("fl-q-cooked");
    expect(answered.filter((a) => !DEFINING_SOURCES[a.term].some((url) => a.source.includes(url))).map((a) => a.id)).toEqual([]);
  });

  it("CG-H2: Case and scene titles give December 2008 as the as-of date", () => {
    const titles = [...(topic?.cases ?? []).map((c) => c.title), ...(topic?.scenes ?? []).map((s) => String(s.title ?? ""))];
    expect(titles.some((t) => t.includes("December 2008"))).toBe(true);
    expect(titles.filter((t) => BARE_AS_OF.test(t))).toEqual([]);
  });

  it("CG-H2: the outline and the course map doc give December 2008 as the as-of date", () => {
    const outline = parseOutline(readOutlineText()).outline;
    const cases = outline?.topics.find((t) => t.id === "fs-links")?.cases ?? [];
    expect(cases.map((c) => c.title).filter((t) => BARE_AS_OF.test(t))).toEqual([]);
    const doc = readFileSync(join(process.cwd(), "docs", "course-map.md"), "utf8");
    expect(doc.split("\n").filter((l) => l.includes("Satyam's reported profit and cash") && BARE_AS_OF.test(l))).toEqual([]);
  });
});
