import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { recordAnswer } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { enterStepItems } from "./practice";
import { QUICK_TRY, STEP_DIVIDER } from "./session-item-kinds";
import { runTutorTurn } from "./turn";

/**
 * Seam: Your turn at a converted Check (ticket #248, go-live fixes). Entering Your turn never leaves the Learner with no
 * Quick try and no way on.
 */

const me = OWNER_LEARNER_ID;
const now = () => new Date();

function mapOf(data: object): CourseMap {
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

async function started(db: Db, map: CourseMap): Promise<number> {
  const { client } = scriptedClient([{ content: [{ type: "text", text: "In 1994 the Fed held its rate at 3%." }] }]);
  let sessionId = 0;
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, "Hi")) if (e.type === "done") sessionId = e.ref.sessionId;
  return sessionId;
}

/** Two right answers in a row on a Skill, logged as quiz answers. */
async function makeFluent(db: Db, skillId: string) {
  for (const n of [1, 2]) {
    await recordAnswer(db, { learnerId: me, topicId: "pct-demo", skillId, itemKey: `quiz:9${n}:${skillId}`, itemId: skillId, input: "x", verdict: "right", source: "quiz" });
  }
}

describe("entering a converted Your turn", () => {
  it("finishes it at once when every Skill of the Check is already fluent", async () => {
    const map = mapOf(CONVERTED_TOPIC_DATA);
    const db = await testDb();
    const sessionId = await started(db, map);
    await makeFluent(db, "pts-to-bp");
    await makeFluent(db, "bp-to-pts");
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, now(), me);
    const items = await enterStepItems(db, map, me, sessionId, now());
    expect(items.map((i) => i.kind)).toEqual([STEP_DIVIDER]);
    expect(navigate(map, await loadProgress(db, me))).toMatchObject({ step: "check", check: { id: "pct-demo-check-1" } });
  });

  it("skips a Skill with no Quick tries, and finishes once the Skills that have tries are fluent", async () => {
    const data = structuredClone(CONVERTED_TOPIC_DATA) as { checks: { quickTries?: { skill?: string; template?: string }[] }[] };
    // Check 1 keeps only the bp-to-pts tries: pts-to-bp has none.
    data.checks[0].quickTries = data.checks[0].quickTries!.filter((q) => q.skill === "bp-to-pts" || q.template === "points-from-bp");
    const map = mapOf(data);
    const db = await testDb();
    const sessionId = await started(db, map);
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, now(), me);
    const [first] = await enterStepItems(db, map, me, sessionId, now());
    expect(first).toMatchObject({ kind: QUICK_TRY, data: { skillId: "bp-to-pts" } });

    const db2 = await testDb();
    const session2 = await started(db2, map);
    await makeFluent(db2, "bp-to-pts");
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db2, map, step, now(), me);
    expect((await enterStepItems(db2, map, me, session2, now())).map((i) => i.kind)).toEqual([STEP_DIVIDER]);
  });
});
