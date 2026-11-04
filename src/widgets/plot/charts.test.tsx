// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlotResetContext } from "./domain";
import { AreaChartPlot, BarChartPlot, LineChartPlot, type ChartProps } from "./charts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const yLabels = (el: ParentNode = host) => [...el.querySelectorAll('[data-testid="plot-y-label"]')].map((e) => e.textContent);
const draw = (node: React.ReactNode) => act(async () => root.render(node));

const sip: ChartProps = {
  labels: ["5", "10", "15", "20"],
  series: [
    { category: "Value of your SIP", values: [100_000, 250_000, 450_000, 765_697] },
    { category: "What you put in", values: [60_000, 120_000, 180_000, 240_000] },
  ],
  xLabel: "Years",
  yLabel: "Rupees",
};

describe("the kit's charts", () => {
  it("overlap their series instead of stacking: the top of the axis is the highest single value, in lakh", async () => {
    await draw(<AreaChartPlot {...sip} variant="natural" />);
    const labels = yLabels();
    expect(labels.at(-1)).toBe("₹8 L");
    expect(labels.join(" ")).not.toMatch(/[KM]\b/);
    // The first series is a filled area, the other a line only.
    expect(host.querySelectorAll('[data-testid="plot-area"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="plot-line"]')).toHaveLength(2);
  });

  it("stacks only when asked to", async () => {
    await draw(<AreaChartPlot {...sip} variant="stacked" />);
    expect(Number(yLabels().at(-1)!.replace(/[^\d.]/g, ""))).toBeGreaterThan(8);
    expect(host.querySelectorAll('[data-testid="plot-area"]')).toHaveLength(2);
  });

  it("keeps the y-axis put when a value shrinks, and starts over when the Widget resets", async () => {
    const at = (v: number) => (
      <PlotResetContext.Provider value={0}>
        <BarChartPlot labels={["Before", "After"]} series={[{ category: "Swing", values: [v, v / 2] }]} yLabel="Percent" />
      </PlotResetContext.Provider>
    );
    await draw(at(100));
    const before = yLabels();
    const heightOf = () => Number(host.querySelectorAll('[data-testid="plot-bar"]')[0].getAttribute("height"));
    const tall = heightOf();
    await draw(at(50));
    expect(yLabels()).toEqual(before);
    expect(heightOf()).toBeCloseTo(tall / 2);
    await draw(
      <PlotResetContext.Provider value={1}>
        <BarChartPlot labels={["Before", "After"]} series={[{ category: "Swing", values: [50, 25] }]} yLabel="Percent" />
      </PlotResetContext.Provider>,
    );
    expect(yLabels()).not.toEqual(before);
  });

  it("caps bars at about 48px (48 drawing units when unmeasured) and centres them", async () => {
    await draw(<BarChartPlot labels={["Before", "After"]} series={[{ category: "Rate", values: [5, 5.5] }]} yLabel="Percent" />);
    const bars = [...host.querySelectorAll('[data-testid="plot-bar"]')];
    expect(bars).toHaveLength(2);
    const [x, w] = [Number(bars[0].getAttribute("x")), Number(bars[0].getAttribute("width"))];
    expect(w).toBeLessThanOrEqual(48);
    expect(x + w / 2).toBeCloseTo(150);
  });

  it("carries the unit in the readout and an accessible name on the chart", async () => {
    await draw(<BarChartPlot labels={["Jan", "Feb"]} series={[{ category: "Spend", values: [4000, 5200] }]} yLabel="Rupees" xLabel="Month" />);
    const hit = host.querySelectorAll<SVGRectElement>('[data-testid="plot-hit"]')[0];
    expect(hit.getAttribute("aria-label")).toBe("Jan: ₹4,000");
    await act(async () => hit.dispatchEvent(new Event("focusin", { bubbles: true })));
    expect(host.querySelector('svg[role="group"]')?.getAttribute("aria-label")).toContain("Spend");
  });

  it("names each focusable band and announces the focused value politely", async () => {
    await draw(<BarChartPlot labels={["a", "b", "c"]} series={[{ category: "S", values: [1, 2, 3] }]} yLabel="Rupees" />);
    const hits = [...host.querySelectorAll<SVGRectElement>('[data-testid="plot-hit"]')];
    for (const h of hits) {
      expect(h.getAttribute("role")).toBe("img");
      expect(h.getAttribute("aria-label")).toBeTruthy();
    }
    const readout = host.querySelector('[data-testid="plot-readout"]')!;
    expect(readout.getAttribute("aria-live")).toBe("polite");
    hits[0].focus();
    await act(async () => void 0);
    const first = readout.textContent;
    await act(async () => void hits[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(readout.textContent).not.toBe(first);
  });

  it("moves focus point to point with one tab stop", async () => {
    await draw(<LineChartPlot labels={["a", "b", "c", "d"]} series={[{ category: "S", values: [1, 2, 3, 4] }]} />);
    const hits = [...host.querySelectorAll<SVGRectElement>('[data-testid="plot-hit"]')];
    expect(hits.filter((h) => h.getAttribute("tabindex") === "0")).toHaveLength(1);
    hits[0].focus();
    await act(async () => void hits[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(hits[1]);
    await act(async () => void hits[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(hits[3]);
  });

  it("spaces a line's dates by time", () => {
    const html = renderToStaticMarkup(
      <LineChartPlot labels={["1979-04-03", "1990-07-25", "1992-02-29", "1992-03-31"]} series={[{ category: "Sensex", values: [100, 1000, 3000, 4467] }]} yLabel="Index points" />,
    );
    const xs = [...html.matchAll(/<circle cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(4);
    expect(xs[1] - xs[0]).toBeGreaterThan(40 * (xs[3] - xs[2]));
  });
});
