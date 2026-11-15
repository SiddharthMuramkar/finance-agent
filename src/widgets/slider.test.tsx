import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createParser, evaluate, type LibraryJSONSchema } from "@openuidev/lang-core";
import { WidgetView } from "@/app/widget-view";
import frozen from "./frozen.generated.json";
import { parsedTasks } from "./guided-tasks";
import { lenientTaskCode, sliderLandings } from "./slider-landing";
import { dragStep, landedValue, nearStop, nextValue, readingValue, settledValue, sliderStep, snappedValue, spokenValue, steppedValue, withinOneStep } from "./slider-steps";

// Every slider reaches every step with the range, the −/+ buttons and the quick chips; nothing is typed (ADR 0002).

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
  it("has no box to type a value in: no exact-value box, no tap-to-type value", () => {
    expect(html).not.toContain("exact value");
    expect(html).not.toContain("type a value");
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain("inputmode");
    expect(html.match(/<input/g)).toHaveLength(2);
    expect(tag(html, /aria-label="Old rate"/)).toContain('type="range"');
  });

  it("shows its value as a reading, not a button", () => {
    expect(html).toContain("<output");
    expect(text(html)).toMatch(/Old rate \d+%/);
    expect(html).not.toContain('title="Tap to type a value"');
  });

  it("has − and + buttons that move it by one step", () => {
    expect(html).toContain('aria-label="Decrease Old rate by one step"');
    expect(html).toContain('aria-label="Increase Old rate by one step"');
    expect(html).toContain('aria-label="Increase Years by one step"');
  });

  it("lets code place a drag (B5): the range takes any value, and where a drag lands is landedValue's rule below", () => {
    expect(tag(html, /type="range" aria-label="Old rate"/)).toContain('step="any"');
    expect(tag(html, /type="range" aria-label="Years"/)).toContain('step="any"');
  });

  it("says its value with its unit (B5): aria-valuetext reads so many percent, so many years", () => {
    expect(tag(html, /type="range" aria-label="Old rate"/)).toMatch(/aria-valuetext="\d+(\.\d+)? percent"/);
    expect(tag(html, /type="range" aria-label="Years"/)).toMatch(/aria-valuetext="\d+ years?"/);
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
  it("settles a value inside min..max on the step's decimals, rounding percents to two decimals", () => {
    expect(settledValue(3.3333, percent)).toBe(3.33);
    expect(settledValue(3.386, quarters)).toBe(3.39);
    expect(settledValue(12.4, years)).toBe(12);
    expect(settledValue(15, percent)).toBe(10);
    expect(settledValue(-2, percent)).toBe(0);
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

  it("ticks when + reaches the value or the range lands on it, and not a step short", () => {
    expect(ticksAt(steppedValue(3.37, 1, percent))).toBe(true);
    expect(ticksAt(settledValue(3.3800001, percent))).toBe(true);
    expect(ticksAt(settledValue(3.37, percent))).toBe(false);
  });
});

describe("a slider's steppers and the Widget's Reset (A5)", () => {
  const inner = (pattern: RegExp) => html.match(new RegExp(`<button[^>]*${pattern.source}[^>]*>([\\s\\S]*?)</button>`))?.[1] ?? "";

  it("draws the steppers and Reset as line Icons", () => {
    for (const [label, icon] of [["Decrease Old rate by one step", "lucide-minus"], ["Increase Old rate by one step", "lucide-plus"]]) {
      const body = inner(new RegExp(`aria-label="${label}"`));
      expect((body.match(/<svg/g) ?? []).length).toBe(1);
      expect(body).toContain(icon);
      expect(text(body).trim()).toBe("");
    }
    const reset = inner(/data-testid="widget-reset"/);
    expect(reset).toContain("lucide-rotate-ccw");
    expect(reset).toMatch(/<span class="sr-only">Reset<\/span>/);
  });
});

// Sliders a person can land on (spec 2026-11-12, B5). The figures come from the spec's evidence: a rate slider from 0% to
// 20% on a track 447 pixels wide asked for exactly 4%, and moved 2,000 steps (one pixel was about 4.5 of them).
describe("a slider a person can land on (B5)", () => {
  const rate = { min: 0, max: 20, step: 0.01, unit: "percent" };

  it("drags in steps at least 2 pixels wide, at most about 200 across the track; steppers and arrows still move 0.01", () => {
    expect(dragStep(rate, 447)).toBe(0.1);
    expect((rate.max - rate.min) / dragStep(rate, 447)).toBeLessThanOrEqual(200);
    expect(dragStep(rate, 100)).toBe(0.5);
    expect(nextValue(4.31, -1, rate)).toBe(4.3);
    expect(nextValue(4.31, 1, rate)).toBe(4.32);
    // A slider with few steps keeps its own: years from 1 to 30, and Value levers' revenue from $10bn to $100bn in $1bn.
    expect(dragStep({ min: 1, max: 30, step: 1, unit: "years" }, 447)).toBe(1);
    expect(dragStep({ min: 10, max: 100, step: 1 }, 447)).toBe(1);
  });

  it("rests on a value a Guided Task names, or its opening value, when dragged to within 12 pixels of it", () => {
    // 12 pixels of 447 on a 20-point track is 0.537 points.
    expect(landedValue(4.5, rate, [4, 5], 447)).toBe(4);
    expect(landedValue(5.6, rate, [4, 5], 447)).toBe(5.6);
    expect(landedValue(5.4, rate, [4, 5], 447)).toBe(5);
    expect(landedValue(3.47, rate, [4], 447)).toBe(4);
    expect(landedValue(3.4, rate, [4], 447)).toBe(3.4);
    expect(nearStop(4.6, rate, [4], 447)).toBeNull();
  });

  it("otherwise lands on the drag step's grid, inside min..max", () => {
    expect(landedValue(4.3149, rate, [], 447)).toBe(4.3);
    expect(landedValue(4.36, rate, [], 447)).toBe(4.4);
    expect(landedValue(25, rate, [], 447)).toBe(20);
    expect(landedValue(-1, rate, [], 447)).toBe(0);
  });

  it("passes through a stop off its steps with the steppers: the cost of capital opens at 12.84% on a 0.25 slider", () => {
    const risk = { min: 10, max: 18, step: 0.25 };
    expect(nextValue(12.75, 1, risk, [12.84])).toBe(12.84);
    expect(nextValue(12.84, 1, risk, [12.84])).toBe(13);
    expect(nextValue(12.84, -1, risk, [12.84])).toBe(12.75);
    expect(nextValue(13, -1, risk, [12.84])).toBe(12.84);
    expect(nextValue(18, 1, risk, [12.84])).toBe(18);
  });

  it("counts a value-naming task as done within one step of the value", () => {
    expect(withinOneStep(4.1, 4, rate)).toBe(true);
    expect(withinOneStep(3.9, 4, rate)).toBe(true);
    expect(withinOneStep(4.11, 4, rate)).toBe(false);
  });

  it("says its value with its unit", () => {
    expect(spokenValue(4.5, "percent")).toBe("4.5 percent");
    expect(spokenValue(1, "years")).toBe("1 year");
    expect(spokenValue(1000, "usd")).toBe("1,000 dollars");
    expect(spokenValue(100000, "inr")).toBe("1,00,000 rupees");
  });

  const tasked = [
    'root = Widget("Rates", [newRate, steps])',
    "$new = 4.31",
    'newRate = Slider("new", "New rate", 0, 20, 0.01, $new, "percent")',
    "steps = GuidedTasks([t0])",
    't0 = GuidedTask("Move the new rate to 4% and watch the move shrink to nothing", $new == 4)',
  ].join("\n");

  it("reads its stops and chips from the Widget's code: the task's 4% is both, the opening 4.31% only a stop", () => {
    expect(sliderLandings(tasked)).toEqual({ $new: { stops: [4, 4.31], chips: [4] } });
  });

  it("draws each value a task names as a chip under the slider, at least 44 pixels tall, as are the steppers", () => {
    const drawn = renderToStaticMarkup(<WidgetView code={tasked} complete />);
    const chips = drawn.match(/<div[^>]*role="group" aria-label="Quick values for New rate"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(text(chips).trim()).toBe("4%");
    expect(tag(chips, /data-affordance="chip"/)).toContain("min-h-11");
    // 44 px each way (B5): a short label such as "$0" is held wide too.
    expect(tag(chips, /data-affordance="chip"/)).toContain("min-w-11");
    expect(tag(drawn, /aria-label="Increase New rate by one step"/)).toContain("size-11");
    expect(tag(drawn, /aria-label="Decrease New rate by one step"/)).toContain("size-11");
  });

  it("draws the task ticking within one drag step of 4%, but not before the slider has a value", () => {
    const drawn = lenientTaskCode(tasked);
    expect(drawn).toContain('t0 = GuidedTask("Move the new rate to 4% and watch the move shrink to nothing", ($new != null && $new >= 3.9 && $new <= 4.1))');
    const parser = createParser(frozen.schema as unknown as LibraryJSONSchema, "Widget");
    const [task] = parsedTasks(parser.parse(drawn).root!.props.children);
    const ticksAt = (value: number | null | undefined) => evaluate(task.condition as never, { getState: () => value, resolveRef: () => undefined }) === true;
    expect([3.9, 4, 4.1].map(ticksAt)).toEqual([true, true, true]);
    expect([3.89, 4.11, 4.31, null, undefined].map(ticksAt)).toEqual([false, false, false, false, false]);
  });
});
