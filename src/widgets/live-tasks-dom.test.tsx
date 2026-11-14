// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { RECIPES } from "./recipes/index";

// Guided Tasks written from the Widget as it stands (spec 2026-11-12, B7), in a browser: the Widget's state is set, so
// the task reads the old rate the Learner left and a claim the settings cannot show is not drawn.

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

const code = (() => {
  const built = RECIPES.find((r) => r.id === "rate_move")!.build({ title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5 }, refs: {}, facts: {} });
  if (!built.ok) throw new Error(built.error);
  return built.code;
})();

const draw = (initialValues?: Record<string, number>) => act(async () => root.render(<WidgetView code={code} complete initialValues={initialValues} />));
const tasks = () => [...host.querySelectorAll('[data-testid="guided-tasks"] li')].map((li) => li.textContent?.replace(/(Try next|Later|Tried)$/, ""));
const chips = (label: string) => [...host.querySelectorAll(`[aria-label="Quick values for ${label}"] button`)].map((b) => b.textContent);

describe("rate move's tasks in the browser (B7)", () => {
  it("reads the old rate restored from earlier play, and names the old rate that turns the gap round from there", async () => {
    await draw({ $old: 4.31, $new: 5.78 });
    expect(tasks()).toEqual(["Move the new rate to the old rate, 4.31%, and watch the move shrink to nothing", "Now set the old rate to 6.78% and see the same gap run the other way"]);
    // The new rate stops at the old rate where it is now, and shows it as a chip.
    expect(chips("New rate")).toContain("4.31%");
  });

  it("after the first task, the second names the first new rate", async () => {
    await draw({ $old: 4, $new: 4 });
    expect(tasks()).toEqual(["Move the new rate to the old rate, 4%, and watch the move shrink to nothing", "Now set the old rate to 5% and see the same gap run the other way"]);
    expect([...host.querySelectorAll('[data-testid="guided-tasks"] li')].map((li) => li.getAttribute("data-state"))).toEqual(["done", "current"]);
  });

  it("hides the second task when no old rate on the slider would turn the gap round", async () => {
    await draw({ $old: 4, $new: 19.5 });
    expect(tasks()).toEqual(["Move the new rate to the old rate, 4%, and watch the move shrink to nothing"]);
  });
});
