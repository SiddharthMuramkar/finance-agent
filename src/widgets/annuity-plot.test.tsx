// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnnuityPlot, type AnnuityBar } from "./annuity-plot";

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

const bars = (rate: number): AnnuityBar[] =>
  Array.from({ length: 30 }, (_, i) => {
    const payment = 20_000_000 * Math.pow(1.05, i);
    return { payment, presentValue: payment / Math.pow(1 + rate / 100, i), read: `Payment ${i + 1}` };
  });
const ticks = [{ value: 0, text: "0" }];
const draw = (rate: number, axes?: Parameters<typeof AnnuityPlot>[0]["axes"]) => act(async () => root.render(<AnnuityPlot bars={bars(rate)} ticks={ticks} unit="usd" axes={axes} />));
const labels = () => [...host.querySelectorAll<HTMLElement>('[data-testid="chart-x-label"]')];
const yTexts = () => [...host.querySelectorAll('[data-testid="chart-y-label"]')].map((e) => e.textContent);

describe("the annuity plot", () => {
  it("anchors the first and last payment labels to the edges and centres the middle one", async () => {
    await draw(3);
    const [first, middle, last] = labels();
    expect(first.style.left).toBe("0px");
    expect(last.style.right).toBe("0px");
    expect(middle.style.transform).toBe("translateX(-50%)");
  });

  it("anchors a year-labelled axis's first label, and leaves a label that is not the last payment centred", async () => {
    await draw(3, { yName: "$ millions per payment", xName: "Year", xMarks: [0, 5, 10, 15, 20, 25].map((index) => ({ index, text: String(2018 + index) })) });
    const all = labels();
    expect(all[0].style.left).toBe("0px");
    expect(all.at(-1)!.style.transform).toBe("translateX(-50%)");
  });

  it("is one tab stop, a slider read with the arrow keys, Home and End", async () => {
    await draw(3);
    expect(host.querySelectorAll("[tabindex]")).toHaveLength(1);
    const slider = host.querySelector<SVGRectElement>('[role="slider"]')!;
    const key = (k: string) => act(async () => void slider.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
    await key("Home");
    expect(host.querySelector('[data-testid="chart-readout"]')?.textContent).toBe("Payment 1");
    await key("ArrowRight");
    expect(slider.getAttribute("aria-valuenow")).toBe("2");
    await key("ArrowLeft");
    await key("ArrowLeft");
    expect(slider.getAttribute("aria-valuenow")).toBe("1");
    await key("End");
    expect(slider.getAttribute("aria-valuetext")).toBe("Payment 30");
  });

  it("keeps its axis put as the discount rate moves", async () => {
    await draw(0);
    const before = yTexts();
    await draw(10);
    expect(yTexts()).toEqual(before);
    expect(before.at(-1)).toMatch(/m$/);
  });
});
