import { describe, expect, it } from "vitest";
import { widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { loadCourseMap, type Topic } from "./map";
import { buildScene, buildTermCard, sceneCheckErrors, scenesInStepOrder } from "./scenes";
import { sceneFixtureTopic } from "./scenes-fixture";

// Scenes (E3): plain Node cannot load the Widget recipes, so `npm run course:check` cannot build a Topic's
// scenes (scripts/check-course.mjs); this test, part of `npm run check`, builds every one instead (the
// lesson-presets precedent). Errors read `Scene "<id>": <reason> (Topic "<id>")`.

const clone = (t: Topic) => structuredClone(t);

describe("Topic scenes", () => {
  it("builds every scene in the real Course Map", () => {
    expect(sceneCheckErrors(loadCourseMap().topics)).toEqual([]);
  });

  it("builds every scene of the fixture Topic, and each passes the Widget checks", () => {
    const topic = sceneFixtureTopic();
    expect(topic.scenes.map((s) => s.recipe)).toEqual([
      "story_scene",
      "lingo_card",
      "two_paths",
      "who_pays_whom",
      "money_jar",
      "choice_cards",
      "myth_or_fact",
      "headline",
      "timeline",
    ]);
    expect(sceneCheckErrors([topic])).toEqual([]);
    for (const scene of topic.scenes) {
      const built = buildScene(topic, scene);
      if (!built.ok) throw new Error(`${scene.id}: ${built.error}`);
      expect(widgetProblems(built.code), scene.id).toEqual([]);
      expect(widgetRuleProblems(built.code), scene.id).toEqual([]);
    }
  });

  it("orders scenes by Teaching Step", () => {
    const topic = sceneFixtureTopic();
    expect(scenesInStepOrder(topic).map((s) => s.step)).toEqual(["story", "concept", "concept", "concept", "explore", "your_turn", "check", "reveal", "principle"]);
  });

  it("fails a scene that names no Widget recipe, in the scene error shape", () => {
    const topic = clone(sceneFixtureTopic());
    topic.scenes[0].recipe = "story_scne";
    expect(sceneCheckErrors([topic])).toEqual([expect.stringMatching(/^Scene "opening-story": "story_scne" is not a Widget recipe \(.*story_scene.*\) \(Topic "scene-fixture"\)$/)]);
  });

  it("fails a scene whose emoji is not in the registry, and one dated after the as-of date before the reveal", () => {
    const badEmoji = clone(sceneFixtureTopic());
    (badEmoji.scenes[0].inputs as { cast: { emoji: string }[] }).cast[0].emoji = "pizza-slice";
    expect(sceneCheckErrors([badEmoji]).join(" ")).toContain('Scene "opening-story"');
    expect(sceneCheckErrors([badEmoji]).join(" ")).toContain('emoji "pizza-slice" is not in src/emoji/registry.ts');

    const early = clone(sceneFixtureTopic());
    const line = early.scenes.find((s) => s.recipe === "timeline")!;
    line.step = "concept";
    line.check = "fixture-check-1";
    early.scenes = early.scenes.filter((s) => !(s.step === "concept" && s.check === "fixture-check-1" && s.id !== line.id));
    expect(sceneCheckErrors([early]).join(" ")).toContain("1994-05-09");
  });

  it("builds the Running example's scene and fails it in its own error shape", () => {
    const topic = clone(sceneFixtureTopic());
    expect(topic.runningExample?.scene).toBeDefined();
    topic.runningExample!.scene!.cast[0].emoji = "pizza-slice";
    expect(sceneCheckErrors([topic])).toEqual([expect.stringMatching(/^runningExample\.scene: emoji "pizza-slice" is not in src\/emoji\/registry\.ts \(Topic "scene-fixture"\)$/)]);
  });

  it("builds a complete term as a Lingo card, and leaves an old term to words", () => {
    const topic = sceneFixtureTopic();
    const built = buildTermCard(topic, topic.terms[0]);
    expect(built?.ok).toBe(true);
    if (built?.ok) expect(widgetProblems(built.code)).toEqual([]);
    expect(buildTermCard(topic, { term: "Yield", means: "Income for lending." })).toBeNull();
  });
});
