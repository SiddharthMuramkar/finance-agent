// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";

// The Slider has no box to type a value in, at any width (ADR 0009). Its value is a reading, not a button that turns
// into a box, and the −/+ buttons keep focus while the Learner steps, so the arrow-key and tap paths reach every step.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const code = ['root = Widget("Rates", [rate])', "$rate = 4", 'rate = Slider("rate", "Old rate", 0, 10, 0.25, $rate, "percent")'].join("\n");

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

describe("the Slider has no typed-value box", () => {
  it("has no exact-value box and no tap-to-type value button", async () => {
    await act(async () => root.render(<WidgetView code={code} complete />));
    expect(host.querySelector('input[aria-label$="exact value"]')).toBeNull();
    expect(host.querySelector('input[aria-label$="type a value"]')).toBeNull();
    expect(host.querySelector('button[title="Tap to type a value"]')).toBeNull();
    expect(host.querySelectorAll('input:not([type="range"])')).toHaveLength(0);
    expect(host.querySelector("output")?.textContent).toBe("4%");
  });

  it("steps with +, and the + button keeps focus", async () => {
    await act(async () => root.render(<WidgetView code={code} complete />));
    const plus = host.querySelector<HTMLButtonElement>('button[aria-label="Increase Old rate by one step"]')!;
    await act(async () => plus.focus());
    await act(async () => plus.click());
    expect(host.querySelector("output")?.textContent).toBe("4.01%");
    expect(document.activeElement).toBe(plus);
  });
});
