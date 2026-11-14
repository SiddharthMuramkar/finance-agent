import { desc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { saveTurnTiming, TurnClock } from "./turn-timing";

/**
 * Turn timing (spec 2026-11-12, A9): each turn's row keeps the time to the model's first event, to the first word the
 * Learner could see and in all, with its Reply kind. A streamed own question (A5) shows its first word while the model
 * is still writing; a step-led reply shows nothing until it is checked whole.
 */

const map = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]).map as CourseMap;
const me = OWNER_LEARNER_ID;

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[]) {
  const { client } = scriptedClient(replies, { deltaChars: 8 });
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) events.push(e);
  return events;
}
const latest = async (db: Db) => (await db.select().from(turns).orderBy(desc(turns.id)).limit(1))[0];

/** A reply that writes one sentence, then takes `ms` to write the rest (timed from when the model reaches that point). */
const slowReply = (ms: number): ScriptedReply => ({
  content: [{ type: "text", text: "A basis point is one hundredth of a percentage point. " }, { type: "text", text: "Traders use it for small moves." }],
  holdAfterFirstText: { then: (done: () => void) => void setTimeout(done, ms) } as unknown as Promise<unknown>,
});

describe("TurnClock", () => {
  it("times the first model event and the first visible word once each, and the end", () => {
    const clock = new TurnClock(performance.now() - 1000);
    clock.shown({ type: "item" });
    clock.shown({ type: "text", text: "  " });
    expect(clock.firstWordMs).toBeNull();
    clock.modelEvent();
    clock.shown({ type: "text", text: "Hello." });
    const first = clock.firstWordMs;
    clock.shown({ type: "replay", text: "Again." });
    clock.modelEvent();
    clock.end();
    expect(clock.firstEventMs).toBeGreaterThanOrEqual(1000);
    expect(first).toBeGreaterThanOrEqual(clock.firstEventMs!);
    expect(clock.firstWordMs).toBe(first);
    expect(clock.totalMs).toBeGreaterThanOrEqual(first!);
  });
});

describe("a turn's times", () => {
  it("are recorded with the Reply kind, and a streamed own question's first word comes before the model has finished", async () => {
    const db = await testDb();
    await turn(db, "What is a basis point?", [slowReply(300)]);
    const row = await latest(db);
    expect(row.replyKind).toBe("own_question");
    expect(row.firstEventMs).not.toBeNull();
    expect(row.firstWordMs).toBeGreaterThanOrEqual(row.firstEventMs!);
    // The first sentence showed while the model took 300 ms more to write the rest.
    expect(row.totalMs! - row.firstWordMs!).toBeGreaterThanOrEqual(290);
  });

  it("for a step-led reply, the first word waits for the whole reply and its checks", async () => {
    const db = await testDb();
    await turn(db, "Show me.", [slowReply(300)]);
    const row = await latest(db);
    // Nothing showed until the model had finished, 300 ms after its first words.
    expect(row.firstWordMs! - row.firstEventMs!).toBeGreaterThanOrEqual(290);
    expect(row.totalMs).toBeGreaterThanOrEqual(row.firstWordMs!);
  });

  it("times the model's first event after a slow start", async () => {
    const db = await testDb();
    await turn(db, "Hi", [{ content: [{ type: "text", text: "Hello there." }], delayMs: 200 }]);
    expect((await latest(db)).firstEventMs).toBeGreaterThanOrEqual(200);
  });

  it("fails soft: a write that fails is logged, never thrown, so the turn it describes never fails for it", async () => {
    const failing = { update: () => ({ set: () => ({ where: () => Promise.reject(Object.assign(new Error("column does not exist"), { code: "42703" })) }) }) } as unknown as Db;
    const clock = new TurnClock();
    clock.end();
    await expect(saveTurnTiming(failing, 1, clock)).resolves.toBeUndefined();
  });
});
