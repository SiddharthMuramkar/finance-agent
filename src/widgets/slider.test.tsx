import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";

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
