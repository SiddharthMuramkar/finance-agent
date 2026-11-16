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

describe("StepThrough tiles", () => {
  const tiles = [{ label: "Cash flow statement" }, { label: "Balance sheet" }, { label: "Income statement" }];
  const lit = (p: Page) => [...p.host.querySelectorAll("[data-testid=step-tile]")].map((t) => t.getAttribute("data-lit"));

  it("draws every tile on the first step, none lit, then lights each in turn and keeps it lit", () => {
    page = draw(<StepThroughView tiles={tiles} steps={[{ title: "Event", body: "A warehouse" }, ...tiles.map((t, i) => ({ title: t.label, body: "Moves", light: i }))]} />);
    expect(lit(page)).toEqual(["false", "false", "false"]);
    const next = [...page.host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Next")!;
    click(next);
    expect(lit(page)).toEqual(["true", "false", "false"]);
    click(next);
    click(next);
    expect(lit(page)).toEqual(["true", "true", "true"]);
  });

  it("draws no tiles when none are given", () => {
    page = draw(<StepThroughView steps={steps} />);
    expect(byId(page, "step-tiles")).toBeNull();
  });
});
