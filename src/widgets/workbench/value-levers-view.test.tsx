// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { exploreWidgetOf } from "@/course/explore-widget";
import { loadCourseMap } from "@/course/map";
import { AMAZON_2000 } from "@/finance/fixtures/amazon-2000.valuation";
import { valuationBlock } from "@/finance/valuation-case";
import { InsightSettledContext } from "../insight-settled";
import { setRange } from "../primitives/wave1/test-kit";
import { SavedTicksContext } from "../saved-ticks";
import { leverSpecs, valueLeversStories, valueLeversTasks } from "./value-levers-model";
import { ValueLeversView } from "./value-levers-view";

// Value levers as a Learner meets it (spec 2026-11-12, B3), drawn through the real Widget library from the recipe's frozen
// fixture, and on its own as Home draws it. The sentences are the ones the spec says a Learner must read.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE = readFileSync(join(process.cwd(), "src/widgets/fixtures/parts/value-levers.openui"), "utf8");
const amazon = valuationBlock.parse(AMAZON_2000);

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

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
const headline = () => host.querySelector('[data-testid="value-levers-headline"]')?.textContent ?? "";
const lever = (label: string) => host.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;
const taskStates = () => [...host.querySelectorAll('[data-testid="guided-tasks"] li')].map((li) => li.getAttribute("data-state"));
const chips = () => [...host.querySelectorAll('[role="group"][aria-label="Stories"] button')].map((b) => b.textContent);

async function drawFixture({ settled = false, onTicked = () => {} }: { settled?: boolean; onTicked?: (done: string[]) => void } = {}) {
  await act(async () => {
    root.render(
      <InsightSettledContext.Provider value={settled}>
        <SavedTicksContext.Provider value={{ ticked: [], onTicked }}>
          <WidgetView code={FIXTURE} complete />
        </SavedTicksContext.Provider>
      </InsightSettledContext.Provider>,
    );
  });
  await settle();
}

