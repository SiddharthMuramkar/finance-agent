import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type Check } from "@/course/map";
import { nextQuickTry, quickTryItem } from "./practice";
import type { QuickTryData } from "./session-item-kinds";

/**
 * Seam: the Quick-try picker (ticket #248, go-live fixes). A template's next try never repeats the numbers of the last
 * try shown from that template, even when its range allows only two draws.
 */

function twoValueTopic() {
  const data = structuredClone(CONVERTED_TOPIC_DATA) as { templates: { id: string; params: Record<string, unknown> }[] };
  data.templates.find((t) => t.id === "points-from-bp")!.params = { bp: { min: 10, max: 15, step: 5 } };
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map.topics[0];
}

describe("a template's Quick tries", () => {
  it("draw new numbers each time, from a two-value range", () => {
    const topic = twoValueTopic();
    const check = topic.checks[0] as Check;
    const fluent = { tries: 2, right: 2, streak: 2, missesInRow: 0, lastMistake: null, methodsUsed: [], parkedUntil: null };
    const missed = { tries: 1, right: 0, streak: 0, missesInRow: 1, lastMistake: null, methodsUsed: [], parkedUntil: null };
    const shown: QuickTryData[] = [];
    for (let i = 0; i < 12; i++) shown.push(nextQuickTry(topic, check, { "pts-to-bp": fluent, "bp-to-pts": missed }, shown, { session: 3 })!);
    const draws = shown.filter((t) => t.key.includes("t:points-from-bp")).map((t) => (quickTryItem(topic, t.key)!.item as unknown as { params: Record<string, unknown> }).params.bp);
    expect(draws.length).toBeGreaterThan(5);
    for (let i = 1; i < draws.length; i++) expect(draws[i]).not.toBe(draws[i - 1]);
  });
});
