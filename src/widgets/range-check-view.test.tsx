import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rangeCheck } from "@/markets/range-check";
import { RangeCheckView } from "./range-check-view";

// The range check on screen (ticket #109): a flagged input shows with the yardstick's date and source; nothing shows
// when every input sits near its industry's figure.

const food = { market: "IN" as const, industry: "Food Processing" };

describe("RangeCheckView", () => {
  it("shows a flag with the yardstick's month, source and a link to it", () => {
    const html = renderToStaticMarkup(<RangeCheckView flags={rangeCheck({ marginPercent: 45, salesToCapital: 2.4 }, food)} />);
    expect(html).toContain('data-testid="range-check"');
    expect(html.match(/data-testid="range-flag"/g)).toHaveLength(1);
    expect(html).toContain("Your operating margin of 45% is far above Food Processing&#x27;s 7.26% in India (Jan 2026): more than double it.");
    expect(html).toContain("(Jan 2026)");
    expect(html).toContain("Damodaran Online, Operating and Net Margins by Industry (India), January 2026 update");
    expect(html).toContain('href="https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginIndia.xls"');
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/\b(right|wrong|today|current)\b/i);
  });

  it("shows nothing when every input is inside its range", () => {
    expect(renderToStaticMarkup(<RangeCheckView flags={rangeCheck({ marginPercent: 7, salesToCapital: 2.4, costOfCapitalPercent: 12 }, food)} />)).toBe("");
  });
});
