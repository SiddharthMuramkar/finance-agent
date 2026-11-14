import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

// Helpers for the wave 1 tests: draw a React element in a browser-like page (happy-dom) and poke it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Page = { host: HTMLElement; root: Root; cleanup: () => void };

export function draw(element: ReactElement): Page {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return {
    host,
    root,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

export function redraw(page: Page, element: ReactElement) {
  act(() => page.root.render(element));
}

/** Pretend the Learner's system asks for reduced motion (or not). */
export function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

export const byId = (page: Page, testId: string) => page.host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
export const allById = (page: Page, testId: string) => [...page.host.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)];

export function click(el: Element | null) {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export function key(el: Element | null, name: string) {
  if (!el) throw new Error("nothing to press a key on");
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
}

/** Set a range input the way a drag would: through React's value setter, then an input event. */
export function setRange(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Let animation frames and timers run. */
export async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
