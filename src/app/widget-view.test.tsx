import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { widgetProblems, widgetQueries } from "@/widgets/check";
import { widgetLibrary } from "@/widgets/library";
import type { WidgetToolName } from "@/widgets/tool-specs";
import { drawingLibrary, failedQueries, shownTab, WidgetView, type ToolOutcome } from "./widget-view";

// Widgets drawn on the server, as tests and the Notes page draw them: OpenUI's kit (layouts, charts) and our
// Widget tools beside our own parts. A Query runs only in the browser, so on the server a chart reading one
// has no rows yet; it must still draw without falling back, and a Widget the check refuses must fall back.

const FALLBACK = "This widget could not be drawn";

const draw = (code: string) => renderToStaticMarkup(<WidgetView code={code} complete />);

const ILLUSTRATION = `root = Widget("Illustration: a rate moving from 5% to 5.5%", [box])
box = Stack([line, note])
line = LineChart(["Before", "After"], [Series("Rate in percent", [5, 5.5])])
note = TextContent("It rose by " + (5.5 - 5) * 100 + " basis points.")`;

const EMI_BY_LENGTH = `root = Widget("A 50 lakh home loan, by its length", [rate, line])
$rate = 8.5
rate = Slider("ratePercent", "Interest rate", 5, 14, 0.25, $rate, "percent")
byLength = Query("calculate_range", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 20}, vary: "years", from: 5, to: 30, step: 5}, {rows: []})
line = LineChart(byLength.rows.label, [Series("Monthly instalment", byLength.rows.value)])`;

const UNKNOWN_TOOL = `root = Widget("Sensex prices", [line])
prices = Query("not_a_tool", {dataset: "sensex-1992/sensex-close"}, {rows: []})
line = LineChart(prices.rows.date, [Series("Close", prices.rows.value)])`;

describe("a Widget drawn with OpenUI's kit and our Widget tools", () => {
  it("draws an Illustration's Stack and line chart of typed numbers, working out its arithmetic", () => {
    expect(widgetProblems(ILLUSTRATION)).toEqual([]);
    const html = draw(ILLUSTRATION);
    expect(html).not.toContain(FALLBACK);
    expect(html).toContain("Illustration: a rate moving from 5% to 5.5%");
    expect(html).toContain("Rate in percent");
    expect(html).toContain("Before");
    expect(html).toContain("50 basis points.");
  });

  it('draws a line chart from Query("calculate_range") with its slider, before the tool has answered', () => {
    expect(widgetProblems(EMI_BY_LENGTH)).toEqual([]);
    const html = draw(EMI_BY_LENGTH);
    expect(html).not.toContain(FALLBACK);
    expect(html).toContain("A 50 lakh home loan, by its length");
    expect(html).toContain('aria-label="Interest rate"');
  });

  it("falls back for a Query of a tool that does not exist", () => {
    expect(widgetProblems(UNKNOWN_TOOL)).toEqual([
      'prices: Query tool "not_a_tool" does not exist. Tools: case_data, calculate, calculate_range, annuity_schedule.',
    ]);
    const html = draw(UNKNOWN_TOOL);
    expect(html).toContain(FALLBACK);
    expect(html).not.toContain("Sensex prices");
    expect(html).toContain("The Topic carries on without it.");
    expect(html.toLowerCase()).not.toContain("lesson");
  });
});

const TWO_VIEWS = `root = Widget("Illustration: one rise, two views", [tabs])
tabs = Tabs([chartTab, tableTab])
chartTab = TabItem("chart", "Chart", [bars])
tableTab = TabItem("table", "Table", [table])
bars = BarChart(["Before", "After"], [Series("Rate in percent", [5, 5.5])])
table = Table([Col("When", ["Before", "After"]), Col("Rate", [5, 5.5])])`;

describe("a Widget's Tabs", () => {
  it("open on the first tab, with its content drawn, even on the server", () => {
    expect(widgetProblems(TWO_VIEWS)).toEqual([]);
    const html = draw(TWO_VIEWS);
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>(?:<[^>]+>)*Chart</);
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*>(?:<[^>]+>)*Table</);
    const open = html.match(/<div data-state="active"[^>]*role="tabpanel"[^>]*>/)?.[0];
    expect(open).toContain("content-chart");
    expect(open).not.toContain("hidden");
    expect(html).toContain("Rate in percent");
    // The Table tab's content is drawn only once it is picked.
    expect(html).not.toContain("When");
  });

  it("show the tab the Learner picked while the Widget has it, else the first, whatever data arrives", () => {
    expect(shownTab(["chart", "table"], undefined)).toBe("chart");
    expect(shownTab(["chart", "table"], "table")).toBe("table");
    expect(shownTab(["chart", "table"], "gone")).toBe("chart");
    expect(shownTab([], undefined)).toBeUndefined();
  });

  it("are drawn with the very parts and schema the Tutor writes to; only how Tabs pick their tab differs", () => {
    expect(JSON.stringify(drawingLibrary.toJSONSchema())).toBe(JSON.stringify(widgetLibrary.toJSONSchema()));
    expect(Object.keys(drawingLibrary.components)).toEqual(Object.keys(widgetLibrary.components));
    expect(drawingLibrary.components.Tabs.component).not.toBe(widgetLibrary.components.Tabs.component);
  });
});

