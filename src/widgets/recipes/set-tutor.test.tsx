// @vitest-environment happy-dom
import { evaluate } from "@openuidev/lang-core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { rateMoveLines } from "@/finance/rate-change";
import { widgetNodes, widgetParts, widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { recipeById, RECIPES } from "./index";
import { SET_TUTOR } from "./set-tutor";

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

function type(value: string) {
  const input = host.querySelector<HTMLInputElement>('[data-testid="step-ask"] input')!;
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

  it("show mode draws the move from 4% to 5% and its three worked lines: 1 point, 100 basis points and 25%", async () => {
    await draw(show(4, 5).code);
    expect(text()).not.toContain("could not be drawn");
    expect(host.querySelector('[data-testid="plot-chart"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="plot-line"]').length).toBeGreaterThan(0);
    expect(text()).toContain("5% minus 4% is 1 point");
    expect(text()).toContain("1 point times 100 is 100 bp");
    expect(text()).toContain("1 divided by the old 4%, times 100, is 25%");
    expect(text()).toMatch(/Points/);
    expect(text()).toMatch(/Basis points/);
    expect(text()).toMatch(/Percent of the old rate/);
  });

  it("starts its sliders at the given rates and shows no currency symbol", async () => {
    await draw(show(7.5, 7.2).code);
    const values = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')].map((i) => Number(i.value));
    expect(values).toContain(7.2);
    expect(text()).not.toMatch(/[$₹]/);
  });

  it("shows a fall as a fall of 0.3 points and 30 basis points", async () => {
    await draw(show(7.5, 7.2).code);
    expect(text()).toContain("7.2% minus 7.5% is a fall of 0.3 points");
    expect(text()).toContain("0.3 points times 100 is a fall of 30 bp");
  });

  it("says a move from 0% has no percent change", async () => {
    await draw(show(0, 1.5).code);
    expect(text()).toContain("The old rate is 0%, so the percent change has no value");
  });

  it("practice mode hides the worked lines until the Learner types an answer, then marks it and reveals them", async () => {
    await draw(show(4, 5, "practice").code);
    expect(text()).not.toContain("could not be drawn");
    expect(host.querySelector('[data-testid="plot-chart"]')).not.toBeNull();
    expect(text()).not.toContain("is 100 bp");
    expect(text()).not.toContain("is 25%");
    expect(text()).toContain("By how many basis points?");

    type("10");
    press("Check");
    expect(host.querySelector('[data-testid="step-ask"]')!.getAttribute("data-status")).toBe("wrong");

    type("100");
    press("Check");
    expect(host.querySelector('[data-testid="step-ask"]')!.getAttribute("data-status")).toBe("right");

    press("Next");
    expect(text()).toContain("5% minus 4% is 1 point");
    press("Next");
    expect(text()).toContain("1 point times 100 is 100 bp");
    press("Next");
    expect(text()).toContain("1 divided by the old 4%, times 100, is 25%");
  });

  it("practice mode marks in whole basis points: one basis point off is wrong, on the biggest move it takes", async () => {
    await draw(show(7.5, 9.49, "practice").code);
    type("198");
    press("Check");
    expect(host.querySelector('[data-testid="step-ask"]')!.getAttribute("data-status")).toBe("wrong");
    type("199");
    press("Check");
    expect(host.querySelector('[data-testid="step-ask"]')!.getAttribute("data-status")).toBe("right");
  });

  it("practice mode asks about the size of a fall, and refuses a move of 2 points or more", async () => {
    await draw(show(7.5, 7.2, "practice").code);
    type("30");
    press("Check");
    expect(host.querySelector('[data-testid="step-ask"]')!.getAttribute("data-status")).toBe("right");
    expect(rateMove().build({ title: "A big move", inputs: { old: 2, new: 4, mode: "practice" }, refs: {}, facts: {} }).ok).toBe(false);
    expect(rateMove().build({ title: "A big move", inputs: { old: 2, new: 4, mode: "show" }, refs: {}, facts: {} }).ok).toBe(true);
  });

  it("practice mode states its lines from the tested rateMoveLines", () => {
    const steps = widgetNodes(show(5, 5.2, "practice").code).filter((n) => n.typeName === "Step");
    expect(steps.slice(1).map((s) => s.props.body)).toEqual(rateMoveLines(5, 5.2));
  });

  it("show mode works its lines out in the browser exactly as the tested rateMoveLines does, wherever the sliders go", () => {
    const lines = widgetNodes(show(5, 5.2).code).flatMap((n) => (n.typeName === "StepsItem" ? [n.props.details] : []));
    expect(lines).toHaveLength(3);
    for (let a = 0; a <= 2000; a += 53) {
      for (let b = 0; b <= 2000; b += 47) {
        const state: Record<string, number> = { $old: a / 100, $new: b / 100, old: a / 100, new: b / 100 };
        const said = lines.map((line) => evaluate(line as never, { getState: (name: string) => state[name], resolveRef: () => undefined }));
        expect(said, `${a / 100} to ${b / 100}`).toEqual(rateMoveLines(a / 100, b / 100));
      }
    }
  });
});
