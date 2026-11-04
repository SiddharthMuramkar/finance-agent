import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { ensureTopicStarted, learnerSummary, saveCheckResult, saveFinishedStep, saveMisconception } from "./memory";
import { OWNER_LEARNER_ID } from "@/db/schema";

/** A small Course Map: "bonds" is first on the default path but requires "present-value", which requires "interest". */
function testMap(): CourseMap {
  const topic = (id: string, path: number, prerequisites: string[]) => ({
    name: `${id}.yaml`,
    text: JSON.stringify({
      id,
      title: id === "pv" ? "Present value" : id === "bonds" ? "Bond prices" : "Interest",
      stage: "foundation",
      path,
      prerequisites,
      cases: [{ id: `${id}-case`, title: "A Case", asOf: "2018-10-24", story: "Story.", reveal: "Reveal." }],
      concept: "Concept.",
      principle: "Principle.",
      checks: [{ id: `${id}-check`, kind: "conversation", prompt: "Prompt.", passCriteria: "Criteria." }],
    }),
  });
  const { map, errors } = parseCourseMap([topic("bonds", 10, ["pv"]), topic("pv", 20, ["interest"]), topic("interest", 30, [])]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

describe("Learner Memory summary", () => {
  it("is plain text naming the Topic, Teaching Step, unmastered prerequisites, misconceptions and the last verdict", async () => {
    const db = await testDb();
    const map = testMap();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    await saveCheckResult(db, map, { checkId: "bonds-check", passed: false, evidence: "Thought price and yield move together.", model: "m" }, new Date(), OWNER_LEARNER_ID);
    await saveMisconception(db, map, { topicId: "bonds", description: "Believes a bond's price rises when yields rise.", model: "m", toolCallId: "t1" }, new Date(), OWNER_LEARNER_ID);
    await saveMisconception(db, map, { topicId: "pv", description: "Adds future payments without discounting.", model: "m", toolCallId: "t2" }, new Date(), OWNER_LEARNER_ID);

    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toBe(
      [
        "Bond prices (foundation Stage).",
        "Teaching Step: check, for Check 1 of 1.",
        "Unmastered prerequisites: Present value (not started), Interest (not started).",
        "Misconceptions noted:",
        "- Bond prices: Believes a bond's price rises when yields rise.",
        "- Present value (prerequisite): Adds future payments without discounting.",
        "Last verdict at this Check: not yet. Thought price and yield move together.",
      ].join("\n"),
    );
  });

  it("a repeated misconception under the same tool call ID is saved once, and an unknown Topic is rejected", async () => {
    const db = await testDb();
    const map = testMap();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
    const input = { topicId: "bonds", description: "Confuses coupon and yield.", model: "m", toolCallId: "same" };
    expect(await saveMisconception(db, map, input, new Date(), OWNER_LEARNER_ID)).toEqual({ ok: true });
    expect(await saveMisconception(db, map, input, new Date(), OWNER_LEARNER_ID)).toEqual({ ok: true });
    expect(await saveMisconception(db, map, { ...input, topicId: "nope", toolCallId: "other" }, new Date(), OWNER_LEARNER_ID)).toEqual({
      ok: false,
      reason: 'Topic "nope" is not on the Course Map.',
    });
    expect((await learnerSummary(db, map, OWNER_LEARNER_ID)).match(/Confuses coupon and yield/g)).toHaveLength(1);
  });
});

describe("Learner Memory", () => {
  it("uses no memory framework: code writes plain SQL rows", async () => {
    const { readFile } = await import("node:fs/promises");
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /mem0|letta|memgpt|zep|langmem|langchain|llamaindex/i.test(d))).toEqual([]);
  });
});