/** A tool call's outcome as the Widget records it: `order` counts calls in the order they were made. */
const outcome = (order: number, tool: WidgetToolName, args: Record<string, unknown>, error?: string): ToolOutcome => ({
  call: JSON.stringify([tool, args]),
  tool,
  args,
  order,
  error,
});

describe("the line under a finished Widget when a Query's data could not be loaded", () => {
  const PICKED = widgetQueries(`root = Widget("Two series", [pick, line])
$pick = ""
pick = Select("dataset", [sensex, fed], "Pick a series", {}, $pick)
sensex = SelectItem("sensex-1992/sensex-close", "Sensex")
fed = SelectItem("fed-hike-1994/fed-funds-rate", "Fed funds rate")
d = Query("case_data", {dataset: $pick}, {rows: []})
line = LineChart(d.rows.date, [Series("Value", d.rows.value)])`);
  const notPicked = outcome(1, "case_data", { dataset: "" }, 'case_data: dataset: a Case Data reference, "caseId/datasetId". It takes {dataset}.');
  const withheld = "No sourced data for fed-hike-1994/fed-funds-rate: it may not exist, or it is withheld until the reveal.";

  it("goes once the Query's next call works, even when a Select changed the dataset it reads", () => {
    expect(PICKED.map((q) => q.statementId)).toEqual(["d"]);
    expect(failedQueries(PICKED, [notPicked])).toEqual([notPicked.error]);
    const sensex = outcome(2, "case_data", { dataset: "sensex-1992/sensex-close" });
    expect(failedQueries(PICKED, [notPicked, sensex])).toEqual([]);
    expect(failedQueries(PICKED, [notPicked, sensex, outcome(3, "case_data", { dataset: "fed-hike-1994/fed-funds-rate" }, withheld)])).toEqual([withheld]);
  });

  it("counts the latest call to a Query, whichever answers first", () => {
    const sensex = outcome(2, "case_data", { dataset: "sensex-1992/sensex-close" });
    expect(failedQueries(PICKED, [sensex, notPicked])).toEqual([]);
  });

  it("keeps a Query's own message when another Query of the same tool works", () => {
    const queries = widgetQueries(`root = Widget("Two loans", [rate, short, long])
$rate = 8.5
rate = Slider("ratePercent", "Interest rate", 5, 14, 0.25, $rate, "percent")
q20 = Query("calculate", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 20}}, {rows: []})
q30 = Query("calculate", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 30}}, {rows: []})
short = Table([Col("Over 20 years", q20.rows.label), Col("Amount", q20.rows.text)])
long = Table([Col("Over 30 years", q30.rows.label), Col("Amount", q30.rows.text)])`);
    const failed = outcome(1, "calculate", { calculator: "emi", inputs: { principal: 5000000, ratePercent: 8.5, years: 20 } }, "emi could not run.");
    const worked = outcome(2, "calculate", { calculator: "emi", inputs: { principal: 5000000, ratePercent: 8.5, years: 30 } });
    expect(failedQueries(queries, [failed, worked])).toEqual(["emi could not run."]);
    expect(failedQueries(queries, [failed, worked, outcome(3, "calculate", { calculator: "emi", inputs: { principal: 5000000, ratePercent: 9, years: 20 } })])).toEqual([]);
  });

  it("says each message once, and keeps the message of a call that answers none of the Widget's Queries", () => {
    const queries = widgetQueries(`root = Widget("Two Cases", [a, b])
a = HistoryChart("sensex-1992/sensex-close")
b = HistoryChart("fed-hike-1994/fed-funds-rate")
x = Query("case_data", {dataset: "fed-hike-1994/fed-funds-rate"}, {rows: []})
y = Query("case_data", {dataset: "fed-hike-1994/fed-funds-rate"}, {rows: []})`);
    expect(failedQueries(queries, [outcome(1, "case_data", { dataset: "fed-hike-1994/fed-funds-rate" }, withheld)])).toEqual([withheld]);
    expect(failedQueries([], [outcome(1, "calculate", { calculator: "emi" }, "emi: inputs: expected record.")])).toEqual(["emi: inputs: expected record."]);
  });
});
