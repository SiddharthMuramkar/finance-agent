// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RatesWidget, rulerTicks } from "./RatesWidget";
import { allByRole, cleanup, click, getByRole, reduceMotion, render, setRange, textOf } from "./test-dom";

// The rates widget (spec §6.5) as a learner meets it: call first, then the three sizes of the move. The numbers are the
// §6.5.3 acceptance table and QA rows 15 to 17, on
// the RBI's repo-rate cut of 6 June 2025, from 6% to 5.5%.

beforeEach(reduceMotion);
afterEach(cleanup);

const widget = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-widget="rates"]')!;
const ticks = (container: HTMLElement) => container.querySelectorAll("[data-tick]").length;
const rulerValues = (container: HTMLElement) => [...container.querySelectorAll("[data-ruler-value]")].map((el) => textOf(el));

describe("the rates widget renders", () => {
  it("draws the full card: head, title, sub, call, chart, locked slider, locked Go deeper and the foot", () => {
    const { container } = render(<RatesWidget />);
    const w = widget(container);
    expect(w.dataset.case).toBe("rbi-repo-cut-2025");
    expect(textOf(w)).toContain("Live widget");
    expect(textOf(w)).toContain("Jun 2025");
    expect(w.querySelector("h3")?.textContent).toBe("One move, three sizes");
    expect(textOf(w)).toContain("On 6 June 2025 the RBI cut its repo rate from 6% to 5.5%.");
    expect(allByRole(w, "button").map((b) => textOf(b))).toEqual(["Down 0.5%", "Down 0.5 percentage points", "Down about 8%"]);
    expect(getByRole(w, "img", "Rate line").getAttribute("aria-label")).toContain("Old rate 6.00%, new rate 5.50%");
    expect(textOf(w)).toContain("Source: Reserve Bank of India, Monetary Policy Statement, 6 June 2025.");
  });

  it("drops head, title, sub and the table view in compact mode", () => {
    const { container } = render(<RatesWidget compact />);
    const w = widget(container);
    expect(w.querySelector("h3")).toBeNull();
    expect(textOf(w)).not.toContain("Live widget");
    expect(w.dataset.compact).toBe("true");
  });

  // #26 asks for the New York Fed's reference-rate notice wherever SOFR or EFFR data is shown or explained. This widget
  // draws only the RBI's repo rate, so its foot credits the RBI and carries no NY Fed notice; a widget that one day draws
  // SOFR or EFFR must add NYFED_REFERENCE_RATE_NOTICE (src/library/credits.ts).
  it("credits the RBI and carries no New York Fed reference-rate notice", () => {
    const { container } = render(<RatesWidget />);
    const foot = textOf(widget(container).querySelector(".sig-src"));
    expect(foot).toBe("Source: Reserve Bank of India, Monetary Policy Statement, 6 June 2025.");
    expect(textOf(widget(container))).not.toMatch(/SOFR|EFFR|New York Fed|newyorkfed/);
  });

  it("renders nothing for a Case it does not know", () => {
    const { container } = render(<RatesWidget caseSlug="amazon-2000" />);
    expect(container.innerHTML).toBe("");
    const own = render(<RatesWidget caseSlug="rbi-repo-cut-2025" />);
    expect(widget(own.container)).not.toBeNull();
  });
});

