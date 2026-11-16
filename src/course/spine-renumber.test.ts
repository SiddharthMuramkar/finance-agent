import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { connectionsCheckErrors } from "./connections-check";
import { CRITICS_LOG_PATH, criticsLogErrors } from "./critics-log";
import { formulaCheckErrors } from "./formula-check";
import { goalCheckErrors } from "./goal-check";
import { lessonLintErrors } from "./lesson-lint";
import { loadCourseMap, parseCourseMap, readOutlineText, readTopicFiles } from "./map";
import { defaultPath, spineLive } from "./navigator";
import { parseOutline, spineTopics } from "./outline";
import { spineCheckErrors } from "./spine-check";
import { writtenAheadCheckErrors } from "./written-ahead-check";
import { youllLearnCheckErrors } from "./youll-learn-check";

// Spec #68, ticket #85 (ADR 0004, ADR 0020): a Spine Topic's number is its place in course/outline.yaml and nothing else,
// so renumbering one is a change to the outline only. These move Topics on the real outline, touch no Topic file, and run
// what scripts/check-course.mjs runs on the files (the Workbench build aside, which reads no number).

type RawTopic = { id: string; stage: string; spine?: number };

/** The real outline with these Topics' Spine numbers swapped, two at a time. */
function swapped(...pairs: [string, string][]): string {
  const raw = parse(readOutlineText()) as { topics: RawTopic[] };
  const byId = new Map(raw.topics.map((t) => [t.id, t]));
  for (const [a, b] of pairs) {
    const [ta, tb] = [byId.get(a)!, byId.get(b)!];
    [ta.spine, tb.spine] = [tb.spine, ta.spine];
  }
  return stringify(raw);
}

/** What the course check reports for the real Topic files read with this outline text. */
function courseCheck(outlineText: string): string[] {
  const planned = parseOutline(outlineText);
  if (!planned.outline) return planned.errors;
  const { map, errors } = parseCourseMap(readTopicFiles(), planned.outline);
  if (!map) return errors;
  const log = existsSync(CRITICS_LOG_PATH) ? readFileSync(CRITICS_LOG_PATH, "utf8") : null;
  return [
    ...lessonLintErrors(map.topics),
    ...spineCheckErrors(map.topics),
    ...criticsLogErrors(map.topics, log),
    ...formulaCheckErrors(map.topics),
    ...writtenAheadCheckErrors(map.topics),
    ...connectionsCheckErrors(map.topics),
    ...youllLearnCheckErrors(map.topics),
    ...goalCheckErrors(map.topics),
  ];
}

const spineIds = () => spineTopics(parseOutline(readOutlineText()).outline!).map((t) => t.id);

describe("renumbering a Spine Topic is a change to the outline only (#85)", () => {
  it("passes the course check on the real outline as it is", () => {
    expect(courseCheck(readOutlineText())).toEqual([]);
  });

  it("stays green with the annuity and cash Topics swapped, and the own-work Topic moved off its number", () => {
    const ids = spineIds();
    const pairs: [string, string][] = [
      ["spine-02-money-later", "spine-03-cash"],
      ["spine-15-value-yourself", ids[0]],
    ];
    const text = swapped(...pairs);
    const moved = spineTopics(parseOutline(text).outline!);
    expect(moved.find((t) => t.id === "spine-02-money-later")?.spine).toBe(3);
    expect(moved.find((t) => t.id === "spine-15-value-yourself")?.spine).toBe(1);
    expect(courseCheck(text)).toEqual([]);
  });

  it("keeps the Spine live and the default path in the outline's new Spine order", () => {
    const text = swapped(["spine-04-growth", "spine-05-margins"]);
    const map = parseCourseMap(readTopicFiles(), parseOutline(text).outline).map!;
    expect(spineLive(map)).toBe(true);
    const spine = defaultPath(map).filter((t) => t.stage === "spine").map((t) => t.id);
    const before = defaultPath(loadCourseMap()).filter((t) => t.stage === "spine").map((t) => t.id);
    expect(spine.indexOf("spine-05-margins")).toBe(before.indexOf("spine-04-growth"));
    expect(spine.indexOf("spine-04-growth")).toBe(before.indexOf("spine-05-margins"));
  });
});
