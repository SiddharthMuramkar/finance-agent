import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { widgetProblems } from "./check";
import frozen from "./frozen.generated.json";
import { WIDGET_PROMPT_OPTIONS, widgetLibrary } from "./library";

const FROZEN_PATH = new URL("./frozen.generated.json", import.meta.url);

describe("widget instructions", () => {
  it("are generated once from the component library and checked in (run `npm run widgets:freeze` after changing it)", () => {
    const generated = {
      instructions: widgetLibrary.prompt(WIDGET_PROMPT_OPTIONS),
      schema: widgetLibrary.toJSONSchema(),
    };
    if (process.env.FREEZE) writeFileSync(FROZEN_PATH, JSON.stringify(generated, null, 2) + "\n");
    expect(JSON.parse(readFileSync(FROZEN_PATH, "utf8"))).toEqual(JSON.parse(JSON.stringify(generated)));
  });

  it("teach inline mode and the components, and forbid typed data series", () => {
    expect(frozen.instructions).toContain("openui-lang");
    expect(frozen.instructions).toContain("AnnuityChart(");
    expect(frozen.instructions).toContain("Charts never take data series");
  });
});

describe("checking a finished widget on the server", () => {
  it("accepts the example widget", () => {
    expect(widgetProblems(WIDGET_PROMPT_OPTIONS.examples[0])).toEqual([]);
  });

  it("reports an unknown component, a missing argument, and code with no root", () => {
    expect(widgetProblems('root = Widget("T", [c])\nc = LineChart([1, 2, 3])').join("\n")).toMatch(/LineChart/);
    expect(widgetProblems('root = Widget("T", [c])\nc = AnnuityChart(1000)').length).toBeGreaterThan(0);
    expect(widgetProblems("this is not openui-lang").length).toBeGreaterThan(0);
  });
});
