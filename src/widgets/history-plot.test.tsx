// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryPlot, type PlotPoint } from "./history-plot";

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

const point = (date: string, value: number): PlotPoint => ({ date, value, text: String(value), short: String(value) });
// Synthetic milestones: Case Data itself never goes into git.
const milestones = [point("1979-04-03", 100), point("1990-07-25", 1000), point("1991-12-31", 1500), point("1992-02-29", 3000), point("1992-03-31", 4467)];
const format = (v: number) => v.toLocaleString("en-US");

const draw = (points: PlotPoint[], extra: { scale?: "linear" | "log" } = {}) => act(async () => root.render(<HistoryPlot label="Sensex" points={points} ticks={[]} format={format} {...extra} />));
const cxs = () => [...host.querySelectorAll('[data-testid="history-point"]')].map((c) => Number(c.getAttribute("cx")));
const cys = () => [...host.querySelectorAll('[data-testid="history-point"]')].map((c) => Number(c.getAttribute("cy")));
const texts = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)].map((e) => e.textContent);

describe("a history chart spaced by time", () => {
  it("puts the years between 1979 and 1990 at least 40 times further apart than a month in 1992", async () => {
    await draw(milestones);
    const x = cxs();
    expect(x[1] - x[0]).toBeGreaterThanOrEqual(40 * (x[4] - x[3]));
  });

  it("labels the first and last by month and the years between, anchored at the edges", async () => {
    await draw(milestones);
    expect(texts("history-x-label")).toEqual(["Apr 1979", "1985", "Mar 1992"]);
    const labels = [...host.querySelectorAll<HTMLElement>('[data-testid="history-x-label"]')];
    expect(labels[0].style.left).toBe("0px");
    expect(labels[2].style.right).toBe("0px");
  });

  it("keeps its test ids and a keyboard stop on each of a few points", async () => {
    await draw(milestones);
    expect(host.querySelectorAll('[data-testid="history-point"]')).toHaveLength(5);
    expect(host.querySelectorAll("[tabindex='0']")).toHaveLength(5);
    expect(host.querySelector('[data-testid="history-readout"]')).not.toBeNull();
  });
});

describe("the log scale", () => {
  it("offers a switch that redraws the line with ratios, so steady growth runs straight", async () => {
    await draw(milestones);
    const before = cys();
    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="history-log-toggle"]')!;
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle.click());
    // Wait out the ease.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    const after = cys();
    expect(after).not.toEqual(before);
    // On a log axis a tenfold rise is the same height wherever it starts: 100 -> 1000 is as tall as 1000 -> 10,000.
    expect(texts("history-y-label")).toContain("1,000");
    expect(texts("history-y-label")).not.toContain("0");
  });

  it("can start on the log scale, and is not offered for values at or below zero", async () => {
    await draw(milestones, { scale: "log" });
    expect(host.querySelector('[data-testid="history-log-toggle"]')?.getAttribute("aria-checked")).toBe("true");
    await draw([point("1999", -5), point("2000", 3), point("2001", 9)]);
    expect(host.querySelector('[data-testid="history-log-toggle"]')).toBeNull();
  });
});
