// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  vi.unstubAllGlobals();
});

const point = (date: string, value: number): PlotPoint => ({ date, value, text: String(value), short: String(value) });
const before = [point("2018-01-01", 10), point("2018-06-01", 12), point("2018-10-24", 14)];
const after = [...before, point("2019-03-01", 18), point("2019-09-01", 20)];
const draw = (points: PlotPoint[]) => act(async () => root.render(<HistoryPlot label="Yield" points={points} ticks={[]} format={String} />));
const reveal = () => host.querySelector<SVGElement>('[data-testid="history-reveal"]');

describe("a history chart whose withheld part is revealed", () => {
  it("draws no reveal on first render", async () => {
    await draw(before);
    expect(reveal()).toBeNull();
  });

  it("draws the revealed stretch in over 700 ms", async () => {
    await draw(before);
    await draw(after);
    expect(reveal()).not.toBeNull();
    expect(reveal()!.style.transition).toContain("700ms");
    expect(host.querySelectorAll('[data-testid="history-point"]')).toHaveLength(5);
  });

  it("does not animate under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    await draw(before);
    await draw(after);
    expect(reveal()).toBeNull();
    expect(host.querySelectorAll('[data-testid="history-point"]')).toHaveLength(5);
  });
});
