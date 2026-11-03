import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { widgetProblems } from "./check";

// The Calculator widget draws the answer from the same registry as the Tutor's calculate tool.

const emi = `root = Widget("What a 50 lakh home loan costs", [amount, rate, calc])
$amount = 5000000
$rate = 8.5
amount = Slider("principal", "Loan amount", 500000, 20000000, 100000, $amount, "inr")
rate = Slider("ratePercent", "Interest rate", 5, 14, 0.25, $rate, "percent")
calc = Calculator("emi", {principal: $amount, ratePercent: $rate, years: 20})`;

describe("Calculator widget", () => {
  it("passes the widget check", () => {
    expect(widgetProblems(emi)).toEqual([]);
  });

  // Slider variables are set by the browser after the first render, so a server-side render of
  // $variables shows "Working it out"; the live widget is checked in a browser (evidence/17).
  const fixed = 'root = Widget("What a 50 lakh home loan costs", [calc])\ncalc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})';

  it("shows the formula's answer in rupees with lakh and crore", () => {
    const html = renderToStaticMarkup(<WidgetView code={fixed} complete />);
    expect(html).toContain("₹43,391.16");
    expect(html).toContain("₹54.14 lakh");
  });

  it("marks the result as resting on the Learner's assumptions", () => {
    const html = renderToStaticMarkup(<WidgetView code={fixed} complete />);
    expect(html).toContain("Your assumption");
  });

  it("says plainly when the inputs are wrong instead of drawing a number", () => {
    const code = 'root = Widget("Broken", [calc])\ncalc = Calculator("emi", {principal: 5000000})';
    expect(renderToStaticMarkup(<WidgetView code={code} complete />)).toContain("ratePercent");
  });
});
