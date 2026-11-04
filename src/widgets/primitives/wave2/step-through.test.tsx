// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { byId, click, draw, key, stubReducedMotion, type Page } from "../wave1/test-kit";
import { StepThroughView } from "./step-through";

let page: Page | null = null;
beforeEach(() => stubReducedMotion(true));
afterEach(() => {
  page?.cleanup();
  page = null;
  vi.unstubAllGlobals();
});

const steps = [
  { title: "One", body: "First step" },
  { title: "Two", body: "Second step" },
];

describe("StepThrough Back and Next", () => {
  it("keep focus at the ends: aria-disabled, not disabled, so arrow keys still work", () => {
    page = draw(<StepThroughView steps={steps} />);
    const buttons = [...page.host.querySelectorAll<HTMLButtonElement>("button")];
    const next = buttons.find((b) => b.textContent === "Next")!;
    const back = buttons.find((b) => b.textContent === "Back")!;
    expect(back.getAttribute("aria-disabled")).toBe("true");
    act(() => next.focus());
    click(next);
    expect(byId(page, "step-through")!.getAttribute("data-step")).toBe("1");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(next);
    click(next);
    expect(byId(page, "step-through")!.getAttribute("data-step")).toBe("1");
    key(next, "ArrowLeft");
    expect(byId(page, "step-through")!.getAttribute("data-step")).toBe("0");
  });
});
