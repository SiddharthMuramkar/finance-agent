import { describe, expect, it } from "vitest";
import { widgetParts, widgetProblems } from "./check";

// A Widget plus the given lines. A Query needs no component to hold it, so most cases here use only our own
// Calculator; the last block draws Query results with OpenUI's kit.
const widget = (...lines: string[]) =>
  ['root = Widget("A home loan", [calc])', 'calc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})', ...lines].join("\n");

const TOOLS = "Tools: case_data, calculate, calculate_range, annuity_schedule.";

describe("the server's Widget check for Widget tools", () => {
  it("accepts a Query of each tool with good literal arguments", () => {
    const code = widget(
      'd = Query("case_data", {dataset: "sensex-1992/sensex-closes"}, {rows: []})',
      'r = Query("calculate", {calculator: "emi", inputs: {principal: 5000000, ratePercent: 8.5, years: 20}, currency: "inr"}, {rows: []})',
      'g = Query("calculate_range", {calculator: "future_value", inputs: {amount: 100000, ratePercent: 8, years: 1}, vary: "years", from: 1, to: 30, step: 1}, {rows: []})',
      's = Query("annuity_schedule", {total: 1537000000, payments: 30, growthPercent: 5, ratePercent: 3}, {rows: []})',
    );
    expect(widgetProblems(code)).toEqual([]);
  });

  it("checks only what is written as a literal in a Query bound to $variables", () => {
    const range = (step: string) =>
      widget(
        "$rate = 8.5",
        "$years = 20",
        "$lakhs = 50",
        `g = Query("calculate_range", {calculator: "emi", inputs: {principal: $lakhs * 100000, ratePercent: $rate, years: 1}, vary: "years", from: 1, to: $years, step: ${step}}, {rows: []})`,
      );
    expect(widgetProblems(range("1"))).toEqual([]);
    const problems = widgetProblems(range("0"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^g: Query\("calculate_range"\) argument "step": /);
  });

  it("rejects a tool that does not exist, naming the four tools", () => {
    expect(widgetProblems(widget('q = Query("prices", {ticker: "TCS"}, {rows: []})'))).toEqual([`q: Query tool "prices" does not exist. ${TOOLS}`]);
    expect(widgetProblems(widget('$tool = "calculate"', 'q = Query($tool, {calculator: "emi"}, {rows: []})'))).toEqual([`q: Query tool "$tool" does not exist. ${TOOLS}`]);
  });

  it("rejects any Mutation: widgets only read", () => {
    expect(widgetProblems(widget('m = Mutation("calculate", {calculator: "emi", inputs: {}})'))).toEqual(["m: widgets only read; remove Mutation()."]);
  });

  it("rejects literal arguments the tool would refuse, naming the Query and the argument", () => {
    const problems = widgetProblems(
      widget(
        'a = Query("annuity_schedule", {total: "lots", payments: 30, growthPercent: 5, ratePercent: 3}, {rows: []})',
        'b = Query("calculate")',
        'c = Query("calculate", {calculator: "emi", inputs: {principal: 1, ratePercent: 2, years: [1, 2]}, currency: "eur"}, {rows: []})',
      ),
    );
    expect(problems).toHaveLength(4);
    expect(problems[0]).toMatch(/^a: Query\("annuity_schedule"\) argument "total": /);
    expect(problems[1]).toMatch(/^b: Query\("calculate"\) arguments: /);
    expect(problems[2]).toMatch(/^c: Query\("calculate"\) argument "inputs\.years": /);
    expect(problems[3]).toMatch(/^c: Query\("calculate"\) argument "currency": /);
  });

  it("rejects an unknown calculator, listing the calculators", () => {
    const problems = widgetProblems(widget('a = Query("calculate", {calculator: "mortgage", inputs: {}}, {rows: []})'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^a: calculator "mortgage" does not exist\. Calculators: future_value, .*\bemi\b/);
  });

  it("rejects an input the calculator does not have, and a vary that is not one of its inputs", () => {
    const code = widget('b = Query("calculate_range", {calculator: "emi", inputs: {amount: 5000000, ratePercent: 8.5, years: 20}, vary: "rate", from: 6, to: 12, step: 1}, {rows: []})');
    expect(widgetProblems(code)).toEqual([
      'b: "amount" is not an input of emi. Its inputs: principal, ratePercent, years.',
      "b: vary must be one of emi's inputs: principal, ratePercent, years.",
    ]);
  });

  it("rejects a Case Data reference not written caseId/datasetId, once, and leaves one the browser works out to the tool", () => {
    expect(widgetProblems(widget('d = Query("case_data", {dataset: "Sensex closes"}, {rows: []})'))).toEqual([
      'd: dataset "Sensex closes" is not a Case Data reference. Write "caseId/datasetId", taken from the Case Data list code sent you.',
    ]);
    expect(widgetProblems(widget('$ref = "sensex-1992/sensex-closes"', 'd = Query("case_data", {dataset: $ref}, {rows: []})'))).toEqual([]);
  });
});

describe("what a widget is made of", () => {
  it("lists the Widget tools its Queries call and the Case Data they read, each once, in order", () => {
    const code = widget(
      'd = Query("case_data", {dataset: "sensex-1992/sensex-closes"}, {rows: []})',
      'g = Query("calculate_range", {calculator: "emi", inputs: {principal: 5000000, ratePercent: 8.5, years: 1}, vary: "years", from: 5, to: 30, step: 5}, {rows: []})',
      'e = Query("case_data", {dataset: "sensex-1992/sensex-closes"}, {rows: []})',
      'f = Query("case_data", {dataset: "fed-hike-1994/fed-funds-rate"}, {rows: []})',
    );
    expect(widgetParts(code)).toEqual({
      title: "A home loan",
      components: ["Calculator"],
      tools: ["case_data", "calculate_range"],
      datasets: ["sensex-1992/sensex-closes", "fed-hike-1994/fed-funds-rate"],
    });
  });

  it("leaves out tools that do not exist and references that are not written as one", () => {
    const parts = widgetParts(
      widget('q = Query("prices", {}, {rows: []})', 'd = Query("case_data", {dataset: "Sensex closes"}, {rows: []})', '$ref = "a/b"', 'e = Query("case_data", {dataset: $ref}, {rows: []})'),
    );
    expect(parts.tools).toEqual(["case_data"]);
    expect(parts.datasets).toEqual([]);
  });

  it("is empty for code that is not openui-lang", () => {
    expect(widgetParts("not openui")).toEqual({ title: null, components: [], tools: [], datasets: [] });
  });
});

// These need OpenUI's kit (Stack, Tabs, LineChart, Table…) in the frozen schema.
describe("widgets laid out with OpenUI's kit", () => {
  const RICH = `root = Widget("A 50 lakh home loan", [box])
$rate = 8.5
box = Stack([rate, tabs])
rate = Slider("ratePercent", "Interest rate", 5, 14, 0.25, $rate, "percent")
tabs = Tabs([chartTab, tableTab])
chartTab = TabItem("chart", "Chart", [chart])
tableTab = TabItem("table", "Table", [table])
chart = LineChart(g.rows.label, [Series(g.output, g.rows.value)])
table = Table([Col("Result", r.rows.label), Col("Today", r.rows.text)])
g = Query("calculate_range", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 20}, vary: "years", from: 5, to: 30, step: 5}, {rows: []})
r = Query("calculate", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 20}}, {rows: []})`;

  it("accepts a slider, a chart from calculate_range and a table from calculate, in Tabs", () => {
    expect(widgetProblems(RICH)).toEqual([]);
  });

  it("lists every component deep through the layout, in the order written", () => {
    expect(widgetParts(RICH)).toEqual({
      title: "A 50 lakh home loan",
      components: ["Stack", "Slider", "Tabs", "TabItem", "LineChart", "Series", "TabItem", "Table", "Col", "Col"],
      tools: ["calculate_range", "calculate"],
      datasets: [],
    });
  });

  it("accepts a FormulaCard in a tab bound to a Slider elsewhere in the layout", () => {
    const code = `root = Widget("What a payment in five years is worth today", [box])
$rate = 5
box = Stack([rate, tabs])
rate = Slider("rate", "Discount rate", 0, 15, 0.5, $rate, "percent")
tabs = Tabs([TabItem("card", "Formula", [card])])
card = FormulaCard("present-value", {ratePercent: $rate}, {}, {amount: 1000, years: 5})`;
    expect(widgetProblems(code)).toEqual([]);
  });

  it("still checks the Queries of a widget laid out with the kit", () => {
    const problems = widgetProblems(RICH.replace('vary: "years"', 'vary: "tenure"'));
    expect(problems).toEqual(["g: vary must be one of emi's inputs: principal, ratePercent, years."]);
  });
});
