import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CaseDataset } from "@/case-data/case-data";
import { AnnuityFigure, HistoryFigure } from "./case-data-view";

const yields: CaseDataset = {
  id: "treasury-30-year",
  label: "30-year Treasury yield",
  unit: "percent",
  source: "US Treasury, Daily Treasury Par Yield Curve Rates",
  sourceUrl: "https://home.treasury.gov/example",
  checkedOn: "2026-11-02",
  points: [
    { date: "2018-10-22", value: 3.38 },
    { date: "2018-10-23", value: 3.37 },
    { date: "2018-10-24", value: 3.33 },
  ],
};
const cash: CaseDataset = { ...yields, id: "cash-option", label: "Cash option", unit: "USD", source: "CNBC, 24 October 2018", points: [{ date: "2018-10-23", value: 877_800_000 }] };

/** The text inside each element marked data-kind="…" in server-rendered markup, in order. */
function marked(html: string, kind: "sourced" | "assumption"): string[] {
  return [...html.matchAll(new RegExp(`<(\\w+)[^>]*data-kind="${kind}"[^>]*>`, "g"))].map((m) => {
    const close = html.indexOf(`</${m[1]}>`, m.index + m[0].length);
    return html.slice(m.index + m[0].length, close).replace(/<[^>]+>/g, "");
  });
}

describe("a history chart drawn from a Case Data dataset", () => {
  it("draws one point per sourced value and credits the source with a link, marked as sourced history", () => {
    const html = renderToStaticMarkup(<HistoryFigure dataset={yields} revealed={false} asOf="2018-10-24" />);
    expect(html.match(/data-testid="history-point"/g)).toHaveLength(3);
    expect(html).toContain('href="https://home.treasury.gov/example"');
    expect(marked(html, "sourced").join(" ")).toContain("Sourced history");
    expect(marked(html, "assumption")).toEqual([]);
    expect(html).toContain("2018-10-22");
    expect(html).toContain("3.33%");
  });

  it("before the reveal, says that later data is withheld; after it, does not", () => {
    expect(renderToStaticMarkup(<HistoryFigure dataset={yields} revealed={false} asOf="2018-10-24" />)).toContain(
      "Data after 2018-10-24 is withheld until the reveal.",
    );
    expect(renderToStaticMarkup(<HistoryFigure dataset={yields} revealed asOf="2018-10-24" />)).not.toContain("withheld");
  });
});

describe("sourced history and the Learner's assumptions are visibly separate", () => {
  it("the annuity chart marks the present value as the Learner's assumption and the Case figure as sourced, in separate elements", () => {
    const html = renderToStaticMarkup(
      <AnnuityFigure inputs={{ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 }} sourced={cash} />,
    );
    const assumption = marked(html, "assumption").join(" ");
    const sourced = marked(html, "sourced").join(" ");
    expect(assumption).toContain("Your assumption");
    expect(assumption).toContain("3%");
    expect(sourced).toContain("Sourced");
    expect(sourced).toContain("CNBC, 24 October 2018");
    expect(sourced).toContain("$877.8 million");
    expect(sourced).not.toContain("Your assumption");
  });

  it("without a sourced figure, the chart shows only the Learner's assumption", () => {
    const html = renderToStaticMarkup(<AnnuityFigure inputs={{ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 }} />);
    expect(marked(html, "sourced")).toEqual([]);
    expect(marked(html, "assumption").length).toBeGreaterThan(0);
  });
});
