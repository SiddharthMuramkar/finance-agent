import { describe, expect, it } from "vitest";
import { applyAnswer, drillDue, freshSkillState, isFluent, LADDER, nextMove, parkUntil, yourTurnDone, type AnswerEvent, type SkillState } from "./ladder";

/**
 * The repair ladder (spec #229, "Repair ladder and Reply kinds", "Parking"; ticket #232): a pure policy that maps a
 * Skill's state after an answer to what comes next. Code chooses the Reply kind, never the Tutor.
 */

const RIGHT: AnswerEvent = { verdict: "right" };
const WRONG: AnswerEvent = { verdict: "wrong" };
const x10: AnswerEvent = { verdict: "known_mistake", tag: "multiplied_by_10" };

const play = (events: AnswerEvent[], from: SkillState = freshSkillState()) => events.reduce(applyAnswer, from);

describe("Skill state after answers", () => {
  it("counts tries, right answers, the streak and misses in a row", () => {
    expect(play([RIGHT, x10, WRONG])).toEqual({
      tries: 3,
      right: 1,
      streak: 0,
      missesInRow: 2,
      lastMistake: "multiplied_by_10",
      methodsUsed: [],
      parkedUntil: null,
    });
  });

  it("a right answer resets misses in a row and adds to the streak", () => {
    const s = play([WRONG, x10, RIGHT, RIGHT]);
    expect(s).toMatchObject({ tries: 4, right: 2, streak: 2, missesInRow: 0 });
  });

  it("keeps the last Known mistake when a later miss has none", () => {
    expect(play([x10, WRONG]).lastMistake).toBe("multiplied_by_10");
  });

  it("does not change the state it is given", () => {
    const before = freshSkillState();
    applyAnswer(before, RIGHT);
    expect(before.tries).toBe(0);
  });
});

describe("Fluency and Your turn", () => {
  it("a Skill is fluent after two right in a row, and not after right, wrong, right", () => {
    expect(isFluent(play([RIGHT]))).toBe(false);
    expect(isFluent(play([RIGHT, RIGHT]))).toBe(true);
    expect(isFluent(play([RIGHT, WRONG, RIGHT]))).toBe(false);
  });

  it("Your turn is done once every Skill of the Check is fluent", () => {
    const fluent = play([RIGHT, RIGHT]);
    const halfway = play([RIGHT]);
    expect(yourTurnDone([fluent, fluent])).toBe(true);
    expect(yourTurnDone([fluent, halfway])).toBe(false);
    expect(yourTurnDone([fluent, freshSkillState()])).toBe(false);
  });

  it("a Check with no Skills is not decided by Skill state", () => {
    expect(yourTurnDone([])).toBe(false);
  });
});

describe("What comes next after an answer", () => {
  it("a right answer gets feedback, and says when the Skill turns fluent", () => {
    expect(nextMove(play([RIGHT]), RIGHT)).toEqual({ replyKind: "feedback", method: null, offerPark: false, fluent: false });
    expect(nextMove(play([RIGHT, RIGHT]), RIGHT)).toEqual({ replyKind: "feedback", method: null, offerPark: false, fluent: true });
  });

  it("the first miss gets feedback: one slip, one fix, one new try", () => {
    expect(nextMove(play([x10]), x10)).toEqual({ replyKind: "feedback", method: null, offerPark: false, fluent: false });
    expect(nextMove(play([RIGHT, WRONG]), WRONG)).toMatchObject({ replyKind: "feedback", method: null });
  });

  it("the second miss in a row re-teaches with the first method on the ladder", () => {
    expect(nextMove(play([x10, WRONG]), WRONG)).toEqual({ replyKind: "reteach", method: "restate", offerPark: false, fluent: false });
  });

  it("the third miss in a row offers to park, and so does every miss after it", () => {
    expect(nextMove(play([x10, WRONG, x10]), x10)).toEqual({ replyKind: "offer_park", method: null, offerPark: true, fluent: false });
    // "One more short try", missed again.
    expect(nextMove(play([x10, WRONG, x10, WRONG]), WRONG)).toMatchObject({ replyKind: "offer_park", offerPark: true });
  });

  it("a miss after a right answer starts the count again", () => {
    expect(nextMove(play([WRONG, WRONG, RIGHT, WRONG]), WRONG)).toMatchObject({ replyKind: "feedback", method: null });
  });

  it("the ladder is restate, worked example, fill-in boxes, Widget, drill of five", () => {
    expect(LADDER).toEqual(["restate", "worked", "boxes", "widget", "drill5"]);
  });

  it("each second miss climbs to the next unused method; the drill rung is a drill", () => {
    const seen: (string | null)[] = [];
    const kinds: string[] = [];
    let s = freshSkillState();
    for (let round = 0; round < 5; round++) {
      s = play([WRONG, WRONG], s);
      const move = nextMove(s, WRONG);
      seen.push(move.method);
      kinds.push(move.replyKind);
      s = { ...play([RIGHT], s), methodsUsed: [...s.methodsUsed, move.method!] };
    }
    expect(seen).toEqual(["restate", "worked", "boxes", "widget", "drill5"]);
    expect(kinds).toEqual(["reteach", "reteach", "reteach", "reteach", "drill"]);
  });

  it("skips methods already used, wherever they were used", () => {
    const s: SkillState = { ...play([WRONG, WRONG]), methodsUsed: ["restate", "boxes"] };
    expect(nextMove(s, WRONG).method).toBe("worked");
  });

  it("once all five are used it starts round again, never repeating the method just used", () => {
    const methods: string[] = [];
    let s: SkillState = { ...freshSkillState(), methodsUsed: ["restate", "worked", "boxes", "widget", "drill5"] };
    for (let round = 0; round < 7; round++) {
      s = play([WRONG, WRONG], s);
      const { method } = nextMove(s, WRONG);
      methods.push(method!);
      s = { ...play([RIGHT], s), methodsUsed: [...s.methodsUsed, method!] };
    }
    expect(methods).toEqual(["restate", "worked", "boxes", "widget", "drill5", "restate", "worked"]);
  });

  it("never returns the method just used, even when the Tutor used it out of order", () => {
    for (const last of LADDER) {
      const s: SkillState = { ...play([WRONG, WRONG]), methodsUsed: [...LADDER, last] };
      expect(nextMove(s, WRONG).method).not.toBe(last);
    }
    const s: SkillState = { ...play([WRONG, WRONG]), methodsUsed: ["worked"] };
    expect(nextMove(s, WRONG).method).toBe("restate");
  });
});

describe("Parking", () => {
  it("parks a Skill for 20 hours", () => {
    expect(parkUntil(new Date("2026-11-04T10:00:00Z"))).toEqual(new Date("2026-11-05T06:00:00Z"));
  });

  it("the drill is due once the parked time has passed, and never for a Skill that is not parked", () => {
    const parked: SkillState = { ...freshSkillState(), parkedUntil: new Date("2026-11-05T06:00:00Z") };
    expect(drillDue(parked, new Date("2026-11-05T05:59:59Z"))).toBe(false);
    expect(drillDue(parked, new Date("2026-11-05T06:00:00Z"))).toBe(true);
    expect(drillDue(freshSkillState(), new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
