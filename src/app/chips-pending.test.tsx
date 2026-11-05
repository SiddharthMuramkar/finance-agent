// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { choicesFor } from "@/tutor/choices";
import { Chips } from "./workspace-parts";

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

const STORY = choicesFor("story", null, null);

describe("the Next chip and the Choices", () => {
  it("show a spinner on the chip pressed and hold the others still, sending once", () => {
    const onNext = vi.fn();
    act(() => root.render(<Chips offer={{ kind: "next", step: "concept", label: "Next: Concept", advances: true }} choices={STORY} onNext={onNext} onChoice={() => {}} />));
    const next = host.querySelector<HTMLButtonElement>('[data-testid="next-chip"]')!;
    expect(next.getAttribute("aria-busy")).toBeNull();
    act(() => next.click());
    act(() => next.click());
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(next.getAttribute("aria-busy")).toBe("true");
    expect(next.querySelector('[data-testid="spinner"]')).not.toBeNull();
    for (const chip of host.querySelectorAll<HTMLButtonElement>('[data-testid="choice"]')) expect(chip.disabled).toBe(true);
  });

  it("do the same for a Choice, which sends its index once", () => {
    const onChoice = vi.fn();
    act(() => root.render(<Chips offer={null} choices={STORY} onNext={() => {}} onChoice={onChoice} />));
    const [first] = host.querySelectorAll<HTMLButtonElement>('[data-testid="choice"]');
    act(() => first.click());
    act(() => first.click());
    expect(onChoice).toHaveBeenCalledTimes(1);
    expect(onChoice).toHaveBeenCalledWith(0);
    expect(first.getAttribute("aria-busy")).toBe("true");
  });

  it("draws two or three raised Choice buttons, each with a decorative picture before its label, and no Show me in a widget", () => {
    for (const choices of [STORY, choicesFor("concept", null, "show")]) {
      act(() => root.render(<Chips offer={null} choices={choices} onNext={() => {}} onChoice={() => {}} />));
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="choice"]')];
      expect(buttons.length).toBe(choices.length);
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      expect(buttons.length).toBeLessThanOrEqual(3);
      buttons.forEach((b, i) => {
        expect(b.tagName).toBe("BUTTON");
        expect(b.getAttribute("data-affordance")).toBe("button");
        expect(b.className).toContain("btn-secondary");
        const img = b.firstElementChild;
        expect(img?.tagName).toBe("IMG");
        expect(img?.getAttribute("alt")).toBe("");
        expect(b.textContent?.trim()).toBe(choices[i].label);
      });
      expect(host.textContent).not.toContain("Show me in a widget");
    }
  });
});
