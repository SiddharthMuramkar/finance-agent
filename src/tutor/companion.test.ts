import { describe, expect, it } from "vitest";
import { loadCourseMap, type Topic } from "@/course/map";
import { sceneFixtureTopic } from "@/course/scenes-fixture";
import { pickCompanion, type CompanionInput } from "./companion";

/**
 * Seam 3, the Companion Widget picker (spec 2026-11-05, E4a): when a reply has no Widget, code picks one. The first
 * rule that gives a Widget wins: the step's story scene, a Lingo card for the first Topic term in the reply, the
 * Running-example scene, and last the Case's one-beat timeline. A candidate showing an open quiz's numbers is skipped.
 */

const map = loadCourseMap();
const percent = map.topic("num-percent-bps")!;
const fixture = sceneFixtureTopic();

const input = (topic: Topic, over: Partial<CompanionInput> = {}): CompanionInput => ({
  topic,
  place: { step: "story", check: null },
  replyText: "",
  shownThisSession: { scenes: [], terms: [] },
  blocked: [],
  ...over,
});

const termOf = (picked: ReturnType<typeof pickCompanion>) => (picked?.params.inputs as { term?: string } | undefined)?.term?.toLowerCase();

describe("the Companion Widget picker", () => {
  it("gives the story step's written-ahead scene first", () => {
    const picked = pickCompanion(input(fixture, { replyText: "February 1994. Everyone expects calm, and the yield on old bonds is steady." }));
    expect(picked).toMatchObject({ kind: "scene", recipe: "story_scene", key: "opening-story" });
  });

  it("gives a Lingo card for the first term in the reply once the scene was shown", () => {
    const picked = pickCompanion(
      input(fixture, { replyText: "Traders count the move in basis points, and the yield moves with it.", shownThisSession: { scenes: ["opening-story"], terms: [] } }),
    );
    expect(picked).toMatchObject({ kind: "lingo", recipe: "lingo_card" });
    expect(termOf(picked)).toBe("basis point");
  });

  it("takes the term that comes first in the text: percentage point before basis point", () => {
    const replyText = "The rate rose by a percentage point, or 100 basis points, in one day.";
    const picked = pickCompanion(input(percent, { replyText }));
    expect(picked?.kind).toBe("lingo");
    expect(termOf(picked)).toBe("percentage point");
  });

  it("skips a term already carded in this Session: basis point once percentage point is carded", () => {
    const replyText = "The rate rose by a percentage point, or 100 basis points, in one day.";
    const picked = pickCompanion(input(percent, { replyText, shownThisSession: { scenes: [], terms: ["percentage point"] } }));
    expect(termOf(picked)).toBe("basis point");
  });

  it("gives the Running-example scene once every term is carded", () => {
    const picked = pickCompanion(
      input(fixture, { replyText: "The yield is quoted in basis points.", shownThisSession: { scenes: ["opening-story"], terms: ["yield", "basis point"] } }),
    );
    expect(picked).toMatchObject({ kind: "running_example", recipe: "story_scene" });
  });

  it("gives the Case's one-beat timeline for a Topic with no scenes, terms or Running-example scene (num-econometrics)", () => {
    const econ = map.topic("num-econometrics")!;
    const picked = pickCompanion(input(econ, { replyText: "Two economists publish a study of public debt." }));
    expect(picked).toMatchObject({ kind: "case", recipe: "timeline" });
    const beats = (picked!.params.inputs as { beats: { date: string; label: string; emoji: string }[] }).beats;
    expect(beats).toEqual([{ date: "2010-05-01", label: "Reinhart and Rogoff's 90% debt threshold", emoji: "spiral-calendar" }]);
  });

  it("skips a scene that shows an open quiz's blocked numbers (3, 3.5, 50) and goes on to the next rule", () => {
    const withNumbers: Topic = structuredClone(fixture);
    const opening = withNumbers.scenes.find((s) => s.id === "opening-story")!;
    (opening.inputs.beats as { who: string; says: string }[])[1] = { who: "narrator", says: "Tomorrow the rate may go to 3.5%." };
    const picked = pickCompanion(input(withNumbers, { replyText: "The yield is what the bond pays.", blocked: [3, 3.5, 50] }));
    expect(picked?.kind).toBe("lingo");
    expect(termOf(picked)).toBe("yield");
  });
});