describe("call before reveal", () => {
  it("shows no ruler ticks, no sizes and no trap before the call", () => {
    const { container } = render(<RatesWidget />);
    expect(ticks(container)).toBe(0);
    expect(rulerValues(container)).toEqual(["?", "?", "?"]);
    expect(container.querySelector("[data-trap]")).toBeNull();
    expect(textOf(container)).not.toContain("−50 bp");
    expect(textOf(container)).not.toContain("down 8.33%");
    expect(getByRole(container, "img", "Rate line").getAttribute("aria-label")).toContain("show after your call");
    expect(getByRole(container, "slider", "New rate")).toHaveProperty("disabled", true);
    expect(textOf(container)).toContain("Tap an answer to unlock the rate.");
    expect(container.querySelector('[data-open="false"]')).not.toBeNull();
    expect(textOf(container)).not.toContain("Show the numbers");
  });

  it("15: tapping Down 0.5% marks it careful, unlocks the slider, opens Go deeper and fires onCall once", () => {
    const onCall = vi.fn();
    const onEvent = vi.fn();
    const { container } = render(<RatesWidget onCall={onCall} onEvent={onEvent} />);
    click(getByRole(container, "button", "Down 0.5%"));
    const chip = getByRole(container, "button", "Down 0.5%");
    expect(chip.className).toContain("is-careful");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Careful 0\.5% of 6% is only 0\.03 points/);
    expect(getByRole(container, "slider", "New rate")).toHaveProperty("disabled", false);
    expect(textOf(container)).not.toContain("Tap an answer to unlock the rate.");
    expect(textOf(container.querySelector('[data-open="true"]'))).toContain("Change where the rate starts.");
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith({ id: "literal", label: "Down 0.5%", verdict: "careful", feedback: expect.stringContaining("0.03 points") });
    expect(onEvent.mock.calls.map(([e]) => e.type)).toEqual(["call", "layer2_open"]);

    click(getByRole(container, "button", "Down about 8%"));
    expect(onCall).toHaveBeenCalledTimes(1);
    // Multi-select: both tapped chips stay marked.
    expect(getByRole(container, "button", "Down 0.5%").className).toContain("is-careful");
    expect(getByRole(container, "button", "Down about 8%").className).toContain("is-right");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Right Half a point is a twelfth of the old 6%/);
  });
});

describe("key numbers after the call", () => {
  const called = () => {
    const r = render(<RatesWidget />);
    click(getByRole(r.container, "button", "Down 0.5 percentage points"));
    return r.container;
  };
  const facts = (container: HTMLElement) => [...container.querySelectorAll(".sig-facts dd")].map((dd) => textOf(dd));

  it("6 to 5.5: down 0.5 points, −50 bp, down 8.33%, and the literal 0.03 points to 5.97%", () => {
    const container = called();
    expect(facts(container)).toEqual(["down 0.5 points", "−50 bp", "down 8.33%"]);
    expect(rulerValues(container)).toEqual(["0.5 points", "50 bp", "8.33%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toBe("Careful Read literally, “down 0.5%” is 0.5% of the old 6%: a move of only 0.03 points, to 5.97%.");
    expect(textOf(container.querySelector("[data-trap]"))).toContain("0.03 pt");
    // Ticks: 2 for the points ruler, 6 for 50 bp at 10 to a tick, 3 for 8.33% at 5% to a tick (0.3 points each).
    expect(ticks(container)).toBe(2 + 6 + 3);
    expect(textOf(widget(container).querySelector(".sig-foot"))).toContain("“Down 0.5%”, read literally");
    expect(textOf(container)).toContain("Show the numbers");
  });

  it("16: the new rate at 4.50% is down 1.5 points, −150 bp, down 25%, literal 0.09 points to 5.91%", () => {
    const container = called();
    setRange(getByRole(container, "slider", "New rate"), 4.5);
    expect(facts(container)).toEqual(["down 1.5 points", "−150 bp", "down 25%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toContain("“down 1.5%” is 1.5% of the old 6%: a move of only 0.09 points, to 5.91%.");
  });

  it("a rise to 6.5% is up 0.5 points, +50 bp, up 8.33%, literal to 6.03%", () => {
    const container = called();
    setRange(getByRole(container, "slider", "New rate"), 6.5);
    expect(facts(container)).toEqual(["up 0.5 points", "+50 bp", "up 8.33%"]);
    expect(textOf(container.querySelector(".sig-verdict"))).toContain("“up 0.5%” is 0.5% of the old 6%: a move of only 0.03 points, to 6.03%.");
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
    setRange(getByRole(container, "slider", "New rate"), 6);
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
