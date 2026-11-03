import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkedText } from "./marked-text";

const html = (text: string) => renderToStaticMarkup(<MarkedText text={text} />);

describe("an explanation with a formula marker", () => {
  it("draws the marker as a static Formula Card whose result comes from the calculator", () => {
    const out = html("Two years at 10% means dividing by 1.10 twice. {{formula:present-value amount=1210 ratePercent=10 years=2}} Dividing once discounts one year only.");
    expect(out).toContain('data-testid="formula-card"');
    expect(out).toContain('data-formula="present-value"');
    expect(out).toContain("Present value of one future payment");
    expect(out).toContain("$1,210<");
    expect(out).toContain("$1,000.00");
    expect(out).toContain("Two years at 10% means dividing by 1.10 twice.");
    expect(out).toContain("Dividing once discounts one year only.");
  });

  it("is static: the numbers are plain, with no assumption colouring and no slider", () => {
    const out = html("{{formula:present-value amount=5000 ratePercent=5 years=2}}");
    expect(out).toContain('data-kind="fixed"');
    expect(out).not.toContain('data-kind="assumption"');
    expect(out).not.toContain("input");
    expect(out).toContain("$4,535.15");
  });

  it("never shows the raw marker", () => {
    expect(html("A {{formula:present-value amount=5000 ratePercent=5 years=2}} B")).not.toContain("{{");
    expect(html("A {{formula:nope a=1}} B")).not.toContain("{{");
  });

  it("keeps text without a marker as one paragraph", () => {
    expect(html("Just words.")).toBe("<p>Just words.</p>");
  });
});
