import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createParser, evaluate, type LibraryJSONSchema } from "@openuidev/lang-core";
import { WidgetView } from "@/app/widget-view";
import frozen from "./frozen.generated.json";
import { parsedTasks } from "./guided-tasks";
import { readingValue, settledValue, sliderStep, snappedValue, steppedValue, typedValue } from "./slider-steps";

// Every slider takes an exact value (spec #119, "Widgets › Sliders").

const rates = [
  'root = Widget("Rates", [old, years])',
  "$old = 4",
  "$years = 10",
  'old = Slider("rate", "Old rate", 0, 10, 0.25, $old, "percent")',
  'years = Slider("years", "Years", 1, 30, 1, $years, "years")',
].join("\n");

const html = renderToStaticMarkup(<WidgetView code={rates} complete />);
/** The Widget's text as a screen reader or a copy reads it: tags add no spaces. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const tag = (markup: string, pattern: RegExp) => markup.match(new RegExp(`<[^>]*${pattern.source}[^>]*>`))?.[0] ?? "";

describe("a slider in a Widget", () => {
  it("has a number box beside it that takes any value from its minimum to its maximum", () => {
    const box = tag(html, /aria-label="Old rate, exact value"/);
    expect(box).toContain('type="number"');
    expect(box).toContain('min="0"');
    expect(box).toContain('max="10"');
    expect(box).toContain('step="any"');
    expect(tag(html, /aria-label="Years, exact value"/)).toContain('max="30"');
  });

  it("has − and + buttons that move it by one step", () => {
    expect(html).toContain('aria-label="Decrease Old rate by one step"');
    expect(html).toContain('aria-label="Increase Old rate by one step"');
    expect(html).toContain('aria-label="Increase Years by one step"');
  });

  it("moves a percent slider in 0.01 steps, even when the Widget is written with 0.25", () => {
    expect(tag(html, /type="range" aria-label="Old rate"/)).toContain('step="0.01"');
    expect(tag(html, /type="range" aria-label="Years"/)).toContain('step="1"');
  });

  it("spaces the label and the value apart", () => {
    expect(text(html)).toMatch(/Old rate \d/);
    expect(text(html)).not.toMatch(/Old rate\d/);
  });
});

describe("Reset", () => {
  it("shows on a Widget with a slider", () => {
    expect(tag(html, /title="Put every slider back to its starting value"/)).toMatch(/^<button/);
    expect(text(html)).toContain("Reset");
  });

  it("does not show on a Widget without one", () => {
    const fixed = 'root = Widget("A loan", [calc])\ncalc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})';
    expect(text(renderToStaticMarkup(<WidgetView code={fixed} complete />))).not.toContain("Reset");
  });
});

const percent = { min: 0, max: 10, step: 0.25, unit: "percent" };
const years = { min: 1, max: 30, step: 1, unit: "years" };
const quarters = { min: 0, max: 10, step: 0.25, unit: "usd" };

describe("the values a slider takes", () => {
  it("takes any typed value from min to max, rounding typed percents to two decimals", () => {
    expect(typedValue("3.33", percent)).toBe(3.33);
    expect(typedValue("3.3333", percent)).toBe(3.33);
    expect(typedValue("3.386", quarters)).toBe(3.39);
    expect(typedValue("12.4", years)).toBe(12);
  });

  it("clamps typed values outside the range and rejects text that is no number", () => {
    expect(typedValue("15", percent)).toBe(10);
    expect(typedValue("-2", percent)).toBe(0);
    expect(typedValue("", percent)).toBeNull();
    expect(typedValue("abc", percent)).toBeNull();
  });

  it("− and + move by exactly one step and stop at min and max", () => {
    expect(steppedValue(3.37, 1, percent)).toBe(3.38);
    expect(steppedValue(3.38, -1, percent)).toBe(3.37);
    expect(steppedValue(10, 1, percent)).toBe(10);
    expect(steppedValue(0, -1, percent)).toBe(0);
    expect(steppedValue(29, 1, years)).toBe(30);
    expect(steppedValue(30, 1, years)).toBe(30);
    expect(steppedValue(5, 1, quarters)).toBe(5.25);
  });

  it("moves percent sliders in 0.01 steps and lands a dragged value on the step's decimals, without float noise", () => {
    expect(sliderStep(percent)).toBe(0.01);
    expect(sliderStep(quarters)).toBe(0.25);
    expect(settledValue(0.1 + 0.2, percent)).toBe(0.3);
  });

  it("snaps starting values to a step", () => {
    expect(snappedValue(5.1, quarters)).toBe(5);
    expect(snappedValue(5.13, quarters)).toBe(5.25);
    expect(snappedValue(4.567, percent)).toBe(4.57);
    expect(snappedValue(12.6, years)).toBe(13);
    expect(snappedValue(40, years)).toBe(30);
  });

  it("prints a reading at its own precision when that is finer than the step", () => {
    expect(readingValue(3.38)).toBe(3.38);
    expect(String(readingValue(3.3800000000000003))).toBe("3.38");
  });
});

describe("a Guided Task with an equality target", () => {
  const parser = createParser(frozen.schema as unknown as LibraryJSONSchema, "Widget");
  const code = [
    'root = Widget("Rates", [rate, steps])',
    "$rate = 5",
    'rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")',
    "steps = GuidedTasks([t0])",
    't0 = GuidedTask("Set the rate to 3.38%", $rate == 3.38)',
  ].join("\n");
  const [task] = parsedTasks(parser.parse(code).root!.props.children);
  const ticksAt = (rate: number | null) => evaluate(task.condition as never, { getState: () => rate, resolveRef: () => undefined }) === true;

  it("ticks when the value is typed into the number box, and when + reaches it", () => {
    expect(ticksAt(typedValue("3.38", percent))).toBe(true);
    expect(ticksAt(typedValue("3.3800001", percent))).toBe(true);
    expect(ticksAt(steppedValue(3.37, 1, percent))).toBe(true);
    expect(ticksAt(typedValue("3.37", percent))).toBe(false);
  });
});
