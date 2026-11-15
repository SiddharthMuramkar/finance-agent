// Test helpers for the Signal widgets, in the spirit of Testing Library (render, query by role and text, fire events)
// on React's own act and createRoot, as the repo's other DOM tests do: the package itself is not a dependency here.
// Used only by the *.test.tsx files beside it, under `@vitest-environment happy-dom`.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: (() => void)[] = [];

/** Renders a widget into a fresh container in document.body. */
export function render(ui: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  const unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  mounted.push(unmount);
  return { container, unmount };
}

/** Unmounts everything render() mounted. Call it in afterEach. */
export function cleanup() {
  while (mounted.length) mounted.pop()!();
}

/** An element's text with runs of white space made one space. */
export const textOf = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Every element with this role: native buttons, sliders and groups count as their implicit roles. */
export function allByRole(scope: Element, role: "button" | "slider" | "group" | "img" | "region" | "tooltip"): HTMLElement[] {
  const implicit: Record<string, string> = { button: "button", slider: 'input[type="range"]', group: "fieldset", img: "svg[role=img]", region: "section", tooltip: "[role=tooltip]" };
  return [...scope.querySelectorAll<HTMLElement>(`${implicit[role]}, [role="${role}"]`)];
}

/** The one element with this role whose accessible name (aria-label, its label, or its text) contains `name`. */
export function getByRole(scope: Element, role: Parameters<typeof allByRole>[1], name: string | RegExp): HTMLElement {
  const matches = allByRole(scope, role).filter((el) => {
    const label = el.getAttribute("aria-label") ?? (el.id ? textOf(scope.querySelector(`label[for="${CSS.escape(el.id)}"]`)) : "") ?? "";
    const accessible = label || textOf(el);
    return typeof name === "string" ? accessible.includes(name) : name.test(accessible);
  });
  if (matches.length !== 1) throw new Error(`Expected one ${role} named ${String(name)}, found ${matches.length}.`);
  return matches[0];
}

/** The one element with this role and name, or null. */
export function queryByRole(scope: Element, role: Parameters<typeof allByRole>[1], name: string | RegExp): HTMLElement | null {
  try {
    return getByRole(scope, role, name);
  } catch {
    return null;
  }
}

/** Clicks an element inside act. */
export function click(el: HTMLElement) {
  act(() => el.click());
}

/** Moves a native range input to `value` the way a browser does: sets it and fires `input`, then `change`. */
export function setRange(input: HTMLElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Makes `prefers-reduced-motion: reduce` match, so scripted runs jump to their end at once (spec §9.9). */
export function reduceMotion() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