describe("Value levers in a Widget (the recipe's fixture)", () => {
  it('opens at "This story is worth $35 a share", the $35 the one key number', async () => {
    await drawFixture();
    expect(host.textContent).not.toContain("could not be drawn");
    expect(headline()).toBe("This story is worth $35 a share");
    const key = host.querySelector('[data-testid="value-levers-headline"] [data-key-figure]');
    expect(key?.textContent).toBe("$35");
    expect(key?.getAttribute("data-key-number")).toBe("");
    expect(host.textContent).toContain("Price on 3 Feb 2000");
    expect(host.textContent).toContain("Today: $1.1bn");
    // One name per idea between Topic 1 and its Workbench (ticket #88): the levers and bars in a beginner's words.
    expect(lever("Sales for each dollar invested")).toBeTruthy();
    expect(host.querySelector("figcaption")?.textContent).toBe("Cash it makes each year, then after year 10");
  });

  it("says each lever with its unit, and puts the chance it fails under More settings", async () => {
    await drawFixture();
    expect(lever("Revenue in year 10").getAttribute("aria-valuetext")).toBe("39 billion dollars");
    expect(lever("Operating margin once mature").getAttribute("aria-valuetext")).toBe("10 percent");
    expect(lever("Cost of capital while it grows").getAttribute("aria-valuetext")).toBe("12.84 percent");
    expect(host.querySelector('[data-testid="value-levers-more"]')?.textContent).toContain("Chance it fails");
    expect(host.querySelectorAll('[data-testid="value-levers-controls"] input[type="range"]')).toHaveLength(4);
  });

  it("shows $84 at revenue $60bn and margin 12.5%, and ticks Find a story worth the $84 price", async () => {
    const onTicked = vi.fn();
    await drawFixture({ onTicked });
    setRange(lever("Revenue in year 10"), 60);
    await settle();
    setRange(lever("Operating margin once mature"), 12.5);
    await settle();
    expect(headline()).toBe("This story is worth $84 a share");
    expect(taskStates()).toEqual(["done", "done"]);
    expect(onTicked).toHaveBeenLastCalledWith(["Move one lever at a time. Which one moves the value most?", "Find a story worth the $84 price"]);
  });

  it('reads "$0: lenders and option holders take everything" with margin at 4%', async () => {
    await drawFixture();
    setRange(lever("Operating margin once mature"), 4);
    await settle();
    expect(headline()).toBe("$0: lenders and option holders take everything");
    expect(host.querySelector('[data-testid="value-levers-headline"]')?.hasAttribute("data-nothing-left")).toBe(true);
    // No negative price anywhere a value is read (the cash-flow bars' losses are cash flows, not a price).
    for (const id of ["value-levers-headline", "value-levers-numbers"]) expect(host.querySelector(`[data-testid="${id}"]`)?.textContent).not.toMatch(/-\$\d/);
  });

  it("offers Damodaran's story and A grocer's margins, and A story worth $84 only once the Insight is settled", async () => {
    await drawFixture();
    expect(chips()).toEqual(["Damodaran's story", "A grocer's margins"]);
    act(() => root.unmount());
    root = createRoot(host);
    await drawFixture({ settled: true });
    expect(chips()).toEqual(["Damodaran's story", "A grocer's margins", "A story worth $84"]);
    const priceChip = [...host.querySelectorAll("button")].find((b) => b.textContent === "A story worth $84")!;
    await act(async () => priceChip.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(headline()).toBe("This story is worth $84 a share");
    expect(lever("Revenue in year 10").getAttribute("aria-valuetext")).toBe("60 billion dollars");
  });
});

describe("ValueLeversView on its own, as Home draws it", () => {
  const specs = leverSpecs(amazon);
  const stories = valueLeversStories(amazon, specs, { caseStory: "Damodaran's story", priceStory: { revenue: 60, margin: 12.5 } });

  it("draws without the Widget renderer, and says once when a lever first moves and when the price is found", async () => {
    const onFirstLeverMove = vi.fn();
    const onPriceFound = vi.fn();
    await act(async () => {
      root.render(<ValueLeversView block={amazon} stories={stories} tasks={valueLeversTasks(amazon)} onFirstLeverMove={onFirstLeverMove} onPriceFound={onPriceFound} />);
    });
    expect(headline()).toBe("This story is worth $35 a share");
    setRange(lever("Revenue in year 10"), 60);
    setRange(lever("Revenue in year 10"), 61);
    await settle();
    expect(onFirstLeverMove).toHaveBeenCalledTimes(1);
    expect(onPriceFound).not.toHaveBeenCalled();
    setRange(lever("Operating margin once mature"), 12.5);
    await settle();
    expect(onPriceFound).toHaveBeenCalledTimes(1);
    expect(headline()).toMatch(/^This story is worth \$8\d a share$/);
  });
});

// Review finding talk-label-missing-from-bar-aria: Spine Topic 11's $40bn is a talk nobody paid (price.label), and the screen
// says so; the bar's accessible name called it "the price of $40bn", so a screen reader heard what the screen does not say.
describe("a Case whose figure is not a price (price.label): the bar's accessible name uses the Case's word", () => {
  const bar = () => host.querySelector('[data-testid="value-levers-bar"]')?.getAttribute("aria-label");

  it("calls Uber's $40bn a talk in Spine Topic 11's explore Workbench, as its marker and Thing to try do", async () => {
    const widget = exploreWidgetOf(loadCourseMap().topic("spine-11-story-to-numbers")!);
    expect(widget).not.toBeNull();
    await act(async () => {
      root.render(<WidgetView code={widget!.code} complete />);
    });
    await settle();
    expect(host.textContent).toContain("Talk on 2 Dec 2014");
    expect(host.textContent).toContain("Find a story worth the $40bn talk");
    expect(bar()).toBe("On a scale up to $60bn, with the talk of $40bn marked");
  });

  it("names the mark the same way in range mode, and keeps 'price' for a Case without a label", async () => {
    const talk = valuationBlock.parse({ ...AMAZON_2000, price: { ...AMAZON_2000.price, label: "talk" } });
    const draw = (block: typeof amazon) =>
      act(async () => {
        root.render(<ValueLeversView block={block} stories={[]} tasks={valueLeversTasks(block)} mode={{ kind: "range" }} />);
      });
    await draw(talk);
    expect(bar()).toMatch(/^A range from \$\d+ to \$\d+ on a scale up to \$150, with the talk of \$84 (inside the range|above it|below it)$/);
    await draw(amazon);
    expect(bar()).toMatch(/, with the price of \$84 (inside the range|above it|below it)$/);
  });
});
