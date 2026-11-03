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

describe("instruction guard", () => {
  const defs = (frozen.schema as unknown as { $defs: Record<string, unknown> }).$defs;

  it("names only components the Widget library has, and teaches the Formula Card rule", () => {
    // Our own examples and rules (not the language's syntax lesson, which uses placeholder names).
    const ours = [WIDGET_PROMPT_OPTIONS.preamble, ...WIDGET_PROMPT_OPTIONS.examples, ...WIDGET_PROMPT_OPTIONS.additionalRules].join("\n");
    const named = new Set([...ours.matchAll(/\b([A-Z][A-Za-z]+)\(/g)].map((m) => m[1]));
    expect(named.size).toBeGreaterThan(0);
    for (const name of named) expect(Object.keys(defs), `the instructions name ${name}(...)`).toContain(name);
    expect(frozen.instructions).toContain("FormulaCard(");
    expect(frozen.instructions).toContain("only as a FormulaCard");
    expect(frozen.instructions).toContain("Describe any other formula in words");
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

describe("chart components take data only by reference or formula", () => {
  type Prop = { type?: string; items?: Prop & { anyOf?: unknown[]; $ref?: string } };
  const defs = (frozen.schema as unknown as { $defs: Record<string, { properties: Record<string, Prop> }> }).$defs;

  it("no component accepts a list of numbers, so the Tutor cannot type a series", () => {
    for (const [name, def] of Object.entries(defs)) {
      for (const [prop, schema] of Object.entries(def.properties)) {
        const numbers = schema.type === "array" && (schema.items?.type === "number" || schema.items?.type === undefined && !schema.items?.anyOf && !schema.items?.$ref);
        expect(numbers, `${name}.${prop}`).toBe(false);
      }
    }
  });

  it("the history chart takes a Case Data reference, and the annuity chart formula inputs", () => {
    expect(defs.HistoryChart.properties.dataset).toEqual({ type: "string" });
    expect(Object.keys(defs.AnnuityChart.properties)).toEqual(["total", "payments", "growthPercent", "ratePercent", "compareTo"]);
  });
});
