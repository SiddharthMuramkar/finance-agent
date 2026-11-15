// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RatesWidget, rulerTicks } from "./RatesWidget";
import { allByRole, cleanup, click, getByRole, reduceMotion, render, setRange, textOf } from "./test-dom";

// The rates widget (spec §6.5) as a learner meets it: call first, then the three sizes of the move. The numbers are the
// §6.5.3 acceptance table and QA rows 15 to 17.

beforeEach(reduceMotion);
afterEach(cleanup);

const widget = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-widget="rates"]')!;
const ticks = (container: HTMLElement) => container.querySelectorAll("[data-tick]").length;
const rulerValues = (container: HTMLElement) => [...container.querySelectorAll("[data-ruler-value]")].map((el) => textOf(el));

describe("the rates widget renders", () => {
  it("draws the full card: head, title, sub, call, chart, locked slider, locked Go deeper and the foot", () => {
    const { container } = render(<RatesWidget />);
    const w = widget(container);
    expect(w.dataset.case).toBe("rates-up-1");
    expect(textOf(w)).toContain("Live widget");
    expect(textOf(w)).toContain("The news");
    expect(w.querySelector("h3")?.textContent).toBe("One move, three sizes");
    expect(textOf(w)).toContain("A rate goes from 4% to 5%.");
    expect(allByRole(w, "button").map((b) => textOf(b))).toEqual(["Up 1%", "Up 1 percentage point", "Up 25%"]);
    expect(getByRole(w, "img", "Rate line").getAttribute("aria-label")).toContain("Old rate 4.00%, new rate 5.00%");
    expect(textOf(w)).toContain("Worked example from the Topic. No outside figures.");
  });

  it("drops head, title, sub and the table view in compact mode", () => {
    const { container } = render(<RatesWidget compact />);
    const w = widget(container);
    expect(w.querySelector("h3")).toBeNull();
    expect(textOf(w)).not.toContain("Live widget");
    expect(w.dataset.compact).toBe("true");
  });

  it("renders nothing for a Case it does not know", () => {
    const { container } = render(<RatesWidget caseSlug="amazon-2000" />);
    expect(container.innerHTML).toBe("");
    const own = render(<RatesWidget caseSlug="rates-up-1" />);
    expect(widget(own.container)).not.toBeNull();
  });
});

describe("call before reveal", () => {
  it("shows no ruler ticks, no sizes and no trap before the call", () => {
    const { container } = render(<RatesWidget />);
    expect(ticks(container)).toBe(0);
    expect(rulerValues(container)).toEqual(["?", "?", "?"]);
    expect(container.querySelector("[data-trap]")).toBeNull();
    expect(textOf(container)).not.toContain("+100 bp");
    expect(textOf(container)).not.toContain("up 25%");
    expect(getByRole(container, "img", "Rate line").getAttribute("aria-label")).toContain("show after your call");
    expect(getByRole(container, "slider", "New rate")).toHaveProperty("disabled", true);
    expect(textOf(container)).toContain("Tap an answer to unlock the rate.");
    expect(container.querySelector('[data-open="false"]')).not.toBeNull();
    expect(textOf(container)).not.toContain("Show the numbers");
  });

  it("15: tapping Up 1% marks it careful, unlocks the slider, opens Go deeper and fires onCall once", () => {
    const onCall = vi.fn();
    const onEvent = vi.fn();
    const { container } = render(<RatesWidget onCall={onCall} onEvent={onEvent} />);
    click(getByRole(container, "button", "Up 1%"));
    const chip = getByRole(container, "button", "Up 1%");
    expect(chip.className).toContain("is-careful");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Careful 1% of 4% is only 0\.04 points/);
    expect(getByRole(container, "slider", "New rate")).toHaveProperty("disabled", false);
    expect(textOf(container)).not.toContain("Tap an answer to unlock the rate.");
    expect(textOf(container.querySelector('[data-open="true"]'))).toContain("Change where the rate starts.");
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith({ id: "literal", label: "Up 1%", verdict: "careful", feedback: expect.stringContaining("0.04 points") });
    expect(onEvent.mock.calls.map(([e]) => e.type)).toEqual(["call", "layer2_open"]);

    click(getByRole(container, "button", "Up 25%"));
    expect(onCall).toHaveBeenCalledTimes(1);
    // Multi-select: both tapped chips stay marked.
    expect(getByRole(container, "button", "Up 1%").className).toContain("is-careful");
    expect(getByRole(container, "button", "Up 25%").className).toContain("is-right");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Right 1 point is a quarter of the old 4%/);
  });
});

