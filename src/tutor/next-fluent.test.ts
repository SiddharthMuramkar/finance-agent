import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { saveFinishedStep } from "@/learner/memory";
import { recordAnswer } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { takeLearnersNext } from "./next";
import { runTutorTurn } from "./turn";

/** Seam: the Learner's Next into a converted Your turn that finishes on entry because its Skills are already fluent. */
describe("the Next note after a converted Your turn finishes on entry", () => {
  it("names the Check, not Your turn, when the Skills are already fluent", async () => {
    const parsed = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
    if (!parsed.map) throw new Error(parsed.errors.join("\n"));
    const map = parsed.map;
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "In 1994 the Fed held its rate at 3%." }] }]);
    for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hi")) void e;
    for (const skill of ["pts-to-bp", "bp-to-pts"]) {
      for (const n of [1, 2]) {
        await recordAnswer(db, { learnerId: OWNER_LEARNER_ID, topicId: "pct-demo", skillId: skill, itemKey: `quiz:9${n}:${skill}`, itemId: skill, input: "x", verdict: "right", source: "quiz" });
      }
    }
    for (const step of ["story"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    const taken = await takeLearnersNext(db, map, OWNER_LEARNER_ID, 0, "your_turn", new Date());
    if (!taken.ok) throw new Error(taken.reason);
    expect(taken.note).toContain("now at the Check step");
    expect(taken.note).not.toContain("Quick tries");
  });
});
