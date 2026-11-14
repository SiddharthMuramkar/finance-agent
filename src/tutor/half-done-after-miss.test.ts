import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, topicRestarts } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { restartTopic } from "@/learner/restart";
import { answerTyped } from "@/test/answer-typed";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { enterStepItems } from "./practice";
import { QUICK_TRY, type QuickTryData, type SessionItem } from "./session-item-kinds";
import { runTutorTurn } from "./turn";

/**
 * Seam: the Quick try code posts at Your turn (spec 2026-11-12, Part G, G7). "The half-done line shows only after a miss
 * on that Skill in the current attempt": the first try of a Skill is a full one, whatever earlier attempts say, and
 * "First step, done for you" comes only after the Learner missed that same Skill in this attempt.
 */

const { map: parsed } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
const map = parsed as CourseMap;
const me = OWNER_LEARNER_ID;
const now = () => new Date();
const HALF = /^First step, done for you/;

/** Opens the Topic's Session with one Tutor turn, finishes Story and Concept, and returns the first try posted. */
async function firstTryAtYourTurn(db: Db): Promise<QuickTryData> {
  const { client } = scriptedClient([{ content: [{ type: "text", text: "In 1994 the Fed held its rate at 3%." }] }]);
  let sessionId = 0;
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, "Hi")) if (e.type === "done") sessionId = e.ref.sessionId;
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, now(), me);
  const [first] = await enterStepItems(db, map, me, sessionId, now());
  return first.data as QuickTryData;
}

const tryIn = (items: SessionItem[]) => items.find((i) => i.kind === QUICK_TRY)?.data as QuickTryData | undefined;
/** The basis points a "from a% to b%" try moves by, read from its ask. */
const bpOf = (t: QuickTryData) => {
  const [a, b] = [...t.prompt.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  return Math.round(Math.abs(b - a) * 100);
};
/** Answers a points-to-basis-points try with its Known mistake (divided by 10, not times 100). */
const miss = (db: Db, t: QuickTryData) => answerTyped(db, map, me, t.key, String(bpOf(t) / 10), now());
const right = (db: Db, t: QuickTryData) => answerTyped(db, map, me, t.key, `${bpOf(t)} bp`, now());

describe("the half-done line after a miss (G7)", () => {
  it("(a) gives a full first try when earlier attempts hold misses but the current attempt has none", async () => {
    const db = await testDb();
    // An earlier attempt: two misses on the first Skill, then Start a Topic over.
    const old = await firstTryAtYourTurn(db);
    const m1 = await miss(db, old);
    expect(m1.ok && m1.items[0].data).toMatchObject({ verdict: "known_mistake" });
    const again = tryIn(m1.ok ? m1.items : [])!;
    await miss(db, again);
    expect((await restartTopic(db, map, me, "pct-demo", now())).restarted).toBe(true);
    expect(await db.select().from(topicRestarts)).toHaveLength(1);

    // The current attempt: the first try of the Skill is a full one.
    const first = await firstTryAtYourTurn(db);
    expect(first.key).not.toBe(old.key);
    expect(first.skillId).toBe("pts-to-bp");
    expect(first.halfDone).toBeUndefined();
    expect(first.prompt).not.toMatch(HALF);
    // A right answer keeps the next try full too: still no miss in this attempt.
    const a = await right(db, first);
    const second = tryIn(a.ok ? a.items : [])!;
    expect(second.skillId).toBe("pts-to-bp");
    expect(second.halfDone).toBeUndefined();
  });

  it("(b) gives the half-done try after one miss on that Skill in the current attempt", async () => {
    const db = await testDb();
    const first = await firstTryAtYourTurn(db);
    expect(first.halfDone).toBeUndefined();
    const a = await miss(db, first);
    expect(a.ok && a.items[0].data).toMatchObject({ verdict: "known_mistake" });
    const next = tryIn(a.ok ? a.items : [])!;
    expect(next.skillId).toBe("pts-to-bp");
    expect(next.halfDone).toMatch(HALF);
  });

  it("(c) gives a full try on a Skill when the miss in the current attempt was on a different Skill", async () => {
    const db = await testDb();
    const first = await firstTryAtYourTurn(db);
    const a1 = await miss(db, first);
    const t2 = tryIn(a1.ok ? a1.items : [])!;
    const a2 = await right(db, t2);
    const t3 = tryIn(a2.ok ? a2.items : [])!;
    const a3 = await right(db, t3);
    // The first Skill is fluent; the next Skill has had no miss in this attempt.
    const other = tryIn(a3.ok ? a3.items : [])!;
    expect(other.skillId).toBe("bp-to-pts");
    expect(other.halfDone).toBeUndefined();
  });
});