describe("key numbers after the call", () => {
  const called = () => {
    const r = render(<RatesWidget />);
    click(getByRole(r.container, "button", "Up 1 percentage point"));
    return r.container;
  };
  const facts = (container: HTMLElement) => [...container.querySelectorAll(".sig-facts dd")].map((dd) => textOf(dd));

  it("4 to 5: up 1 point, +100 bp, up 25%, and the literal 0.04 points to 4.04%", () => {
    const container = called();
    expect(facts(container)).toEqual(["up 1 point", "+100 bp", "up 25%"]);
    expect(rulerValues(container)).toEqual(["1 point", "100 bp", "25%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toBe("Careful Read literally, “up 1%” is 1% of the old 4%: a move of only 0.04 points, to 4.04%.");
    expect(textOf(container.querySelector("[data-trap]"))).toContain("0.04 pt");
    // Ticks: 2 for a 1-point ruler, 11 for 100 bp at 10 to a tick, 6 for 25% at 5% to a tick.
    expect(ticks(container)).toBe(2 + 11 + 6);
    expect(textOf(container)).toContain("Show the numbers");
  });

  it("16: the new rate at 4.50% is 0.5 points, +50 bp, up 12.5%, literal 0.02 points to 4.02%", () => {
    const container = called();
    setRange(getByRole(container, "slider", "New rate"), 4.5);
    expect(facts(container)).toEqual(["up 0.5 points", "+50 bp", "up 12.5%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toContain("a move of only 0.02 points, to 4.02%.");
  });

  it("a fall to 3.5% is down 0.5 points, −50 bp, down 12.5%, literal to 3.98%", () => {
    const container = called();
    setRange(getByRole(container, "slider", "New rate"), 3.5);
    expect(facts(container)).toEqual(["down 0.5 points", "−50 bp", "down 12.5%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toContain("“down 0.5%” is 0.5% of the old 4%: a move of only 0.02 points, to 3.98%.");
  });

  it("17: the old rate at 2% and the new at 3% is up 1 point, +100 bp, up 50%", () => {
    const container = called();
    setRange(getByRole(container, "slider", "Old rate"), 2);
    setRange(getByRole(container, "slider", "New rate"), 3);
    expect(facts(container)).toEqual(["up 1 point", "+100 bp", "up 50%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toContain("0.02 points, to 2.02%.");
  });

  it("no move: No move, 0 bp, 0%, no trap and no ticks", () => {
    const container = called();
    setRange(getByRole(container, "slider", "New rate"), 4);
    expect(facts(container)).toEqual(["No move", "0 bp", "0%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toBe("");
    expect(ticks(container)).toBe(0);
  });

  it("snaps the slider to its 0.05 grid", () => {
    const container = called();
    setRange(getByRole(container, "slider", "New rate"), 4.57);
    expect(textOf(container.querySelector(".sig-range-top output"))).toBe("4.55%");
  });
});

describe("rulerTicks", () => {
  it("counts from the old rate outward and ends on the new rate", () => {
    expect(rulerTicks(4, 1, 1)).toEqual([4, 5]);
    expect(rulerTicks(4, -0.5, 1)).toEqual([4, 3.5]);
    const fifths = rulerTicks(4, 1, 0.2)!;
    expect(fifths).toHaveLength(6);
    [4, 4.2, 4.4, 4.6, 4.8, 5].forEach((t, i) => expect(fifths[i]).toBeCloseTo(t, 10));
    expect(rulerTicks(4, 1, 0.3)!.at(-1)).toBe(5);
  });

  it("draws no ticks for no move or more than 60", () => {
    expect(rulerTicks(4, 0, 1)).toBeNull();
    expect(rulerTicks(1, 7, 0.1)).toBeNull();
  });
});
