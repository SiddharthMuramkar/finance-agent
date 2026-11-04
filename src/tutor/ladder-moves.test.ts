import { describe, expect, it } from "vitest";
import { applyAnswer, freshSkillState, LADDER, type Method, type SkillState } from "@/teaching/ladder";
import { ladderAction, parkedLine, PARK_OFFER_LINE, practiceTitle } from "./ladder-moves";

const miss = { verdict: "wrong" } as const;

/** The state after `n` misses in a row, having been taught again with `used`. */
function after(n: number, used: Method[] = []): SkillState {
  let s: SkillState = { ...freshSkillState(), methodsUsed: used };
  for (let i = 0; i < n; i++) s = applyAnswer(s, miss);
  return s;
}

describe("ladderAction", () => {
  it("gives feedback on a right answer and on a first miss", () => {
    expect(ladderAction(applyAnswer(freshSkillState(), { verdict: "right" }), { verdict: "right" })).toEqual({ kind: "feedback" });
    expect(ladderAction(after(1), miss)).toEqual({ kind: "feedback" });
  });

  it("re-teaches on the second miss in a row, naming the Reply kind and method in plain words", () => {
    const a = ladderAction(after(2), miss);
    expect(a).toMatchObject({ kind: "reteach", method: "restate", replyKind: "reteach" });
    if (a.kind !== "reteach") throw new Error("expected a re-teach");
    expect(a.note).toContain("Reply kind: reteach");
    expect(a.note).toContain("Method: restate");
    expect(a.note).not.toMatch(/skill state|step id|drill5|_/i);
  });

  it("re-teaches after a Known mistake too", () => {
    const s = applyAnswer(applyAnswer(freshSkillState(), { verdict: "known_mistake", tag: "used_x10" }), { verdict: "known_mistake", tag: "used_x10" });
    expect(ladderAction(s, { verdict: "known_mistake", tag: "used_x10" })).toMatchObject({ kind: "reteach" });
  });

  it("names a drill of five as Reply kind drill", () => {
    const a = ladderAction(after(2, ["restate", "worked", "boxes", "widget"]), miss);
    expect(a).toMatchObject({ kind: "reteach", method: "drill5", replyKind: "drill" });
    if (a.kind === "reteach") expect(a.note).toContain("Reply kind: drill");
  });

  it("never names the method just used for that Skill", () => {
    for (let k = 0; k < 12; k++) {
      const used: Method[] = Array.from({ length: k }, (_, i) => LADDER[i % LADDER.length]);
      const a = ladderAction(after(2, used), miss);
      if (a.kind !== "reteach") throw new Error("expected a re-teach");
      if (used.length) expect(a.method).not.toBe(used[used.length - 1]);
    }
  });

  it("offers to park on the third miss in a row and every one after", () => {
    expect(ladderAction(after(3), miss)).toEqual({ kind: "park_offer" });
    expect(ladderAction(after(5), miss)).toEqual({ kind: "park_offer" });
  });
});

describe("the park lines", () => {
  it("offers the park in code's own line", () => {
    expect(PARK_OFFER_LINE).toMatch(/park/i);
  });

  it("says when the Skill comes back, as a weekday and a time in India", () => {
    // 2026-11-05 09:30 UTC is Thursday 3:00 pm in India.
    expect(parkedLine(new Date("2026-11-05T09:30:00Z"))).toBe("Back tomorrow after Thu 3:00 pm");
  });

  it("titles a practice Widget apart from its card's show-mode Widget", () => {
    expect(practiceTitle("Points and percent")).toBe("Points and percent · practice");
  });
});
