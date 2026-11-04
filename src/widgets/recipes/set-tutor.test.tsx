// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { widgetNodes, widgetParts, widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { recipeById, RECIPES } from "./index";
import { RATE_MOVE_LABELS, RATE_MOVE_STATE, SET_TUTOR } from "./set-tutor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
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

const rateMove = () => recipeById("rate_move")!;

/** What show_widget does first: build the recipe from the Tutor's params. */
function show(old: number, next: number, mode?: "show" | "practice") {
  const built = rateMove().build({ title: `From ${old}% to ${next}%`, inputs: { old, new: next, ...(mode ? { mode } : {}) }, refs: {}, facts: {} });
  if (!built.ok) throw new Error(built.error);
  return built;
}

async function draw(code: string) {
  await act(async () => {
    root.render(<WidgetView code={code} complete />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

const text = () => (host.textContent ?? "").replace(/\s+/g, " ");

const status = () => host.querySelector('[data-testid="rate-move-answer"]')!.getAttribute("data-status");

function type(value: string) {
  const input = host.querySelector<HTMLInputElement>('[data-testid="rate-move-answer"] input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const press = (name: string) =>
  act(() => {
    [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!.click();
  });

describe("the rate_move recipe", () => {
  it("is in the catalog once, in its own set", () => {
    expect(SET_TUTOR.map((r) => r.id)).toEqual(["rate_move"]);
    expect(RECIPES.filter((r) => r.id === "rate_move")).toHaveLength(1);
  });

  for (const mode of ["show", "practice"] as const) {
    it(`passes every Widget check show_widget runs, in ${mode} mode`, () => {
      const built = show(4, 5, mode);
      expect(widgetProblems(built.code)).toEqual([]);
      expect(widgetRuleProblems(built.code)).toEqual([]);
      expect(widgetParts(built.code).title).toBe("From 4% to 5%");
      expect(built.refs).toEqual([]);
    });
  }

  it("is no Illustration: its numbers are inputs code works out", () => {
    expect(show(4, 5).title.startsWith("Illustration:")).toBe(false);
  });

  it("refuses rates outside 0% to 20%, finer than 0.01, an unknown mode, or a free number", () => {
    const build = (inputs: Record<string, unknown>) => rateMove().build({ title: "A rate move", inputs, refs: {}, facts: {} }).ok;
    expect(build({ old: 4, new: 5 })).toBe(true);
    expect(build({ old: 4, new: 20.5 })).toBe(false);
    expect(build({ old: -1, new: 5 })).toBe(false);
    expect(build({ old: 4, new: 5.255 })).toBe(false);
    expect(build({ old: 4, new: 5, mode: "quiz" })).toBe(false);
    expect(build({ old: 4, new: 5, price: 3 })).toBe(false);
    expect(rateMove().build({ title: "A rate move", inputs: { old: 4, new: 5 }, refs: {}, facts: { before: 3 } }).ok).toBe(false);
  });

  it("show mode draws the arrow from 4% to 5% and its three worked lines: 1 point, 100 basis points and 25%", async () => {
    await draw(show(4, 5).code);
    expect(text()).not.toContain("could not be drawn");
    expect(host.querySelector('[data-testid="rate-move-arrow"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="rate-move-head"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="rate-move-line"]')!.getAttribute("data-direction")).toBe("rise");
    expect(text()).toContain("5% minus 4% is 1 point");
    expect(text()).toContain("1 point times 100 is 100 bp");
    expect(text()).toContain("1 divided by the old 4%, times 100, is 25%");
    for (const label of RATE_MOVE_LABELS) expect(text()).toContain(label);
  });

  it("starts its sliders at the given rates, moves the lines with them, and shows no currency symbol", async () => {
    await draw(show(7.5, 7.2).code);
    const sliders = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    expect(sliders.map((i) => Number(i.value)).sort()).toEqual([7.2, 7.5]);
    expect(text()).not.toMatch(/[$₹]/);
  });

  it("shows a fall as a fall of 0.3 points and 30 basis points", async () => {
    await draw(show(7.5, 7.2).code);
    expect(host.querySelector('[data-testid="rate-move-line"]')!.getAttribute("data-direction")).toBe("fall");
    expect(text()).toContain("7.2% minus 7.5% is a fall of 0.3 points");
    expect(text()).toContain("0.3 points times 100 is a fall of 30 bp");
  });

  it("says a move from 0% has no percent change", async () => {
    await draw(show(0, 1.5).code);
    expect(text()).toContain("The old rate is 0%, so the percent change has no value");
  });

  it("practice mode hides the worked lines until the Learner types an answer, with nothing to step past it, then marks it and reveals them", async () => {
    await draw(show(4, 5, "practice").code);
    expect(text()).not.toContain("could not be drawn");
    expect(host.querySelector('[data-testid="rate-move-arrow"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="rate-move-readout"]')).toHaveLength(0);
    expect(text()).not.toContain("is 100 bp");
    expect(text()).not.toContain("is 25%");
    expect([...host.querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Check"]);
    expect(text()).toContain("By how many basis points?");

    type("100 bp");
    press("Check");
    expect(status()).toBe("right");
    expect(text()).toContain("5% minus 4% is 1 point");
    expect(text()).toContain("1 point times 100 is 100 bp");
    expect(text()).toContain("1 divided by the old 4%, times 100, is 25%");
  });

  it("practice mode marks a wrong answer as wrong and still reveals the lines", async () => {
    await draw(show(4, 5, "practice").code);
    type("10");
    press("Check");
    expect(status()).toBe("wrong");
    expect(text()).toContain("1 point times 100 is 100 bp");
  });

  it("practice mode takes a move of any size and marks it in whole basis points: 250 bp, and one basis point off", async () => {
    expect(widgetProblems(show(2, 4.5, "practice").code)).toEqual([]);
    await draw(show(2, 4.5, "practice").code);
    type("249");
    press("Check");
    expect(status()).toBe("wrong");
    act(() => root.unmount());
    root = createRoot(host);
    await draw(show(2, 4.5, "practice").code);
    type("250");
    press("Check");
    expect(status()).toBe("right");
  });

  it("practice mode takes the size of a fall, or the fall with its sign", async () => {
    await draw(show(7.5, 7.2, "practice").code);
    type("-30");
    press("Check");
    expect(status()).toBe("right");
  });

  it("gives the RateMove part the rates: the Widget state names old and new in show mode, the numbers in practice", () => {
    const part = (code: string) => widgetNodes(code).find((n) => n.typeName === "RateMove")!;
    const shown = part(show(5, 5.2).code).props;
    expect([shown.oldRate, shown.newRate].map((v) => (v as { n: string }).n)).toEqual([`$${RATE_MOVE_STATE.old}`, `$${RATE_MOVE_STATE.new}`]);
    expect(part(show(5, 5.2, "practice").code).props).toMatchObject({ oldRate: 5, newRate: 5.2, mode: "practice" });
  });
});
