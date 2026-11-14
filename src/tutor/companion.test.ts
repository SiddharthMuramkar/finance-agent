import { describe, expect, it } from "vitest";
import { loadCourseMap, type Topic } from "@/course/map";
import { sceneFixtureTopic } from "@/course/scenes-fixture";
import { asksWhatAWordMeans, pickCompanion, type CompanionInput } from "./companion";

/**
 * Seam 3, the Companion Widget picker (spec 2026-11-12, B6, ADR 0019; was E4a): when a step-led reply has no Widget,
 * code may add the step's own story scene or, when the Learner asked what a word means, a Lingo card for that word.
 * Nothing else: the Running example's scene and the Case's date and title card are no longer Companions, and with
 * neither the Widget already showing stays. A candidate showing an open quiz's numbers is skipped.
 */

const map = loadCourseMap();
const percent = map.topic("num-percent-bps")!;
const fixture = sceneFixtureTopic();
/** The G6 Choice's words: the Learner asked what a word means. */
const ASKS = "What does 'basis point' mean?";

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

  it("gives no Lingo card when the Learner did not ask what a word means: the Widget showing stays", () => {
    const shown = { scenes: ["opening-story"], terms: [] };
    expect(pickCompanion(input(fixture, { replyText: "Traders count the move in basis points.", shownThisSession: shown }))).toBeNull();
    expect(pickCompanion(input(fixture, { replyText: "Traders count the move in basis points.", shownThisSession: shown, learnerText: "Show me." }))).toBeNull();
  });

  it("gives the Lingo card for the word asked about before the step's unshown scene: it answers the question", () => {
    const picked = pickCompanion(input(fixture, { replyText: "Traders count the move in basis points.", learnerText: ASKS }));
    expect(picked).toMatchObject({ kind: "lingo", recipe: "lingo_card" });
    expect(termOf(picked)).toBe("basis point");
  });

  it("gives a Lingo card for the word the Learner asked about, once the scene was shown", () => {
    const picked = pickCompanion(
      input(fixture, { replyText: "Traders count the move in basis points, and the yield moves with it.", shownThisSession: { scenes: ["opening-story"], terms: [] }, learnerText: ASKS }),
    );
    expect(picked).toMatchObject({ kind: "lingo", recipe: "lingo_card" });
    expect(termOf(picked)).toBe("basis point");
  });

  it("takes the word the Learner named over the reply's first term", () => {
    const replyText = "The rate rose by a percentage point, or 100 basis points, in one day.";
    const shown = { scenes: ["fed-opening"], terms: [] };
    expect(termOf(pickCompanion(input(percent, { replyText, shownThisSession: shown, learnerText: ASKS })))).toBe("basis point");
    // Asked without naming a word: the reply's first term, percentage point before basis point.
    expect(termOf(pickCompanion(input(percent, { replyText, shownThisSession: shown, learnerText: "What does that word mean?" })))).toBe("percentage point");
  });

  it("gives nothing new when the word asked about is already carded, never another word's card", () => {
    const replyText = "The rate rose by a percentage point, or 100 basis points, in one day.";
    expect(pickCompanion(input(percent, { replyText, shownThisSession: { scenes: ["fed-opening"], terms: ["basis point"] }, learnerText: ASKS }))).toBeNull();
  });

  it("skips a term already carded in this Session: basis point once percentage point is carded", () => {
    const replyText = "The rate rose by a percentage point, or 100 basis points, in one day.";
    const picked = pickCompanion(input(percent, { replyText, shownThisSession: { scenes: ["fed-opening"], terms: ["percentage point"] }, learnerText: "What does that word mean?" }));
    expect(termOf(picked)).toBe("basis point");
  });

  it("never gives the Running-example scene or the Case's date and title card (B6)", () => {
    const carded = pickCompanion(
      input(fixture, { replyText: "The yield is quoted in basis points.", shownThisSession: { scenes: ["opening-story"], terms: ["yield", "basis point"] }, learnerText: "What does that word mean?" }),
    );
    expect(carded).toBeNull();
    const econ = map.topic("num-econometrics")!;
    expect(pickCompanion(input(econ, { replyText: "Two economists publish a study of public debt." }))).toBeNull();
    const kinds = new Set<string>();
    for (const topic of map.topics)
      for (const step of ["story", "concept", "explore", "your_turn", "check", "reveal", "principle"] as const) {
        const picked = pickCompanion(input(topic, { place: { step, check: null }, replyText: "", learnerText: "What does that word mean?" }));
        if (picked) kinds.add(picked.kind);
      }
    expect([...kinds].filter((k) => k === "running_example" || k === "case")).toEqual([]);
  });

  it("knows a question about a word's meaning", () => {
    for (const asks of [ASKS, "What does that word mean?", "what does bp mean", "meaning of yield please"]) expect(asksWhatAWordMeans(asks)).toBe(true);
    for (const not of ["Show me.", "Why am I learning basis points?", "Go deeper", "I already know percentages.", "What do you mean?", "What is the answer?", "What's next?", null])
      expect(asksWhatAWordMeans(not)).toBe(false);
  });

  it("skips a scene whose beat text shows an open quiz's blocked numbers (3.5, 50) and goes on to the next rule", () => {
    // The blocked numbers are none of the scene date's parts (1994, 2, 3), so only the injected beat can skip it.
    const blocked = [3.5, 50];
    const before = pickCompanion(input(fixture, { replyText: "The yield is what the bond pays.", blocked }));
    expect(before).toMatchObject({ kind: "scene", recipe: "story_scene", key: "opening-story" });
    const withNumbers: Topic = structuredClone(fixture);
    const opening = withNumbers.scenes.find((s) => s.id === "opening-story")!;
    (opening.inputs.beats as { who: string; says: string }[])[1] = { who: "narrator", says: "Tomorrow the rate may go to 3.5%." };
    expect(pickCompanion(input(withNumbers, { replyText: "The yield is what the bond pays.", blocked }))).toBeNull();
  });
});
