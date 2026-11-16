import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { finishStep, navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { answerInsightPick, insightPickNow } from "./insight";
import { loadProgress, saveFinishedStep } from "./memory";

// Spine Topic 1's Insight settled by a tap (ticket #88, ADR 0020): code marks the tap with no model call, as it marks a
// Quick try. The right choice finds the Insight; a wrong one shows its fix and releases the next hint.

const map = loadCourseMap();

/** A Learner at Spine Topic 1's explore step: story and concept are done. */
async function atExplore() {
  const db = await testDb();
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  const place = navigate(map, await loadProgress(db, OWNER_LEARNER_ID));
  expect([place?.topic.id, place?.step]).toEqual(["spine-01-worth", "explore"]);
  return db;
}

describe("tapping the Insight's choice at Spine Topic 1's explore step", () => {
  it("shows the question and the choices' words, never which is right, then the written Insight once settled", async () => {
    const db = await atExplore();
    const shown = insightPickNow(map, await loadProgress(db, OWNER_LEARNER_ID))!;
    expect(shown.choices.map((c) => c.id)).toEqual(["bigger-richer", "cheaper-money", "leaner"]);
    expect(JSON.stringify(shown)).not.toMatch(/answer|fix|cost of capital alone could not/);
    await answerInsightPick(db, map, OWNER_LEARNER_ID, "bigger-richer");
    expect(insightPickNow(map, await loadProgress(db, OWNER_LEARNER_ID))?.settled?.how).toBe("found");
  });

  it("finds the Insight with the right choice, so Next can finish explore", async () => {
    const db = await atExplore();
    const result = await answerInsightPick(db, map, OWNER_LEARNER_ID, "bigger-richer");
    expect(result).toMatchObject({ ok: true, released: "found", topicId: "spine-01-worth" });
    expect(result.ok && result.written).toContain("a cheaper cost of capital alone could not get there");
    const progress = await loadProgress(db, OWNER_LEARNER_ID);
    expect(progress.topics["spine-01-worth"].insight).toBe("found");
    expect(finishStep(map, progress, "explore").ok).toBe(true);
  });

  it("shows a wrong choice's fix and releases hint 1, then hint 2, then tells the Insight", async () => {
    const db = await atExplore();
    const first = await answerInsightPick(db, map, OWNER_LEARNER_ID, "cheaper-money");
    expect(first).toMatchObject({ ok: true, released: "hint_1", hint: "Move one lever at a time and watch which one moves the value most." });
    expect(first.ok && first.fix).toMatch(/^A lower cost of capital alone/);
    expect(first.ok && first.written).toBeFalsy();
    expect(await answerInsightPick(db, map, OWNER_LEARNER_ID, "leaner")).toMatchObject({ ok: true, released: "hint_2" });
    const third = await answerInsightPick(db, map, OWNER_LEARNER_ID, "leaner");
    expect(third).toMatchObject({ ok: true, released: "told" });
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["spine-01-worth"].insight).toBe("told");
  });

  it("refuses a choice the Insight does not have, and any tap once it is settled", async () => {
    const db = await atExplore();
    expect(await answerInsightPick(db, map, OWNER_LEARNER_ID, "nope")).toMatchObject({ ok: false, status: 404 });
    await answerInsightPick(db, map, OWNER_LEARNER_ID, "bigger-richer");
    expect(await answerInsightPick(db, map, OWNER_LEARNER_ID, "bigger-richer")).toMatchObject({ ok: false, status: 409 });
  });
});
