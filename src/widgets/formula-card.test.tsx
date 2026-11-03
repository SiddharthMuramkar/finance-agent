import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { formulaById } from "@/finance/formulas";
import { widgetProblems } from "./check";
import { FormulaFigure, type CardValue } from "./formula-card-view";

const present = formulaById("present-value")!;
const credit = { source: "Mega Millions", sourceUrl: "https://example.com/mm", date: "2018-10-23" };

function card(values: Record<string, CardValue>) {
  return renderToStaticMarkup(<FormulaFigure formula={present} values={values} />);
}

const all: Record<string, CardValue> = {
  amount: { value: 1000, from: "fixed" },
  ratePercent: { value: 10, from: "assumption" },
  years: { value: 5, from: "fixed" },
};

describe("Formula Card", () => {
  it("names every symbol in plain words with its unit", () => {
    const html = card(all);
    expect(html).toContain("Amount you receive later");
    expect(html).toContain("Yearly discount rate");
    expect(html).toContain("percent a year");
    expect(html).toContain("Years until the payment arrives");
  });

  it("takes the result from the tested calculator ($1,000 in 5 years at 10% is $620.92)", () => {
    const html = card(all);
    expect(html).toContain("$620.92");
    expect(card({ ...all, ratePercent: { value: 0, from: "assumption" } })).toContain("$1,000.00");
  });

  it("fills a slider's value into the formula and the result follows it", () => {
    const html = card({ ...all, ratePercent: { value: 4, from: "assumption" } });
    expect(html).toMatch(/data-kind="assumption"[^>]*>4%/);
    expect(html).toContain("$821.93");
  });

  it("colours the Learner's assumption teal", () => {
    const html = card(all);
    expect(html).toMatch(/data-kind="assumption" data-symbol="ratePercent"[^>]*class="[^"]*--you-line/);
    expect(html).toContain("Your assumption");
  });

  it("colours a sourced figure amber, with its credit", () => {
    const html = card({ ...all, amount: { value: 877_784_124, from: "sourced", credit } });
    expect(html).toMatch(/data-kind="sourced" data-symbol="amount"[^>]*class="[^"]*--src-line/);
    expect(html).toContain("Sourced");
    expect(html).toContain("Mega Millions");
  });

  it("leaves a fixed number plain", () => {
    const html = card(all);
    const fixed = /<span data-kind="fixed" data-symbol="years" class="([^"]*)"/.exec(html);
    expect(fixed).not.toBeNull();
    expect(fixed![1]).not.toContain("--you-line");
    expect(fixed![1]).not.toContain("--src-line");
  });

  it("shows a growing-annuity card with the first payment worked out too", () => {
    const html = renderToStaticMarkup(
      <FormulaFigure
        formula={formulaById("growing-annuity-present-value")!}
        values={{
          total: { value: 3310, from: "fixed" },
          payments: { value: 3, from: "fixed" },
          growthPercent: { value: 10, from: "fixed" },
          ratePercent: { value: 10, from: "assumption" },
        }}
      />,
    );
    expect(html).toContain("$1,000.00");
    expect(html).toContain("$3,000.00");
  });

  it("draws in a widget when every symbol is a fixed number", () => {
    const code = 'root = Widget("PV", [card])\ncard = FormulaCard("present-value", {}, {}, {amount: 1000, ratePercent: 10, years: 5})';
    expect(widgetProblems(code)).toEqual([]);
    expect(renderToStaticMarkup(<WidgetView code={code} complete />)).toContain("$620.92");
  });
});

describe("the server's Widget check for Formula Cards", () => {
  const slider = 'rate = Slider("rate", "Discount rate", 0, 15, 0.5, $rate, "percent")';
  const widget = (cardArgs: string, extra = `$rate = 5\n${slider}`) => `root = Widget("PV", [rate, card])\n${extra}\ncard = FormulaCard(${cardArgs})`;

  it("accepts a card whose inputs are sliders and whose other symbols are sourced or fixed", () => {
    const code = widget('"present-value", {ratePercent: $rate}, {amount: "mega-millions-2018/cash-option"}, {years: 5}');
    expect(widgetProblems(code)).toEqual([]);
  });

  it("rejects an input bound to no slider (a number, or a variable no Slider uses)", () => {
    const literal = widgetProblems(widget('"present-value", {ratePercent: 5}, {}, {amount: 1000, years: 5}'));
    expect(literal.join("\n")).toMatch(/input "ratePercent" is bound to no Slider/);
    const stray = widgetProblems(widget('"present-value", {ratePercent: $other}, {}, {amount: 1000, years: 5}', `$other = 5\n$rate = 5\n${slider}`));
    expect(stray.join("\n")).toMatch(/input "ratePercent" is bound to no Slider/);
  });

  it("rejects a key given both as an input and as sourced", () => {
    const problems = widgetProblems(widget('"present-value", {ratePercent: $rate, amount: $rate}, {amount: "mega-millions-2018/cash-option"}, {years: 5}'));
    expect(problems.join("\n")).toMatch(/"amount" is given under both inputs and sourced/);
  });

  it("rejects a missing symbol, naming it in plain words", () => {
    const problems = widgetProblems(widget('"present-value", {ratePercent: $rate}, {}, {years: 5}'));
    expect(problems.join("\n")).toMatch(/symbol "amount" \(Amount you receive later\) is missing/);
  });

  it("rejects an unknown formula and a symbol the formula does not have", () => {
    expect(widgetProblems(widget('"wacc", {ratePercent: $rate}, {}, {}')).join("\n")).toMatch(/not in the formula registry/);
    expect(widgetProblems(widget('"present-value", {ratePercent: $rate}, {}, {amount: 1, years: 5, bogus: 2}')).join("\n")).toMatch(/"bogus" under fixed is not a symbol/);
  });
});
