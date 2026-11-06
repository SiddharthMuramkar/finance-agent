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
    // Percent's story scene (E6a) was shown already, so the scene rule gives nothing.
    const picked = pickCompanion(input(percent, { replyText, shownThisSession: { scenes: ["fed-opening"], terms: [] } }));
    expect(picked?.kind).toBe("lingo");
    expect(termOf(picked)).toBe("percentage point");
  });

  it("skips a term already carded in this Session: basis point once percentage point is carded", () => {
    const replyText = "The rate rose by a percentage point, or 100 basis points, in one day.";
    const picked = pickCompanion(input(percent, { replyText, shownThisSession: { scenes: ["fed-opening"], terms: ["percentage point"] } }));
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

  it("gives every Topic a Companion at every step: the Case safety net uses the earliest Case, the story steps' date limit", () => {
    const steps = ["story", "concept", "explore", "your_turn", "check", "reveal", "principle"] as const;
    const missing: string[] = [];
    for (const topic of map.topics) {
      if (!topic.cases.length) continue;
      for (const step of steps) {
        const picked = pickCompanion(input(topic, { place: { step, check: null }, replyText: "" }));
        if (!picked) missing.push(`${topic.id}@${step}`);
      }
    }
    expect(missing).toEqual([]);
    // Topics whose first-listed Case is not the earliest: the timeline beat carries the earliest asOf before the reveal.
    for (const id of ["ana-build-valuation", "ana-india-transfer", "jud-units-periods"]) {
      const topic = map.topic(id)!;
      const earliest = [...topic.cases].sort((a, b) => a.asOf.localeCompare(b.asOf))[0];
      const picked = pickCompanion(input(topic, { replyText: "" }));
      expect({ id, kind: picked?.kind, key: picked?.key }).toEqual({ id, kind: "case", key: earliest.id });
    }
  });

  it("skips a scene whose beat text shows an open quiz's blocked numbers (3.5, 50) and goes on to the next rule", () => {
    // The blocked numbers are none of the scene date's parts (1994, 2, 3), so only the injected beat can skip it.
    const blocked = [3.5, 50];
    const before = pickCompanion(input(fixture, { replyText: "The yield is what the bond pays.", blocked }));
    expect(before).toMatchObject({ kind: "scene", recipe: "story_scene", key: "opening-story" });
    const withNumbers: Topic = structuredClone(fixture);
    const opening = withNumbers.scenes.find((s) => s.id === "opening-story")!;
    (opening.inputs.beats as { who: string; says: string }[])[1] = { who: "narrator", says: "Tomorrow the rate may go to 3.5%." };
    const picked = pickCompanion(input(withNumbers, { replyText: "The yield is what the bond pays.", blocked }));
    expect(picked?.kind).toBe("lingo");
    expect(termOf(picked)).toBe("yield");
  });
});
