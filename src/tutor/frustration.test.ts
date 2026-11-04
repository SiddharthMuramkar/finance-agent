import { describe, expect, it } from "vitest";
import { freshSkillState } from "@/teaching/ladder";
import { frustrationCount, type FrustrationEvent } from "./frustration";

const said = (text: string): FrustrationEvent => ({ kind: "learner", text });
const right: FrustrationEvent = { kind: "right" };
const missing = (n: number) => ({ ...freshSkillState(), missesInRow: n });

describe("frustrationCount", () => {
  it("is 0 with no signal and no misses", () => {
    expect(frustrationCount([said("ok"), said("what next?")], null)).toBe(0);
  });

  it("counts each signal phrase in the Learner's last three messages, ignoring case and apostrophes", () => {
    expect(frustrationCount([said("This is TOO COMPLICATED"), said("I dont know any of this"), said("just get it over with")], null)).toBe(3);
    expect(frustrationCount([said("way over complicated")], null)).toBe(1);
    expect(frustrationCount([said("I don’t know any of this")], null)).toBe(1);
  });

  it("no longer counts a phrase four messages back", () => {
    expect(frustrationCount([said("too complicated"), said("a"), said("b"), said("c")], null)).toBe(0);
  });

  it("adds 1 when the current Skill has two or more misses in a row", () => {
    expect(frustrationCount([said("too complicated")], missing(2))).toBe(2);
    expect(frustrationCount([], missing(1))).toBe(0);
    expect(frustrationCount([], missing(3))).toBe(1);
  });

  it("resets on a right code-marked answer", () => {
    expect(frustrationCount([said("too complicated"), right, said("ok")], freshSkillState())).toBe(0);
    expect(frustrationCount([said("too complicated"), right, said("get it over with")], null)).toBe(1);
  });
});
