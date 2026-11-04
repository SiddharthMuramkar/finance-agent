import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CaseDataset } from "@/case-data/case-data";
import { AnnuityFigure, HistoryFigure } from "./case-data-view";
import { pointSizes } from "./history-plot";

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

const sensex: CaseDataset = {
  id: "sensex-close",
  label: "BSE Sensex, milestone closing levels",
  unit: "index points",
  source: "BSE, Sensex milestones",
  sourceUrl: "https://www.bseindia.com/example",
  checkedOn: "2026-11-02",
  points: [
    { date: "1979-04-01", value: 100 },
    { date: "1990-07-25", value: 1000 },
    { date: "1992-01-15", value: 2000 },
    { date: "1992-02-29", value: 3000 },
    { date: "1992-03-30", value: 4467.32 },
  ],
};

/** A daily percentage series of `days` points from 2 July 2018, rising by a quarter point a day. */
function daily(days: number): CaseDataset {
  return { ...yields, points: Array.from({ length: days }, (_, i) => ({ date: new Date(Date.UTC(2018, 6, 2 + i)).toISOString().slice(0, 10), value: 3 + i * 0.25 })) };
}

const draw = (dataset: CaseDataset) => renderToStaticMarkup(<HistoryFigure dataset={dataset} revealed={false} asOf="2018-10-24" />);

