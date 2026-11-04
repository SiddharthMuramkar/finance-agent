// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";

// The narrow Slider shows its value as a button that turns into a typed-value box. Enter or Escape in the box
// must hand focus back to the button; leaving the box by blur must not pull it back.

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

const valueButton = () => host.querySelector<HTMLButtonElement>('button[title="Tap to type a value"]')!;
const box = () => host.querySelector<HTMLInputElement>('input[aria-label="Old rate, type a value"]')!;

async function startTyping() {
  await act(async () => root.render(<WidgetView code={code} complete />));
  await act(async () => valueButton().click());
  const input = box();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, "5");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

describe("the narrow Slider's typed-value box", () => {
  it("returns focus to the value button after Enter", async () => {
    const input = await startTyping();
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(box()).toBeNull();
    expect(document.activeElement).toBe(valueButton());
  });

  it("returns focus to the value button after Escape", async () => {
    const input = await startTyping();
    await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(box()).toBeNull();
    expect(document.activeElement).toBe(valueButton());
  });

  it("does not pull focus back on blur", async () => {
    const input = await startTyping();
    const other = document.createElement("button");
    host.append(other);
    await act(async () => other.focus());
    expect(box()).toBeNull();
    expect(input.isConnected).toBe(false);
    expect(document.activeElement).toBe(other);
  });
});
