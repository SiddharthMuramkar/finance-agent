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
import { reteachNote } from "./ladder-moves";
import { answerQuickTry, enterStepItems } from "./practice";
import { QUICK_TRY, STEP_DIVIDER, type QuickTryData } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { runTutorTurn, type TurnEvent } from "./turn";
import { turnFacts } from "./turn-facts";
import { QUICK_TRY_FOLLOW_UP_PREFIX, requestStop } from "./turn-status";

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

describe("the Reply kind of a re-teach rung", () => {
  async function factsFor(method: "worked" | "drill5" | "restate") {
    const map = mapOf(CONVERTED_TOPIC_DATA);
    const db = await testDb();
    await started(db, map);
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, now(), me);
    const note = `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner missed a Quick try on the same idea twice in a row:\n${reteachNote(method)}`;
    return turnFacts(db, map, me, navigate(map, await loadProgress(db, me)), { learnerText: note });
  }

  it("sends the worked-example rung as a worked example, held to 120 words", async () => {
    expect(await factsFor("worked")).toMatchObject({ step: "your_turn", replyKind: "worked_example", cap: 120 });
  });

  it("sends the drill rung as Reply kind drill, held to the short cap", async () => {
    expect(await factsFor("drill5")).toMatchObject({ replyKind: "drill", cap: 80 });
  });

  it("keeps restate as a re-teach at the short cap", async () => {
    expect(await factsFor("restate")).toMatchObject({ replyKind: "reteach", cap: 80 });
  });
});

describe("Stop on a Quick-try follow-up turn", () => {
  it("drops the reply but still posts the fresh try", async () => {
    const map = mapOf(CONVERTED_TOPIC_DATA);
    const db = await testDb();
    const sessionId = await started(db, map);
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, now(), me);
    const [first] = await enterStepItems(db, map, me, sessionId, now());
    const answer = await answerQuickTry(db, map, me, (first.data as QuickTryData).key, "7777", now());
    expect(answer).toMatchObject({ ok: true, followUp: true });

    const never = new Promise<never>(() => {});
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "The slip was" }], holdAfterFirstText: never }]);
    const events: TurnEvent[] = [];
    const run = (async () => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: me }, { quickTryFollowUp: true })) events.push(e);
    })();
    while (requests.length < 1) await new Promise((r) => setTimeout(r, 5));
    expect(await requestStop(db, me)).toBe(true);
    await run;
    expect(events.some((e) => e.type === "stopped")).toBe(true);
    const posted = events.flatMap((e) => (e.type === "item" && e.item.kind === QUICK_TRY ? [e.item] : []));
    expect(posted).toHaveLength(1);
    expect((await loadSessionItems(db, sessionId, me)).filter((i) => i.kind === QUICK_TRY)).toHaveLength(2);
  });
});