/** The text of each element with this data-testid in server-rendered markup, in order. */
function texts(html: string, testid: string): string[] {
  return [...html.matchAll(new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);
}

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

describe("a history chart the Learner can read", () => {
  it("labels the values at the left in round numbers and the dates below (first and last by month, round years between), naming the unit once", () => {
    const html = draw(sensex);
    expect(texts(html, "history-y-label")).toEqual(["0", "2,000", "4,000", "6,000"]);
    expect(texts(html, "history-x-label")).toEqual(["Apr 1979", "1985", "Mar 1992"]);
    expect(html).toContain(">index points<");
  });

  it("labels a percentage axis in percent without naming the unit again", () => {
    const html = draw(yields);
    const labels = texts(html, "history-y-label");
    expect([labels[0], labels.at(-1)]).toEqual(["3.32%", "3.38%"]);
    expect(html).not.toContain(">percent<");
  });

  it("gives money short labels and the full figure when a point is read", () => {
    const prizes: CaseDataset = { ...cash, label: "Prize sizes", points: [{ date: "2018-10-23", value: 877_800_000 }, { date: "2019-03-04", value: 1_537_000_000 }] };
    const html = draw(prizes);
    expect(texts(html, "history-y-label")).toEqual(["$800m", "$1bn", "$1.2bn", "$1.4bn", "$1.6bn"]);
    expect(texts(html, "history-x-label")).toEqual(["2018-10-23", "2019-03-04"]);
    expect(html).toContain('aria-label="2018-10-23: $877.8 million"');
  });

  it("keeps the minus sign on losses", () => {
    const losses: CaseDataset = { ...sensex, unit: "USD million", points: [{ date: "1999", value: -144.6 }, { date: "2000", value: -453.3 }, { date: "2001", value: -12 }] };
    const html = draw(losses);
    expect(texts(html, "history-y-label")).toEqual(["-600", "-400", "-200", "0"]);
    expect(texts(html, "history-value")).toEqual(["-144.6", "-453.3", "-12"]);
    expect(html).toContain(">USD million<");
  });

  it("prints each value above its point when there are 12 or fewer, and none on a longer line", () => {
    expect(texts(draw(yields), "history-value")).toEqual(["3.38%", "3.37%", "3.33%"]);
    expect(texts(draw(daily(12)), "history-value")).toHaveLength(12);
    expect(texts(draw(daily(13)), "history-value")).toEqual([]);
  });

  it("draws one point per value however long the line", () => {
    for (const days of [1, 3, 30, 31, 166]) expect(draw(daily(days)).match(/data-testid="history-point"/g)).toHaveLength(days);
  });

  it('makes each of a few points a tab stop that reads "<date>: <value>", and a long line one stop read with the arrow keys', () => {
    const few = draw(yields);
    expect(few.match(/tabindex="0"/g)).toHaveLength(3);
    expect(few).toContain('aria-label="2018-10-22: 3.38%"');
    const long = draw(daily(166));
    expect(long.match(/tabindex="0"/g)).toHaveLength(1);
    expect(long).toMatch(/role="slider"[^>]*aria-valuetext="2018-12-14: 44\.25%"/);
  });

  it("reads no point until one is hovered, tapped or focused, and says how", () => {
    const html = draw(yields);
    expect(html).toMatch(/data-testid="history-readout"[^>]*><span[^>]*>Hover over or tap the chart to read a value\.<\/span>/);
  });

  it("keeps the credit and the sourced marking on a long line too", () => {
    const html = draw(daily(166));
    expect(html.match(/data-testid="credit"/g)).toHaveLength(1);
    expect(marked(html, "sourced").join(" ")).toContain("Sourced history");
    expect(marked(html, "assumption")).toEqual([]);
  });
});

describe("the size of a history chart's points on screen", () => {
  // The drawing is 600 units wide; at the 768px iPad's panel it is 230px wide on screen, at a laptop's 410px.
  const ipad = 600 / 230;
  const laptop = 600 / 410;

  it("draws as before on the server, where nothing is measured: dots of radius 4 and a ring of 7", () => {
    expect(pointSizes(5, 1)).toEqual({ dot: 4, ring: 7 });
    expect(draw(sensex)).toMatch(/<circle data-testid="history-point"[^>]* r="4"/);
  });

  it("keeps a dot of 4px and a ring of 7px however narrow the panel draws the line", () => {
    for (const unitsPerPixel of [ipad, laptop]) {
      const { dot, ring } = pointSizes(5, unitsPerPixel);
      expect(dot / unitsPerPixel).toBeCloseTo(4);
      expect(ring / unitsPerPixel).toBeCloseTo(7);
    }
  });

  it("makes dots smaller where points crowd, so neighbours never merge, and leaves a long line's dots small", () => {
    const gap = 580 / 29;
    expect(pointSizes(30, ipad).dot).toBeCloseTo(0.4 * gap);
    expect(pointSizes(30, laptop).dot / laptop).toBeCloseTo(4);
    expect(pointSizes(31, ipad)).toEqual({ dot: 1.75, ring: 7 * ipad });
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

  it("folds each credit line behind a small ⓘ that is closed to start with, and keeps the amber sourced marking around it", () => {
    for (const html of [
      renderToStaticMarkup(<AnnuityFigure inputs={{ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 }} sourced={cash} />),
      renderToStaticMarkup(<HistoryFigure dataset={yields} revealed={false} asOf="2018-10-24" />),
    ]) {
      expect(html.match(/data-testid="credit"/g)).toHaveLength(1);
      expect(html).not.toMatch(/<details[^>]*data-testid="credit"[^>]*\sopen/);
      expect(html).toMatch(/<summary[^>]*aria-label="Where this figure comes from"[^>]*>\s*ⓘ\s*<svg[^>]*>[\s\S]*?<\/svg>\s*<\/summary>/);
      expect(html).toMatch(/Source:\s*<a[^>]*href="https:\/\/home\.treasury\.gov\/example"|Source:\s*<a[^>]*>CNBC, 24 October 2018\s*<span[^>]*> ↗<\/span><\/a>/);
      expect(html).toContain('data-kind="sourced"');
    }
  });

  // A paragraph may not hold a <details>: the browser would close the paragraph early, so the page would not
  // match the server's markup, and React reports that as an error.
  it("never puts a credit inside a paragraph", () => {
    for (const html of [
      renderToStaticMarkup(<AnnuityFigure inputs={{ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 }} sourced={cash} />),
      renderToStaticMarkup(<HistoryFigure dataset={yields} revealed={false} asOf="2018-10-24" />),
    ]) {
      expect(html).toContain("<details");
      for (const [, paragraph] of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) expect(paragraph).not.toContain("<details");
    }
  });

  it("without a sourced figure, the chart shows only the Learner's assumption", () => {
    const html = renderToStaticMarkup(<AnnuityFigure inputs={{ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 }} />);
    expect(marked(html, "sourced")).toEqual([]);
    expect(marked(html, "assumption").length).toBeGreaterThan(0);
  });
});

describe("every chart our own parts draw can be read", () => {
  const annuity = () => renderToStaticMarkup(<AnnuityFigure inputs={{ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 }} sourced={cash} />);

  it("the annuity chart labels both axes: dollars up the side, payments along the bottom", () => {
    const html = annuity();
    expect(texts(html, "chart-y-label")).toEqual(["$0", "$25 m", "$50 m", "$75 m", "$100 m"]);
    expect(texts(html, "chart-x-label")).toEqual(["Payment 1", "Payment 15", "Payment 30"]);
    expect(texts(html, "chart-y-name")).toEqual(["Dollars per payment"]);
    expect(texts(html, "chart-x-name")).toEqual(["Payment number (the first is paid now)"]);
  });

  // Payment 1 is $1.537bn × 0.05 / (1.05^30 − 1) ≈ $23.1m, paid now; payment 30 is that × 1.05^29 ≈ $95.2m, and ÷ 1.03^29 ≈ $40.4m today.
  it("the annuity chart reads a payment's value on hover, tap or focus", () => {
    const html = annuity();
    // One control for all thirty bars: a single tab stop, which says the last payment until another is read.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/role="slider"[^>]*aria-valuenow="30"[^>]*aria-valuetext="Payment 30: \$95\.2 million paid, worth \$40\.4 million today"/);
    expect(html).toContain("Hover over or tap the chart to read a value.");
  });

  it("the history chart labels both axes and reads a value on hover, tap or focus", () => {
    const html = renderToStaticMarkup(<HistoryFigure dataset={yields} revealed={false} asOf="2018-10-24" />);
    expect(texts(html, "history-y-label").length).toBeGreaterThan(0);
    expect(texts(html, "history-x-label")).toContain("2018-10-22");
    expect(html).toMatch(/tabindex="0"[^>]*aria-label="2018-10-22: 3\.\d\d%"/);
    expect(html).toContain("Hover over or tap the chart to read a value.");
  });
});
