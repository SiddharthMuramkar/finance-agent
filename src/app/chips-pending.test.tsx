// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { choicesFor } from "@/tutor/choices";
import { primaryButtonClass } from "./ui";
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

  it("set the Next chip apart as the main move: its own row first, full size, with the smaller Choices grouped below (critic AFF-1)", () => {
    act(() => root.render(<Chips offer={{ kind: "next", step: "concept", label: "Next: Concept", advances: true }} choices={STORY} onNext={() => {}} onChoice={() => {}} />));
    const wrap = host.querySelector('[data-testid="choices"]')!;
    const [first, second] = [...wrap.children];
    expect(first.getAttribute("data-testid")).toBe("next-chip");
    expect(first.className).not.toContain("btn-sm");
    expect(second.getAttribute("role")).toBe("group");
    expect(second.getAttribute("aria-label")).toBe("Choices");
    const choices = [...second.querySelectorAll<HTMLButtonElement>('[data-testid="choice"]')];
    expect(choices.length).toBe(STORY.length);
    for (const c of choices) expect(c.className).toContain("btn-sm");
  });

  it("make the Next chip the one raised primary on /study, while the Choices stay secondary (#478)", () => {
    act(() => root.render(<Chips offer={{ kind: "next", step: "concept", label: "Next: Concept", advances: true }} choices={STORY} onNext={() => {}} onChoice={() => {}} />));
    const next = host.querySelector<HTMLButtonElement>('[data-testid="next-chip"]')!;
    for (const cls of primaryButtonClass.split(" ")) expect(next.classList.contains(cls)).toBe(true);
    const choices = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="choice"]')];
    expect(choices.length).toBeGreaterThan(0);
    for (const c of choices) {
      expect(c.classList.contains("btn-primary")).toBe(false);
      expect(c.classList.contains("btn-secondary")).toBe(true);
    }
  });

  it("keep a pressed Choice's label beside its spinner, and the others visibly held (critic AFF-3)", () => {
    act(() => root.render(<Chips offer={{ kind: "next", step: "concept", label: "Next: Concept", advances: true }} choices={STORY} onNext={() => {}} onChoice={() => {}} />));
    const [first, ...rest] = host.querySelectorAll<HTMLButtonElement>('[data-testid="choice"]');
    act(() => first.click());
    expect(first.querySelector('[data-testid="spinner"]')).not.toBeNull();
    expect(first.textContent?.trim()).toBe(STORY[0].label);
    expect(first.disabled).toBe(true);
    for (const c of rest) expect(c.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-testid="next-chip"]')!.disabled).toBe(true);
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
