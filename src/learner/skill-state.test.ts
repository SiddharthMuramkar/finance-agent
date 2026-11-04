import { describe, expect, it } from "vitest";
import { learners, OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { drillDue, freshSkillState, isFluent, nextMove, yourTurnDone } from "@/teaching/ladder";
import { testDb } from "@/test/pglite";
import { noteMethodUsed, parkSkill, recordAnswer, skillStates, unparkSkill, type PracticeAnswer } from "./skill-state";

/**
 * Skill state in Learner Memory (spec #229, ticket #232): every marked Quick-try and quiz answer is logged once, and
 * updates the Learner's state on that Skill in the same transaction. In-memory Postgres with the real migrations.
 */

const TOPIC = "fnd-percent";
const SKILL = "pts_to_bp";
const me = OWNER_LEARNER_ID;

let n = 0;
/** A new answer to a new showing of an item. */
function answer(verdict: PracticeAnswer["verdict"], more: Partial<PracticeAnswer> = {}): PracticeAnswer {
  n += 1;
  return {
    learnerId: me,
    topicId: TOPIC,
    skillId: SKILL,
    itemKey: `try-${n}`,
    itemId: "qt-bp-1",
    templateId: "pts-to-bp",
    params: { points: 0.6 },
    input: verdict === "right" ? "60" : "6",
    verdict,
    mistakeTag: verdict === "known_mistake" ? "multiplied_by_10" : undefined,
    source: "quick_try",
    ...more,
  };
}

async function secondLearner(db: Db): Promise<number> {
  const [row] = await db.insert(learners).values({ name: "second" }).returning();
  return row.id;
}

describe("Recording an answer", () => {
  it("updates the Skill's state and returns it", async () => {
    const db = await testDb();
    expect(await recordAnswer(db, answer("known_mistake"))).toEqual({
      tries: 1,
      right: 0,
      streak: 0,
      missesInRow: 1,
      lastMistake: "multiplied_by_10",
      methodsUsed: [],
      parkedUntil: null,
    });
    expect(await skillStates(db, me, TOPIC)).toEqual({ [SKILL]: expect.objectContaining({ tries: 1, missesInRow: 1 }) });
  });

  it("the same answer sent twice changes nothing", async () => {
    const db = await testDb();
    const once = answer("wrong");
    const first = await recordAnswer(db, once);
    expect(await recordAnswer(db, once)).toEqual(first);
    // Even if the repeat claims another verdict, the first one stands.
    expect(await recordAnswer(db, { ...once, verdict: "right", input: "60" })).toEqual(first);
    expect((await skillStates(db, me, TOPIC))[SKILL]).toMatchObject({ tries: 1, right: 0, missesInRow: 1 });
  });

  it("two answers sent at the same moment are both counted", async () => {
    const db = await testDb();
    await Promise.all([recordAnswer(db, answer("right")), recordAnswer(db, answer("right"))]);
    expect((await skillStates(db, me, TOPIC))[SKILL]).toMatchObject({ tries: 2, right: 2, streak: 2 });
  });

  it("counts misses in a row across Quick tries and quiz questions, and a right answer resets the count", async () => {
    const db = await testDb();
    await recordAnswer(db, answer("wrong", { source: "quick_try" }));
    const two = await recordAnswer(db, answer("known_mistake", { source: "quiz", itemId: "q-bp-3" }));
    expect(two.missesInRow).toBe(2);
    expect(nextMove(two, { verdict: "known_mistake", tag: "multiplied_by_10" })).toMatchObject({ replyKind: "reteach", method: "restate" });

    const reset = await recordAnswer(db, answer("right", { source: "quiz" }));
    expect(reset).toMatchObject({ missesInRow: 0, streak: 1 });
    expect(nextMove(await recordAnswer(db, answer("wrong")), { verdict: "wrong" })).toMatchObject({ replyKind: "feedback", method: null });
  });

  it("each Skill, Topic and Learner has its own state", async () => {
    const db = await testDb();
    const other = await secondLearner(db);
    await recordAnswer(db, answer("right"));
    await recordAnswer(db, answer("wrong", { skillId: "pct_change" }));
    await recordAnswer(db, answer("wrong", { topicId: "fnd-rates" }));
    await recordAnswer(db, answer("wrong", { learnerId: other }));

    const mine = await skillStates(db, me, TOPIC);
    expect(Object.keys(mine).sort()).toEqual(["pct_change", SKILL]);
    expect(mine[SKILL]).toMatchObject({ tries: 1, right: 1 });
    expect(mine.pct_change).toMatchObject({ tries: 1, missesInRow: 1 });
    expect((await skillStates(db, other, TOPIC))[SKILL]).toMatchObject({ tries: 1, right: 0 });
    // The same item key from another Learner is their own answer.
    const shared = answer("right");
    await recordAnswer(db, shared);
    expect((await recordAnswer(db, { ...shared, learnerId: other })).tries).toBe(2);
  });

  it("keeps the Session the answer was given in", async () => {
    const db = await testDb();
    const [s] = await db
      .insert(sessions)
      .values({ learnerId: me, instructions: "", tools: [], model: "m", effort: "low", fingerprint: "f", topicId: TOPIC, older: false })
      .returning();
    expect((await recordAnswer(db, answer("right", { sessionId: s.id }))).right).toBe(1);
  });

  it("refuses a Known mistake without its tag, and stores nothing", async () => {
    const db = await testDb();
    await expect(recordAnswer(db, answer("known_mistake", { mistakeTag: undefined }))).rejects.toThrow(/tag/);
    expect(await skillStates(db, me, TOPIC)).toEqual({});
  });
});

describe("Fluency through stored answers", () => {
  it("two right in a row make the Skill fluent, and Your turn is done once every Skill of the Check is", async () => {
    const db = await testDb();
    await recordAnswer(db, answer("wrong"));
    await recordAnswer(db, answer("right"));
    expect(isFluent(await recordAnswer(db, answer("right")))).toBe(true);

    const states = await skillStates(db, me, TOPIC);
    const check = [SKILL, "pct_change"].map((id) => states[id] ?? freshSkillState());
    expect(yourTurnDone(check)).toBe(false);
    await recordAnswer(db, answer("right", { skillId: "pct_change" }));
    await recordAnswer(db, answer("right", { skillId: "pct_change" }));
    const after = await skillStates(db, me, TOPIC);
    expect(yourTurnDone([SKILL, "pct_change"].map((id) => after[id]))).toBe(true);
  });
});

describe("The ladder's methods", () => {
  it("are noted in order, and the next re-teach never repeats the one just used", async () => {
    const db = await testDb();
    await recordAnswer(db, answer("wrong"));
    let s = await recordAnswer(db, answer("wrong"));
    const first = nextMove(s, { verdict: "wrong" }).method!;
    await noteMethodUsed(db, me, TOPIC, SKILL, first);

    await recordAnswer(db, answer("right"));
    await recordAnswer(db, answer("wrong"));
    s = await recordAnswer(db, answer("wrong"));
    const second = nextMove(s, { verdict: "wrong" }).method!;
    expect([first, second]).toEqual(["restate", "worked"]);
    await noteMethodUsed(db, me, TOPIC, SKILL, second);
    expect((await skillStates(db, me, TOPIC))[SKILL].methodsUsed).toEqual(["restate", "worked"]);
  });

  it("can be noted for a Skill not answered yet", async () => {
    const db = await testDb();
    await noteMethodUsed(db, me, TOPIC, SKILL, "widget");
    expect((await skillStates(db, me, TOPIC))[SKILL]).toEqual({ ...freshSkillState(), methodsUsed: ["widget"] });
  });
});

describe("Parking", () => {
  it("the third miss in a row offers to park; parking sets the return time and starts the miss count again", async () => {
    const db = await testDb();
    await recordAnswer(db, answer("wrong"));
    await recordAnswer(db, answer("wrong"));
    const third = await recordAnswer(db, answer("known_mistake"));
    expect(nextMove(third, { verdict: "known_mistake", tag: "multiplied_by_10" })).toMatchObject({ replyKind: "offer_park", offerPark: true });

    const now = new Date("2026-11-04T18:00:00Z");
    const parked = await parkSkill(db, me, TOPIC, SKILL, now);
    expect(parked).toMatchObject({ parkedUntil: new Date("2026-11-05T14:00:00Z"), missesInRow: 0, tries: 3 });
    expect((await skillStates(db, me, TOPIC))[SKILL]).toEqual(parked);
  });

  it("the parked Skill comes back as a drill once 20 hours have passed, and the drill's end clears it", async () => {
    const db = await testDb();
    await recordAnswer(db, answer("wrong"));
    await parkSkill(db, me, TOPIC, SKILL, new Date("2026-11-04T18:00:00Z"));
    const s = (await skillStates(db, me, TOPIC))[SKILL];
    expect(drillDue(s, new Date("2026-11-05T13:59:00Z"))).toBe(false);
    expect(drillDue(s, new Date("2026-11-05T14:00:00Z"))).toBe(true);

    const cleared = await unparkSkill(db, me, TOPIC, SKILL);
    expect(cleared.parkedUntil).toBeNull();
    expect(drillDue(cleared, new Date("2026-11-06T00:00:00Z"))).toBe(false);
  });
});
