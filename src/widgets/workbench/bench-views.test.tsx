// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { valuationCase } from "@/finance/valuation-cases";
import { MarketReadingsView } from "../market-readings-view";
import { setRange } from "../primitives/wave1/test-kit";
import { SavedTicksContext } from "../saved-ticks";
import { allTasksTicked, readWidget } from "../widget-reading";
import { SaveStoryContext } from "./save-story";
import { leverSpecs, openingSettings, valueLeversModel, type SavedStory } from "./value-levers-model";

// The five Workbench Widgets of B4, and Value levers in its Spine Topic modes (Appendix D), as a Learner meets them: each
// recipe's frozen fixture drawn through the real Widget library. The figures are Appendix B.1's for Damodaran's Amazon.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = (name: string) => readFileSync(join(process.cwd(), "src/widgets/fixtures/parts", `${name}.openui`), "utf8");

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
const text = (testId: string) => host.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
const lever = (label: string) => host.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;
const taskStates = () => [...host.querySelectorAll('[data-testid="guided-tasks"] li')].map((li) => li.getAttribute("data-state"));
/** Each Thing to try's words as the Widget shows them (not its mark or the words a screen reader hears after it). */
const shownTasks = () =>
  [...host.querySelectorAll('[data-testid="guided-tasks"] li')].map((li) => [...li.children].find((el) => !el.hasAttribute("aria-hidden") && !el.classList.contains("sr-only"))?.textContent);
const MOVE_ONE = "Move one lever at a time. Which one moves the value most?";
const keyFigures = () => [...host.querySelectorAll("[data-key-figure]")].map((el) => el.textContent);

async function draw(name: string, { onTicked = () => {}, onSave }: { onTicked?: (done: string[]) => void; onSave?: (story: SavedStory) => void } = {}) {
  await act(async () => {
    root.render(
      <SaveStoryContext.Provider value={onSave ?? null}>
        <SavedTicksContext.Provider value={{ ticked: [], onTicked }}>
          <WidgetView code={fixture(name)} complete />
        </SavedTicksContext.Provider>
      </SaveStoryContext.Provider>,
    );
  });
  await settle();
  expect(host.textContent).not.toContain("could not be drawn");
}

