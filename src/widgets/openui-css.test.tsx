import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Renderer } from "@openuidev/react-lang";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GenuiTheme } from "./genui-theme";
import { widgetLibrary } from "./library";

// globals.css imports only the OpenUI stylesheets of the parts the Widget library keeps (the whole kit is 363 KB).
// This proves nothing the kept parts draw lost its rules: it draws one of every kept part and checks that every
// `openui-` class the kit's full stylesheet styles is styled by the sheets globals.css imports.

const require_ = createRequire(import.meta.url);
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const imported = [...globals.matchAll(/@import "(@openuidev\/react-ui\/layered\/styles\/[\w.-]+\.css)"/g)].map((m) => m[1]);
const sheet = (name: string) => readFileSync(require_.resolve(name), "utf8");
const classesOf = (css: string) => new Set([...css.matchAll(/\.(openui-[\w-]+)/g)].map((m) => m[1]));

const kept = classesOf(imported.map(sheet).join("\n"));
const whole = classesOf(sheet("@openuidev/react-ui/layered/styles/index.css"));

/** One of every kit part the Widget library keeps, with the arguments the prompt gives it. */
const EVERY_KEPT_PART = `root = Widget("Every kept part", [slide, tabs, acc, steps, sep, card, table, line, area, bar, hbar, radar, pie, radial, stacked, scatter, field, switches, chips, tags, tagBlock, entities, tcallout, callout])
$level = 5
slide = Slider("level", "A level", 0, 10, 1, $level)
tabs = Tabs([TabItem("a", "First", [TextContent("In a tab", "default")]), TabItem("b", "Second", [CardHeader("Title", "Sub")])])
acc = Accordion([AccordionItem("x", "Open me", [TextContent("Inside **bold** text")])])
steps = Steps([StepsItem("Start", "Do the first thing"), StepsItem("Then", "Do the next")])
sep = Separator()
card = Card([CardHeader("Card", "With a header"), InlineHeader("Heading", "Description"), TextContent("Big", "large-heavy")])
table = Table([Col("Year", ["2020", "2021"]), Col("Value", [1, 2], "number")])
line = LineChart(["a", "b"], [Series("One", [1, 2]), Series("Two", [2, 3])])
area = AreaChart(["a", "b"], [Series("One", [1, 2])])
bar = BarChart(["a", "b"], [Series("One", [1, 2])])
hbar = HorizontalBarChart(["a", "b"], [Series("One", [1, 2])])
radar = RadarChart(["a", "b", "c"], [Series("One", [1, 2, 3])])
pie = PieChart(["a", "b"], [1, 2], "donut")
radial = RadialChart(["a", "b"], [1, 2])
stacked = SingleStackedBarChart(["a", "b"], [1, 2])
scatter = ScatterChart([ScatterSeries("S", [Point(1, 2), Point(2, 3)])], "x", "y")
field = FormControl("Pick one", Select("pick", [SelectItem("a", "A"), SelectItem("b", "B")], "Choose"), "A hint")
switches = SwitchGroup("sw", [SwitchItem("Option", "Described", "o1", true)])
chips = Chips("ch", "single", [ChipItem("a", "A"), ChipItem("b", "B")])
tags = Tag("Tag", null, "md", "info")
tagBlock = TagBlock(["one", "two"])
entities = EntityList([{left: "Left", right: "Right"}])
tcallout = TextCallout("info", "Heads up", "Some detail")
callout = Callout("success", "Done", "It worked")`;

describe("the OpenUI stylesheets globals.css imports", () => {
  it("import something, and far less than the whole kit", () => {
    expect(imported.length).toBeGreaterThan(10);
    const bytes = imported.reduce((n, name) => n + sheet(name).length, 0);
    expect(bytes).toBeLessThan(140_000);
  });

  it("style every class the kept parts draw", () => {
    const html = renderToStaticMarkup(
      <GenuiTheme>
        <Renderer response={EVERY_KEPT_PART} library={widgetLibrary} isStreaming={false} />
      </GenuiTheme>,
    );
    const drawn = new Set([...html.matchAll(/\bopenui-[\w-]+/g)].map((m) => m[0]));
    expect(drawn.size, "the program drew OpenUI parts").toBeGreaterThan(30);
    const unstyled = [...drawn].filter((name) => whole.has(name) && !kept.has(name));
    expect(unstyled).toEqual([]);
  });
});

describe("code inside TextContent", () => {
  it("is drawn as plain text, not dropped by the highlighter stand-in", () => {
    const program = 'root = Widget("Code", [t])\nt = TextContent("Use:\\n\\n    FV = PV x (1 + r)\\n\\nto compound")';
    const html = renderToStaticMarkup(
      <GenuiTheme>
        <Renderer response={program} library={widgetLibrary} isStreaming={false} />
      </GenuiTheme>,
    );
    expect(html.replace(/<[^>]+>/g, "")).toContain("FV = PV x (1 + r)");
  });
});
