import { describe, expect, it } from "vitest";
import { widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { RECIPES } from "@/widgets/recipes";
import { exploreWidgetOf, exploreWorkbenchBuild } from "./explore-widget";
import { loadCourseMap } from "./map";

// Every Topic's explore Workbench builds and passes the Widget checks, with the reason when it does not (spec C2, B2-B4),
// so a Topic file's Workbench can never be dropped without a word. scripts/check-course.mjs runs this file too: plain
// Node cannot load the recipes.

const map = loadCourseMap();
const SPINE = Array.from({ length: 15 }, (_, i) => `spine-${String(i + 1).padStart(2, "0")}-`);

describe("explore Workbenches build (C2, B2-B4)", () => {
  const benches = map.topics.filter((t) => t.explore?.workbench);

  it("finds the Topics with one", () => expect(benches.length).toBeGreaterThan(0));

  for (const topic of benches) {
    it(`${topic.id}: its ${topic.explore!.workbench!.recipe} builds and passes the Widget checks`, () => {
      const built = exploreWorkbenchBuild(topic);
      if (!built?.ok) throw new Error(`Topic "${topic.id}": its explore Workbench does not build: ${built?.ok === false ? built.error : "no Workbench"}`);
      expect(widgetProblems(built.code)).toEqual([]);
      expect(widgetRuleProblems(built.code)).toEqual([]);
      expect(exploreWidgetOf(topic)?.code).toBe(built.code);
    });
  }

  it("names the reason when a Workbench does not build, and the Topic gets none", () => {
    const topic = { id: "t", title: "T", widgets: [], explore: { workbench: { recipe: "value_levers", case: "no-such-case", inputs: {} } } };
    const built = exploreWorkbenchBuild(topic as never);
    expect(built?.ok).toBe(false);
    expect(built?.ok === false && built.error).toMatch(/Valuation Case/);
    const quiet = console.error;
    const said: string[] = [];
    console.error = (m: string) => said.push(m);
    try {
      expect(exploreWidgetOf(topic as never)).toBeNull();
    } finally {
      console.error = quiet;
    }
    expect(said[0]).toMatch(/^Topic "t": its explore Workbench does not build/);
    expect(exploreWorkbenchBuild({ ...topic, explore: { workbench: { recipe: "nope", inputs: {} } } } as never)).toEqual({ ok: false, error: 'there is no Widget recipe "nope"' });
  });
});

describe("Spine Topics 1 to 15 each have their explore Widget (C2, Appendix D)", () => {
  for (const prefix of SPINE) {
    it(`${prefix}…`, () => {
      const topic = map.topics.find((t) => t.id.startsWith(prefix));
      expect(topic, `a Topic file ${prefix}*`).toBeDefined();
      const widget = exploreWidgetOf(topic!);
      expect(widget, `${topic!.id} explore Widget`).not.toBeNull();
      if (topic!.explore?.workbench) {
        const recipe = RECIPES.find((r) => r.id === topic!.explore!.workbench!.recipe);
        expect(recipe?.archetype).toBe("workbench");
      }
    });
  }
});
