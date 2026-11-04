import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "./lesson-fixture";
import { parseCourseMap } from "./map";
import { courseOverview, finishFromPractice, navigate, nextOffer, takeNext, type Progress } from "./navigator";

function loaded() {
  const { map, errors } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const at = (step: Progress["topics"][string]["step"]): Progress => ({
  currentTopicId: "pct-demo",
  topics: { "pct-demo": { step, passedChecks: [], revealShown: false, status: "in_progress" } },
});
const until = new Date("2026-11-05T09:30:00Z");

describe("parked Skills hold the Learner's place", () => {
  it("names the parked Skills of the current Check, and the step waits", () => {
    const map = loaded();
    const place = navigate(map, at("your_turn"), { "pct-demo": { "pts-to-bp": until } });
    expect(place?.step).toBe("your_turn");
    expect(place?.parked).toEqual([{ skillId: "pts-to-bp", until }]);
  });

  it("ignores a parked Skill the current Check does not teach", () => {
    const place = navigate(loaded(), at("your_turn"), { "pct-demo": { "pct-change": until } });
    expect(place?.parked).toEqual([]);
  });

  it("offers no Next, and takes none, while a Skill of the current Check is parked", () => {
    const map = loaded();
    const parked = { "pct-demo": { pts: until } };
    expect(nextOffer(map, at("concept"), { begun: true })).not.toBeNull();
    expect(nextOffer(map, at("concept"), { begun: true }, parked)).toBeNull();
    expect(takeNext(map, at("concept"), "your_turn", { begun: true }, parked)).toMatchObject({ ok: false });
  });

  it("behaves as before with no parked Skills", () => {
    const map = loaded();
    expect(navigate(map, at("your_turn"))?.parked ?? []).toEqual([]);
    expect(nextOffer(map, at("concept"), { begun: true }, {})).toMatchObject({ kind: "next", step: "your_turn" });
  });

  it("shows on the Course Map when a parked Topic comes back", () => {
    const map = loaded();
    const later = new Date("2026-11-05T12:00:00Z");
    const [row] = courseOverview(map, at("your_turn"), { "pct-demo": { pts: until, "bp-to-pts": later } });
    expect(row.parkedUntil).toEqual(later);
    expect(courseOverview(map, at("your_turn"))[0].parkedUntil).toBeNull();
  });
});

describe("Your turn while parked", () => {
  it("cannot finish, even when every Skill is fluent", () => {
    const map = loaded();
    expect(finishFromPractice(map, at("your_turn"), true)).toMatchObject({ ok: true });
    expect(finishFromPractice(map, at("your_turn"), true, { "pct-demo": { "bp-to-pts": until } })).toMatchObject({ ok: false });
  });
});