describe("Value bridge (Spine Topic 9)", () => {
  it('opens at "Each share is worth $35" and takes everything from shareholders when debt passes what is left', async () => {
    await draw("value-bridge");
    expect(text("value-bridge-headline")).toBe("Each share is worth $35");
    expect(keyFigures()).toEqual(["$35"]);
    expect(text("value-bridge-numbers")).toContain("Business value$15.2bn");
    setRange(lever("Debt"), 13_000);
    await settle();
    expect(text("value-bridge-headline")).toBe("$0: lenders and option holders take everything");
    expect(taskStates()[0]).toBe("done");
    // The business does not move as the claims do.
    expect(text("value-bridge-numbers")).toContain("Business value$15.2bn");
  });

  it("says each claim in words with its unit, and offers the options' $0 as a chip", async () => {
    await draw("value-bridge");
    expect(lever("Options").getAttribute("aria-valuetext")).toBe("2.9 billion dollars");
    const chip = host.querySelector<HTMLButtonElement>('[role="group"][aria-label="Quick values for Options"] button')!;
    expect(chip.textContent).toBe("$0");
    await act(async () => chip.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(text("value-bridge-headline")).toBe("Each share is worth $44");
  });

  it("keeps each lever's move in the Widget's state, so it is saved, restored and told to the Tutor", async () => {
    const settings: Record<string, number>[] = [];
    await act(async () => root.render(<WidgetView code={fixture("value-bridge")} complete onSettings={(s) => settings.push(s)} />));
    await settle();
    setRange(lever("Debt"), 13_000);
    await settle();
    expect(settings.at(-1)).toEqual({ $cash: 26, $debt: 13_000, $options: 2892 });
    expect(readWidget(fixture("value-bridge"), { values: settings.at(-1)!, ticked: [] }, () => undefined)!.readouts[0]).toBe(`Value: ${text("value-bridge-headline")}`);
  });
});

describe("Terminal seesaw (Spine Topic 8)", () => {
  it("opens in money, saying after year 10 is worth more than the whole value, with both sides of the seesaw in words", async () => {
    await draw("terminal-seesaw");
    expect(text("terminal-seesaw-headline")).toBe("After year 10: $16.9bn, more than all; years 1 to 10 lose $1.8bn");
    expect(keyFigures()).toEqual(["$16.9bn"]);
    expect(host.querySelector('[data-testid="terminal-seesaw-beam"] [role="img"]')?.getAttribute("aria-label")).toBe("Years 1 to 10, a loss: -$1.8bn; After year 10: $16.9bn");
    // Things to try tick in order: half the Case's growth first, then growth within a point of the cost of capital.
    setRange(lever("Growth after year 10"), 3);
    await settle();
    expect(taskStates()).toEqual(["done", "current"]);
    setRange(lever("Growth after year 10"), 7);
    setRange(lever("Cost of capital after year 10"), 8);
    await settle();
    expect(taskStates()).toEqual(["done", "done"]);
    expect(text("terminal-seesaw-headline")).not.toMatch(/NaN|cannot/);
  });
});

describe("Cost of capital stack (Spine Topic 7)", () => {
  it('opens at "The cost of capital is 12.84%", with what a share is worth at that rate', async () => {
    await draw("wacc-stack");
    expect(text("wacc-stack-headline")).toBe("The cost of capital is 12.84%");
    expect(text("wacc-stack-numbers")).toContain("Value a share at this rate$35");
    setRange(lever("Relative risk"), 2);
    await settle();
    expect(text("wacc-stack-headline")).toBe("The cost of capital is 14.42%");
    expect(taskStates()[0]).toBe("done");
  });
});

describe("Cash waterfall (Spine Topic 3)", () => {
  it('opens on Amazon\'s year 1, "Free cash flow next year: -$931.4m", and shows growth costs nothing at 0%', async () => {
    await draw("cash-waterfall");
    expect(text("cash-waterfall-headline")).toBe("Free cash flow next year: -$931.4m");
    setRange(lever("Revenue growth next year"), 0);
    await settle();
    expect(text("cash-waterfall-numbers")).toContain("Reinvestment$0");
    expect(taskStates()[0]).toBe("done");
  });

  it("draws a company's year from the Topic file", async () => {
    await draw("cash-waterfall-company");
    expect(text("cash-waterfall-headline")).toMatch(/^Free cash flow next year: -\$55\d\.\dm$/);
  });

  // Spine critics round 1 on #89: Spine Topic 3's bench names its years, says what it makes up, keeps sales for each
  // dollar invested under More settings, and has Webvan's van in a scene whose line reacts to growth.
  it("draws Spine Topic 3's what-if bench: named years, the what-if line, a reacting scene, one lever under More settings", async () => {
    const company = fixture("cash-waterfall-company")
      .replace("margin: -179.2, salesToCapital: 0.7}", 'margin: 4, salesToCapital: 0.7}, years: {from: "1999", to: "2000"}, whatIf: "A what-if: Webvan really lost money on most sales.", icon: "delivery-truck"')
      .replace("$margin = -179.2", "$margin = 4");
    expect(company).toContain('icon: "delivery-truck"');
    await act(async () => {
      root.render(
        <SavedTicksContext.Provider value={{ ticked: [], onTicked: () => {} }}>
          <WidgetView code={company} complete />
        </SavedTicksContext.Provider>,
      );
    });
    await settle();
    expect(text("cash-waterfall-headline")).toMatch(/^Free cash flow in 2000: /);
    expect(text("cash-waterfall-what-if")).toBe("A what-if: Webvan really lost money on most sales.");
    expect(host.textContent).toContain("1999 sales: $13.3m");
    expect(host.textContent).toContain("13.4 times");
    expect(host.textContent).not.toMatch(/next year|This year/);
    expect(host.querySelector('[data-testid="cash-waterfall-more"] input[aria-label="Sales for each dollar invested"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="cash-waterfall-scene"]')?.getAttribute("data-mood")).toBe("building");
    setRange(lever("Sales growth, 1999 to 2000"), 0);
    await settle();
    expect(host.querySelector('[data-testid="cash-waterfall-scene"]')?.getAttribute("data-mood")).toBe("still");
  });
});

describe("Multiple decoder (Spine Topic 12)", () => {
  it("shows the multiple the settings justify beside WeWork's 26× and IWG's 1.6×", async () => {
    await draw("multiple-decoder");
    expect(text("multiple-decoder-headline")).toMatch(/^Your settings justify \d+(\.\d)?× sales$/);
    expect(text("multiple-decoder-numbers")).toBe("WeWork trades at26×IWG trades at1.6×");
    expect(host.querySelectorAll('[data-testid="multiple-decoder-marks"] [data-mark]')).toHaveLength(3);
  });

  it("draws each company's Icon and its one short fact on its row, and the Learner's own row neither (T33, F6)", async () => {
    await draw("multiple-decoder");
    const rows = [...host.querySelectorAll('[data-testid="multiple-decoder-marks"] [data-mark]')];
    expect(rows.map((row) => [row.querySelector("[data-icon]")?.getAttribute("data-icon"), row.querySelector("[data-note]")?.textContent])).toEqual([
      [undefined, undefined],
      ["office-building", "604,000 desks"],
      ["cityscape", "602,535 desks"],
    ]);
    // The facts are said with the scale, so a Learner on a screen reader hears two near-equal desk piles priced far apart.
    expect(host.querySelector('[data-testid="multiple-decoder-marks"]')?.getAttribute("aria-label")).toMatch(
      /WeWork \(604,000 desks\): 26×; IWG \(602,535 desks\): 1\.6×$/,
    );
  });
});

describe("Value levers in its Spine Topic modes (Appendix D)", () => {
  it("failure: the chance it fails is a main lever, and the readout says what it is worth if it survives", async () => {
    await draw("value-levers-failure");
    const atRest = [...host.querySelectorAll('[data-testid="value-levers-controls"] input[type="range"]')].map((el) => el.getAttribute("aria-label"));
    // The chance it fails is the Topic's idea, so it comes first (Spine critics round 1 on #96).
    expect(atRest).toEqual(["Chance it fails", "Sales in year 10", "Operating margin once mature", "Cost of capital while it grows"]);
    setRange(lever("Chance it fails"), 30);
    await settle();
    expect(text("value-levers-headline")).toBe("This story is worth $22 a share");
    expect(text("value-levers-readout")).toBe("$35 a share");
  });

  it("roic: warns in coral when new capital earns less than it costs", async () => {
    await draw("value-levers-roic");
    expect(text("value-levers-readout")).toBe("19.5%, above the 12.84% it costs");
    setRange(lever("Operating margin once mature"), 4);
    await settle();
    expect(host.querySelector('[data-testid="value-levers-readout"]')?.hasAttribute("data-warn")).toBe(true);
  });

  it("margin_marks: marks rivals' margins on lever 2 and names them", async () => {
    await draw("value-levers-margin-marks");
    expect(host.querySelectorAll('[data-testid="slider-marks"] > span')).toHaveLength(2);
    expect(text("value-levers-readout")).toBe("Barnes & Noble 7.94%, Specialty retail 10%");
  });

  it("market: lever 1 is a share of the market, and the readout gives revenue against the market", async () => {
    await draw("value-levers-market");
    expect(lever("Share of the market in year 10").getAttribute("aria-valuetext")).toBe("1.74 percent");
    expect(text("value-levers-readout")).toBe("$39bn of a $2.2tn market");
  });

  it("two_stories: a story with every lever at its best is flagged, in words", async () => {
    await draw("value-levers-two-stories");
    const wish = host.querySelector<HTMLButtonElement>('[data-story="story2"]')!;
    expect(wish.hasAttribute("data-flagged")).toBe(true);
    await act(async () => wish.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(text("value-levers-flags")).toBe("Flag: Every lever at its best: a wish, not a story");
  });

  it("match_price and range: one readout each, no extra controls", async () => {
    await draw("value-levers-match-price");
    expect(text("value-levers-readout")).toBe("revenue $83bn, or margin 17.5%");
    expect(host.querySelectorAll('[data-testid="value-levers-controls"] input[type="range"]')).toHaveLength(4);
    act(() => root.unmount());
    root = createRoot(host);
    await draw("value-levers-range");
    expect(text("value-levers-readout-note")).toBe("By effect: margin, revenue, reinvestment, risk");
  });

  it("all_open: every lever open, and the story saved through the Topic flow's callback, with no button without one", async () => {
    await draw("value-levers-all-open");
    expect(host.querySelector('[data-testid="value-levers-more"]')?.hasAttribute("open")).toBe(true);
    expect(host.querySelector('[data-testid="value-levers-save"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    const onSave = vi.fn();
    await draw("value-levers-all-open", { onSave });
    await act(async () => host.querySelector('[data-testid="value-levers-save"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].lines).toContain("Worth: $35 a share");
    // The saved note names the company from the chosen Case's chip.
    expect(onSave.mock.calls[0][0].title).toContain("Amazon, Feb 2000");
  });

  it("all_open: a Case chip switches the company, values it and names it in the saved note", async () => {
    const onSave = vi.fn();
    await draw("value-levers-all-open", { onSave });
    const chips = [...host.querySelectorAll("[data-case]")].map((c) => c.textContent);
    expect(chips).toEqual(["Amazon, Feb 2000", "Coffee Day, Oct 2015", "Zomato, Jul 2021"]);
    // Switch to Coffee Day (rupees): the headline value is now in rupees, not dollars.
    await act(async () => host.querySelector('[data-case="1"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(text("value-levers-headline")).toContain("₹");
    await act(async () => host.querySelector('[data-testid="value-levers-save"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSave.mock.calls.at(-1)![0].title).toContain("Coffee Day, Oct 2015");
  });

  it("all_open: the Tutor is told about the Case the Learner picked, not the one compiled in", () => {
    const code = fixture("value-levers-all-open");
    const amazon = readWidget(code, undefined, () => undefined)!;
    expect(amazon.readouts.join(" ")).toContain("$");
    expect(amazon.tasks.map((t) => t.text)).toEqual([MOVE_ONE, "Find a story worth the $84 price"]);
    const zomato = readWidget(code, { values: { $case: 2 }, ticked: [] }, () => undefined)!;
    expect(zomato.readouts.join(" ")).toContain("₹");
    expect(zomato.readouts.join(" ")).not.toContain("$84");
    // Its Guided Tasks too, as the Widget words them on Zomato (review F4), so ticks saved from the screen match them.
    expect(zomato.tasks.map((t) => t.text)).toEqual([MOVE_ONE, "Find a story worth the ₹76 price"]);
    const onScreen = [MOVE_ONE, "Find a story worth the ₹76 price"];
    expect(readWidget(code, { values: { $case: 2 }, ticked: onScreen }, () => undefined)!.tasks.every((t) => t.ticked)).toBe(true);
    expect(allTasksTicked(code, onScreen, { $case: 2 })).toBe(true);
    expect(allTasksTicked(code, onScreen)).toBe(false);
  });

  it("all_open: a story worth the price found on one Case does not tick the price task of the Case the chip switches to", async () => {
    const onTicked = vi.fn();
    await draw("value-levers-all-open", { onTicked });
    setRange(lever("Sales in year 10"), 60);
    await settle();
    setRange(lever("Operating margin once mature"), 12.5);
    await settle();
    expect(text("value-levers-headline")).toBe("This story is worth $84 a share");
    expect(taskStates()).toEqual(["done", "done"]);
    await act(async () => host.querySelector('[data-case="2"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    // One lever at a time is the same task on every Case, so it stays ticked; Zomato's own price is still to be found.
    expect(shownTasks()).toEqual([MOVE_ONE, "Find a story worth the ₹76 price"]);
    expect(taskStates()).toEqual(["done", "current"]);
    expect(onTicked.mock.calls.flat(2)).not.toContain("Find a story worth the ₹76 price");
    // Back on Amazon, the $84 story found there is still ticked.
    await act(async () => host.querySelector('[data-case="0"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(taskStates()).toEqual(["done", "done"]);
  });

  it("all_open: another company starts afresh: Save is offered again, and its first move is measured from its own value", async () => {
    const onSave = vi.fn(async () => true);
    const settings: Record<string, number>[] = [];
    await act(async () => {
      root.render(
        <SaveStoryContext.Provider value={onSave}>
          <WidgetView code={fixture("value-levers-all-open")} complete onSettings={(s) => settings.push(s)} />
        </SaveStoryContext.Provider>,
      );
    });
    await settle();
    const save = () => host.querySelector<HTMLButtonElement>('[data-testid="value-levers-save"]')!;
    setRange(lever("Sales in year 10"), 60);
    await settle();
    await act(async () => save().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(save().disabled).toBe(true);
    await act(async () => host.querySelector('[data-case="2"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    // Zomato's story is not saved yet, so its Save is offered again.
    expect(save().disabled).toBe(false);
    expect(host.textContent).not.toContain("Saved to your Notebook");
    // The same lever moved on Zomato is a new move, from Zomato's own value, not from Amazon's $35 before the switch.
    setRange(lever("Sales in year 10"), 20_000);
    await settle();
    const zomato = valuationCase("zomato-ipo-2021")!;
    const mode = { kind: "all_open" } as const;
    const specs = leverSpecs(zomato, mode);
    const opening = openingSettings(specs);
    const by = valueLeversModel(zomato, specs, { ...opening, revenue: 20_000 }, mode).value! - valueLeversModel(zomato, specs, opening, mode).value!;
    expect(settings.at(-1)).toMatchObject({ $case: 2, $revenue: 20_000, $moved: 1, $mostLever: 1 });
    expect(settings.at(-1)!.$mostBy).toBeCloseTo(Math.abs(by), 6);
  });

  it("all_open: the Case chip and each lever's move reach the Widget's state, so what is saved and told is what is on screen", async () => {
    const code = fixture("value-levers-all-open");
    const settings: Record<string, number>[] = [];
    await act(async () => {
      root.render(
        <SavedTicksContext.Provider value={{ ticked: [], onTicked: () => {} }}>
          <WidgetView code={code} complete onSettings={(s) => settings.push(s)} />
        </SavedTicksContext.Provider>,
      );
    });
    await settle();
    await act(async () => host.querySelector('[data-case="2"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    // Zomato's own story, in crore, and the chip on Zomato: the page saves and sends these settings.
    const zomato = settings.at(-1)!;
    expect(zomato).toMatchObject({ $case: 2, $moved: 0 });
    expect(lever("Sales in year 10").value).toBe(String(zomato.$revenue));
    setRange(lever("Operating margin once mature"), 40);
    await settle();
    expect(settings.at(-1)).toMatchObject({ $case: 2, $margin: 40, $moved: 2 });
    const told = readWidget(code, { values: settings.at(-1)!, ticked: [] }, () => undefined)!;
    expect(told.readouts[0]).toBe(`Value: ${text("value-levers-headline").replace(/^This story is worth /, "")}`);
    expect(told.tasks.map((t) => t.text)).toEqual(shownTasks());
    expect(shownTasks()).toEqual([MOVE_ONE, "Find a story worth the ₹76 price"]);
  });

  it("range: the headline is the range, the bar shades it, and the price sits against it", async () => {
    await draw("value-levers-range");
    expect(text("value-levers-headline")).toMatch(/^A range of values: /);
    expect(host.querySelector('[data-testid="value-levers-band"]')).not.toBeNull();
    // The $84 price sits above the range of a story worth about $35.
    expect(host.querySelector('[data-testid="value-levers-bar"]')?.getAttribute("data-price-place")).toBe("above");
  });
});

describe("what the Tutor is told of each Workbench (readWidget)", () => {
  it("lists every lever at its setting and the engine's readouts, from the fixture as saved", () => {
    const read = (name: string, values?: Record<string, number>) => readWidget(fixture(name), values ? { values, ticked: [] } : undefined, () => undefined)!;
    expect(read("value-bridge").readouts[0]).toBe("Value: $35 a share");
    expect(read("value-bridge", { $options: 0 }).readouts[0]).toBe("Value: $44 a share");
    expect(read("terminal-seesaw").readouts[0]).toBe("Share of the value from after year 10: 112%");
    expect(read("wacc-stack").readouts[0]).toBe("Cost of capital: 12.84%");
    expect(read("cash-waterfall").readouts.at(-1)).toBe("Free cash flow: -$931.4m");
    expect(read("multiple-decoder").readouts[1]).toMatch(/^WeWork trades at 26× revenue \(sourced: /);
    expect(read("value-levers-failure", { $failure: 30 }).readouts).toContain("If it survives: $35 a share");
    expect(read("value-levers-market").sliders[0]).toEqual({ label: "Share of the market in year 10 (how big it gets)", text: "1.74%" });
    expect(read("wacc-stack").tasks.map((t) => t.text)).toEqual(["Raise relative risk to 2.0. Does the rate move a lot or a little?", "Set the share of debt to 30%"]);
  });
});

describe("Market readings beside the levers (ticket #105)", () => {
  const readings = () =>
    [...host.querySelectorAll('[data-testid="market-reading"]')].map((li) => ({
      id: li.getAttribute("data-reading"),
      date: li.querySelector('[data-testid="reading-date"]')?.textContent,
      credit: li.querySelector('[data-testid="reading-credit"]')?.textContent,
      href: li.querySelector('[data-testid="reading-credit"]')?.getAttribute("href"),
    }));

  // Owner decision on #105 (2026-11-16): a Workbench on Amazon (As-of 3 February 2000) shows only US readings known by then.
  it("the Cost of capital stack on Amazon shows the US bond rate of Dec 1999, credited and linked", async () => {
    await draw("wacc-stack-readings");
    expect(readings()).toEqual([{ id: "us-risk-free-10y-1999", date: "(Dec 1999)", credit: "Aswath Damodaran, NYU Stern", href: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/histimpl.xls" }]);
    expect(text("market-readings")).toContain("10-year US Treasury bond rate (US): 6.44%");
    // The source's name is visible text, not only a hover title (review F42).
    expect(host.querySelector('[data-testid="reading-source"]')?.textContent).toBe("Damodaran, Historical Implied Equity Risk Premiums (histimpl.xls)");
    expect(text("market-readings")).not.toMatch(/today|current/i);
  });

  it("Value levers on Amazon shows the same US reading of Dec 1999 beside its levers", async () => {
    await draw("value-levers-readings");
    expect(readings().map((r) => [r.id, r.date])).toEqual([["us-risk-free-10y-1999", "(Dec 1999)"]]);
  });

  it("keeps the As-of rule on screen: a reading from after the Case's As-of date, or from another market, does not show", () => {
    const amazon = { asOf: "2000-02-03", market: "US" } as const;
    const shown = (ids: string[]) =>
      [...new DOMParser().parseFromString(renderToStaticMarkup(<MarketReadingsView ids={ids} known={amazon} />), "text/html").querySelectorAll('[data-testid="market-reading"]')].map((li) => li.getAttribute("data-reading"));
    expect(shown(["us-risk-free-10y-1999", "us-implied-premium-2007", "in-food-margin"])).toEqual(["us-risk-free-10y-1999"]);
    expect(renderToStaticMarkup(<MarketReadingsView ids={["in-food-margin"]} known={amazon} />)).toBe("");
  });

  it("a Workbench with no readings shows none", async () => {
    await draw("wacc-stack");
    expect(host.querySelector('[data-testid="market-readings"]')).toBeNull();
  });
});
