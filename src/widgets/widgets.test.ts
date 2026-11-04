import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { CALCULATORS } from "@/finance/calculators";
import { widgetProblems, widgetRuleProblems } from "./check";
import frozen from "./frozen.generated.json";
import {
  OPENUI_SECTIONS_CUT,
  OPENUI_TEXT_REPLACED,
  WIDGET_COMPONENT_GROUPS,
  WIDGET_PROMPT_OPTIONS,
  widgetInstructions,
  widgetLibrary,
  withoutContradictions,
} from "./library";
import { WIDGET_TOOL_NAMES, WIDGET_TOOL_SPECS } from "./tool-specs";
import { TUTOR_INSTRUCTIONS } from "@/tutor/instructions";

const FROZEN_PATH = new URL("./frozen.generated.json", import.meta.url);
/** The schema alone, for the widget check: the browser runs it too, and needs none of the instructions' text. */
const FROZEN_SCHEMA_PATH = new URL("./frozen-schema.generated.json", import.meta.url);
const EXAMPLES = [...WIDGET_PROMPT_OPTIONS.examples, ...WIDGET_PROMPT_OPTIONS.toolExamples];

describe("widget instructions", () => {
  it("are generated once from the component library and checked in (run `npm run widgets:freeze` after changing it)", () => {
    const generated = {
      instructions: widgetInstructions(),
      schema: widgetLibrary.toJSONSchema(),
    };
    if (process.env.FREEZE) {
      writeFileSync(FROZEN_PATH, JSON.stringify(generated, null, 2) + "\n");
      writeFileSync(FROZEN_SCHEMA_PATH, JSON.stringify(generated.schema, null, 2) + "\n");
    }
    expect(JSON.parse(readFileSync(FROZEN_PATH, "utf8"))).toEqual(JSON.parse(JSON.stringify(generated)));
    expect(JSON.parse(readFileSync(FROZEN_SCHEMA_PATH, "utf8"))).toEqual(JSON.parse(JSON.stringify(generated.schema)));
  });

  it("teach inline mode, our parts, the kit's charts and tabs, and Query", () => {
    expect(frozen.instructions).toContain("openui-lang");
    expect(frozen.instructions).toContain("AnnuityChart(");
    expect(frozen.instructions).toContain("LineChart(");
    expect(frozen.instructions).toContain("Tabs(");
    expect(frozen.instructions).toContain("## Query — Live Data Fetching");
  });

  it("make widgets the way the Workspace shows things, with real numbers only from code and made-up ones labelled", () => {
    for (const rule of [
      "Widgets are how this Workspace shows things.",
      "When the Learner asks for a chart, graph, diagram, table, comparison, picture or anything to see, always build one in that reply.",
      "Real numbers come from code.",
      "Never type a historical figure or a computed result into a widget.",
      'start the Widget\'s title with "Illustration:"',
      "Bind Sliders to $variables and pass them into Query arguments",
      "Widgets only read: never use Mutation() or @Run.",
      "still show what code can compute, or a clearly labelled Illustration of the idea",
    ]) {
      expect(frozen.instructions).toContain(rule);
    }
    for (const old of ["Widgets are optional", "Charts never take data series", "draw no chart for it"]) expect(frozen.instructions).not.toContain(old);
  });

  it("give each slider's min, max and step, and ask only for numbers a Widget can show", () => {
    expect(frozen.instructions).toContain("Slider(name, label, min, max, step, value, unit)");
    expect(frozen.instructions).toContain("Use only numbers a Widget can show");
    expect(frozen.instructions).toMatch(/A percent slider always moves in 0\.01 steps/);
  });

  it("write every rate example in 0.01 steps", () => {
    const percentSliders = [...frozen.instructions.matchAll(/Slider\("[^"]*", "[^"]*", [\d.]+, [\d.]+, ([\d.]+), \$\w+, "percent"\)/g)];
    expect(percentSliders.length).toBeGreaterThan(3);
    for (const [slider, step] of percentSliders) expect(step, slider).toBe("0.01");
  });

  it("give every slider Widget a Guided Task, every kit chart its axis labels, and say to update an open Widget by reusing its title", () => {
    expect(frozen.instructions).toContain("Every Widget with a Slider has GuidedTasks");
    expect(frozen.instructions).toContain("give it an x-axis and a y-axis label");
    expect(frozen.instructions).toContain("write it again in full under exactly the same title");
    for (const example of EXAMPLES) expect(widgetRuleProblems(example), example).toEqual([]);
  });

  it("leave out OpenUI's advice that contradicts the Workspace: text-only answers, patches, writes, forms, buttons and mock data", () => {
    for (const heading of OPENUI_SECTIONS_CUT) expect(frozen.instructions).not.toContain(heading);
    for (const [openui, ours] of OPENUI_TEXT_REPLACED) {
      expect(frozen.instructions).not.toContain(openui.trim());
      if (ours) expect(frozen.instructions).toContain(ours);
    }
    expect(frozen.instructions).not.toContain("output ONLY the changed/new statements");
    expect(frozen.instructions).not.toContain("respond with text only");
    expect(frozen.instructions).not.toContain("Button(");
    expect(frozen.instructions).not.toContain('Mutation("');
    expect(frozen.instructions).not.toContain("realistic mock data");
  });

  it("fail loudly when OpenUI rewords a passage they leave out, instead of silently keeping it", () => {
    const raw = widgetLibrary.prompt(WIDGET_PROMPT_OPTIONS);
    expect(withoutContradictions(raw)).toBe(widgetInstructions());
    expect(() => withoutContradictions(raw.replace("output ONLY the changed/new statements", "output only the changed statements"))).toThrow(/no longer contains/);
    expect(() => withoutContradictions(raw.replace("## Mutation — Write Operations", "## Mutations"))).toThrow(/no longer contains/);
  });

  it("stay within the 12k tokens planned for them (about 4 characters a token)", () => {
    expect(frozen.instructions.length / 4).toBeLessThanOrEqual(12_000);
  });

  it("teach the Widget grammar v2: a question for a title, one control, the answer first, one visual, the budget, archetypes", () => {
    for (const rule of [
      "The title is a question the Learner answers by using it",
      'any other goes in Accordion "More settings"',
      "Verdict for a comparison, Stat for one number",
      "at most 3 numbers, 1 visual, 25 words of text",
      "never by joining it into text with +",
      "never with Select",
      "Never use PieChart or RadarChart",
      "Don't repeat the last archetype",
      'is a Breakeven, not a GuidedTask',
      "Widget notes",
    ]) {
      expect(frozen.instructions).toContain(rule);
    }
    for (const old of ["make it rich", "A number the Learner changes is always a Slider"]) expect(frozen.instructions).not.toContain(old);
  });

  it("with the widget engine off, grow the Tutor's instructions by at most 10% for the v2 language (44,836 characters before), plus the RateMove part", () => {
    // Spec #229 (ticket #238) grew the teaching rules before the Widget text on purpose. This bound is about the Widget
    // language, so it counts the rules at the 11,194 characters they had when it was set.
    expect(TUTOR_INSTRUCTIONS.endsWith(frozen.instructions)).toBe(true);
    expect(11_194 + 2 + frozen.instructions.length).toBeLessThanOrEqual(44_836 * 1.1 + 250); // + 250: RateMove (ticket #234), about 240 characters of part lists
  });

  it("group every part of the library, so none is listed under Other", () => {
    expect(WIDGET_COMPONENT_GROUPS.flatMap((g) => g.components).sort()).toEqual(Object.keys(widgetLibrary.components).sort());
    expect(frozen.instructions).not.toContain("### Other");
  });
});

