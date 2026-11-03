import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { widgetProblems } from "@/widgets/check";
import { WidgetView } from "./widget-view";

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
  });
});
