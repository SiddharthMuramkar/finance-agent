import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { checkResults, learnerState, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { buildFilledNote } from "@/learner/notes";
import { testDb } from "@/test/pglite";
import { enterStepItems } from "./practice";
import { DAILY_LIFE } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { sessionForTurn } from "./session-log";
import { storeTopicComplete, type TopicCompleteData } from "./topic-complete";

// The daily-life line (spec #68, ticket #86): each Topic's one line from daily life, shown by code at its Principle step
// and on its Topic complete card, and kept in its Topic Note. Spine Topic 1 carries one.

const map = loadCourseMap();
const me = OWNER_LEARNER_ID;
const TOPIC = "spine-01-worth";
const topic = map.topic(TOPIC)!;
const LINE = "A headline says a firm is worth $50bn. A price someone paid, or a value someone argued?";
const now = () => new Date();

/** The Learner at Topic 1's `step` with both its Checks passed, in its Session. */
async function at(step: "reveal" | "principle", status: "in_progress" | "passed" = "in_progress") {
  const db = await testDb();
  await db.insert(learnerState).values({ id: me, learnerId: me, currentTopicId: status === "passed" ? null : TOPIC });
  await db.insert(topicProgress).values({ learnerId: me, topicId: TOPIC, step, status, revealShown: true });
  for (const c of topic.checks) await db.insert(checkResults).values({ learnerId: me, topicId: TOPIC, checkId: c.id, passed: true });
  const session = await sessionForTurn(db, now(), me, TOPIC);
  return { db: db as Db, sessionId: session.id };
}

describe("the daily-life line", () => {
  it("is Topic 1's own line", () => {
    expect(topic.dailyLife?.trim()).toBe(LINE);
  });

  it("is shown by code on entering the Principle step, once per Session", async () => {
    const { db, sessionId } = await at("principle");
    expect(await enterStepItems(db, map, me, sessionId, now())).toEqual([{ kind: DAILY_LIFE, data: { topicId: TOPIC, line: LINE } }]);
    expect(await enterStepItems(db, map, me, sessionId, now())).toEqual([]);
    expect((await loadSessionItems(db, sessionId, me)).filter((i) => i.kind === DAILY_LIFE)).toHaveLength(1);
  });

  it("is not shown at a step before the Principle", async () => {
    const { db, sessionId } = await at("reveal");
    expect((await enterStepItems(db, map, me, sessionId, now())).some((i) => i.kind === DAILY_LIFE)).toBe(false);
  });

  it("is on the Topic complete card", async () => {
    const { db, sessionId } = await at("principle", "passed");
    const card = await storeTopicComplete(db, map, me, sessionId, now());
    expect((card?.data as TopicCompleteData).dailyLife).toBe(LINE);
  });

  it("is kept in the Topic Note", () => {
    expect(buildFilledNote(topic, { passed: true, mistakes: [] }).dailyLife).toBe(LINE);
  });
});