describe("instruction guard", () => {
  const defs = (frozen.schema as unknown as { $defs: Record<string, unknown> }).$defs;
  /** The language's own calls, which are not components. Built-ins such as @Each( are not matched, being prefixed with @. */
  const LANGUAGE_CALLS = ["Query", "Mutation"];

  it("names only components the Widget library has, and teaches the Formula Card rule", () => {
    // Our own text (not the language's syntax lesson, which uses placeholder names).
    const ours = [
      WIDGET_PROMPT_OPTIONS.preamble,
      ...EXAMPLES,
      ...WIDGET_PROMPT_OPTIONS.additionalRules,
      ...WIDGET_COMPONENT_GROUPS.flatMap((g) => g.notes ?? []),
      ...WIDGET_TOOL_SPECS.map((t) => t.description ?? ""),
      ...OPENUI_TEXT_REPLACED.map(([, replacement]) => replacement),
    ].join("\n");
    const named = new Set([...ours.matchAll(/(?<![@\w])([A-Z][A-Za-z]+)\(/g)].map((m) => m[1]).filter((name) => !LANGUAGE_CALLS.includes(name)));
    expect(named.size).toBeGreaterThan(0);
    for (const name of named) expect(Object.keys(defs), `the instructions name ${name}(...)`).toContain(name);
    expect(frozen.instructions).toContain("FormulaCard(");
    expect(frozen.instructions).toContain("only as a FormulaCard");
    expect(frozen.instructions).toContain("Describe any other formula in words");
  });
});

describe("checking a finished widget on the server", () => {
  it("accepts every example widget", () => {
    for (const example of EXAMPLES) expect(widgetProblems(example), example).toEqual([]);
  });

  it("reports an unknown component (such as a kit part we dropped), a missing argument, and code with no root", () => {
    expect(widgetProblems('root = Widget("T", [b])\nb = Button("Go")').join("\n")).toMatch(/Unknown component "Button"/);
    expect(widgetProblems('root = Widget("T", [c])\nc = LineChart(["a", "b"])').join("\n")).toMatch(/series/);
    expect(widgetProblems('root = Widget("T", [c])\nc = AnnuityChart(1000)').length).toBeGreaterThan(0);
    expect(widgetProblems("this is not openui-lang").length).toBeGreaterThan(0);
  });
});

describe("the examples teach the rules", () => {
  const title = (example: string) => example.match(/^root = Widget\("([^"]*)"/)?.[1] ?? "";
  /** A Series given typed numbers, e.g. Series("Rate", [5, 5.5]), rather than a tool result's column. */
  const TYPED_SERIES = /Series\("[^"]*", \[[^\]]*\d/;

  it("never write: no Mutation and no @Run", () => {
    for (const example of EXAMPLES) expect(example).not.toMatch(/Mutation\(|@Run/);
  });

  it("type numbers into a chart only in an Illustration, whose title says so", () => {
    expect(EXAMPLES.filter((e) => TYPED_SERIES.test(e)).length).toBeGreaterThan(0);
    for (const example of EXAMPLES.filter((e) => TYPED_SERIES.test(e))) expect(title(example), example).toMatch(/^Illustration:/);
  });

  it("show each Widget tool at work in a Query", () => {
    for (const name of WIDGET_TOOL_NAMES) expect(WIDGET_PROMPT_OPTIONS.toolExamples.join("\n"), name).toContain(`Query("${name}"`);
  });
});

describe("our code-backed parts take references or formula inputs, never results", () => {
  type Prop = { type?: string; items?: Prop & { anyOf?: unknown[]; $ref?: string } };
  const defs = (frozen.schema as unknown as { $defs: Record<string, { properties: Record<string, Prop> }> }).$defs;
  const OURS = ["Slider", "Calculator", "AnnuityChart", "HistoryChart", "FormulaCard", "GuidedTasks", "GuidedTask"];

  it("none of them takes a list of numbers, so a Case's figures or a formula's results cannot be typed into them", () => {
    for (const name of OURS) {
      for (const [prop, schema] of Object.entries(defs[name].properties)) {
        const numbers = schema.type === "array" && (schema.items?.type === "number" || (schema.items?.type === undefined && !schema.items?.anyOf && !schema.items?.$ref));
        expect(numbers, `${name}.${prop}`).toBe(false);
      }
    }
  });

  it("the history chart takes a Case Data reference, the annuity chart and Formula Card formula inputs, and the Slider is ours", () => {
    expect(defs.HistoryChart.properties.dataset).toEqual({ type: "string" });
    expect(Object.keys(defs.AnnuityChart.properties)).toEqual(["total", "payments", "growthPercent", "ratePercent", "compareTo", "firstYear"]);
    expect(Object.keys(defs.FormulaCard.properties)).toEqual(["formula", "inputs", "sourced", "fixed"]);
    expect(Object.keys(defs.Slider.properties)).toEqual(["name", "label", "min", "max", "step", "value", "unit", "quick"]);
  });

  it("the instructions list the four Widget tools, each with a worked Query example", () => {
    for (const name of WIDGET_TOOL_NAMES) {
      expect(frozen.instructions).toContain(`- ${name}(`);
      expect(frozen.instructions).toContain(`Query("${name}"`);
    }
  });

  it("the instructions name the calculators a widget cannot run, those that take a list, in the calculate tool and the Calculator", () => {
    const takesList = CALCULATORS.filter((c) => Object.values((c.inputs as unknown as z.ZodObject).shape).some((input) => input instanceof z.ZodArray)).map((c) => c.id);
    expect(takesList).toEqual(["npv", "irr", "dcf"]);
    const said = "Inputs are numbers only, so npv, irr and dcf, which take a list of cash flows, cannot run";
    expect(frozen.instructions.split(said)).toHaveLength(3);
  });
});
