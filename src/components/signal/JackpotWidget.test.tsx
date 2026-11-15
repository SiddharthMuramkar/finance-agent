// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JackpotWidget } from "./JackpotWidget";
import { allByRole, cleanup, click, getByRole, reduceMotion, render, setRange, textOf } from "./test-dom";

// The jackpot widget (spec §6.3) as a learner meets it: QA rows 1 to 4 and the §6.3.4 acceptance values. Reduced motion
// is on unless a test drives the scripted run frame by frame.

beforeEach(reduceMotion);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const widget = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-widget="jackpot"]')!;
const verdict = (container: HTMLElement) => textOf(container.querySelector(".sig-verdict"));
/** A meter row as "label and pill | value". */
const row = (container: HTMLElement, name: "payments" | "cash") => {
  const el = container.querySelector(`[data-row="${name}"]`)!;
  return `${textOf(el.querySelector(".sig-meter-top span"))} | ${textOf(el.querySelector("output"))}`;
};
const deeper = (container: HTMLElement) => textOf(container.querySelector(".sig-l2"));

describe("the jackpot widget renders", () => {
  it("1: draws the idle card: rate 0, controls locked, the billboard verdict, no pills", () => {
    const { container } = render(<JackpotWidget />);
    const w = widget(container);
    expect(w.dataset.case).toBe("mega-millions-2018");
    expect(textOf(w)).toContain("Oct 2018");
    expect(w.querySelector("h3")?.textContent).toBe("Is a $1.537B jackpot really worth $1.537B?");
    expect(textOf(w)).toContain("30 yearly payments that add up to $1.537B, or $877.8M in cash that day.");
    expect(allByRole(w, "button").slice(0, 3).map((b) => textOf(b))).toEqual(["The 30 payments", "The cash", "About the same"]);
    expect(w.querySelectorAll("[data-year]")).toHaveLength(30);
    expect(textOf(w.querySelector(".sig-range-top output"))).toBe("0.00%");
    expect(getByRole(w, "slider", "Interest rate")).toHaveProperty("disabled", true);
    expect(getByRole(w, "button", "5%")).toHaveProperty("disabled", true);
    expect(textOf(w)).toContain("Make your call to unlock the rate.");
    expect(verdict(w)).toBe("Added up as advertised, the 30 payments come to $1.537B. That is the number on the billboard.");
    expect(row(w, "payments")).toBe("30 payments, worth today | $1.537B");
    expect(row(w, "cash")).toBe("Cash today | $877.8M");
    expect(w.querySelectorAll(".sig-meter .sig-pill")).toHaveLength(0);
    expect(deeper(w)).toContain("Opens after your call.");
    expect(textOf(w)).not.toContain("Show the numbers");
    expect(textOf(w)).toContain("Source: CNBC, 24 Oct 2018.");
  });

  it("drops the head in compact mode and renders nothing for another Case", () => {
    expect(widget(render(<JackpotWidget compact />).container).querySelector("h3")).toBeNull();
    expect(render(<JackpotWidget caseSlug="rates-up-1" />).container.innerHTML).toBe("");
  });
});

describe("call before reveal", () => {
  it("2: tapping The cash is right, runs the rate to 5.00% and shows $694.0M, Worth more on Cash today, $183.8M away", () => {
    const onCall = vi.fn();
    const onEvent = vi.fn();
    const { container } = render(<JackpotWidget onCall={onCall} onEvent={onEvent} />);
    click(getByRole(container, "button", "The cash"));
    expect(getByRole(container, "button", "The cash").className).toContain("is-right");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Right At an ordinary 5% a year/);
    expect(textOf(container.querySelector(".sig-range-top output"))).toBe("5.00%");
    expect(row(container, "payments")).toBe("30 payments, worth today | $694.0M");
    expect(row(container, "cash")).toBe("Cash today Worth more | $877.8M");
    expect(verdict(container)).toBe("At 5.00%, the payments are worth $183.8M less than the cash.");
    expect(deeper(container)).toContain("Find the rate where the two are worth the same.");
    expect(deeper(container)).toContain("You are $183.8M away. Try a lower rate.");
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ id: "cash", verdict: "right" }));
    expect(onEvent.mock.calls.map(([e]) => e.type)).toEqual(["call", "layer2_open"]);
  });

  it("uses the Close pill for About the same", () => {
    const { container } = render(<JackpotWidget />);
    click(getByRole(container, "button", "About the same"));
    expect(getByRole(container, "button", "About the same").className).toContain("is-careful");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Close They match only at about 3\.4% a year/);
  });

  it("3: a scripted run through 3.4% does not find the break-even", () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(performance, "now").mockReturnValue(0);
    const onEvent = vi.fn();
    const { container } = render(<JackpotWidget onEvent={onEvent} />);
    click(getByRole(container, "button", "The 30 payments"));
    const seen = new Set<string>();
    for (let t = 1; t <= 900 && frames.length; t++) {
      const frame = frames.shift()!;
      act(() => frame(t));
      seen.add(textOf(container.querySelector(".sig-range-top output")));
      expect(container.querySelector("[data-found]")).toBeNull();
    }
    expect(seen.has("3.40%") || seen.has("3.35%")).toBe(true);
    expect(textOf(container.querySelector(".sig-range-top output"))).toBe("5.00%");
    expect(onEvent.mock.calls.some(([e]) => e.type === "milestone")).toBe(false);
  });
});

describe("key numbers after the call", () => {
  const called = () => {
    const r = render(<JackpotWidget />);
    click(getByRole(r.container, "button", "The 30 payments"));
    return r.container;
  };

  it("4: a hand-set 3.40% is $874.8M, Same on both rows, and Break-even found, which stays", () => {
    const onEvent = vi.fn();
    const { container } = render(<JackpotWidget onEvent={onEvent} />);
    click(getByRole(container, "button", "The cash"));
    setRange(getByRole(container, "slider", "Interest rate"), 3.4);
    expect(row(container, "payments")).toBe("30 payments, worth today Same | $874.8M");
    expect(row(container, "cash")).toBe("Cash today Same | $877.8M");
    expect(verdict(container)).toBe("At 3.40%, the payments and the cash are worth about the same today.");
    expect(deeper(container)).toContain("Break-even found At about 3.4% a year the two are worth the same.");
    expect(onEvent).toHaveBeenCalledWith({ type: "milestone", id: "break_even_found" });
    setRange(getByRole(container, "slider", "Interest rate"), 8);
    expect(container.querySelector("[data-found]")).not.toBeNull();
  });

  it.each([
    [0, "$1.537B"],
    [1, "$1.289B"],
    [2, "$1.090B"],
    [3, "$930.0M"],
    [3.35, "$881.4M"],
    [3.45, "$868.2M"],
    [4, "$800.1M"],
    [7.5, "$503.7M"],
    [10, "$382.9M"],
  ])("at %f%% the payments are worth %s today", (rate, worth) => {
    const container = called();
    setRange(getByRole(container, "slider", "Interest rate"), rate);
    expect(textOf(container.querySelector('[data-row="payments"] output'))).toBe(worth);
  });

  it("puts Worth more on the payments below the break-even, with a higher-rate hint", () => {
    const container = called();
    click(getByRole(container, "button", /^0%$/));
    expect(row(container, "payments")).toBe("30 payments, worth today Worth more | $1.537B");
    expect(verdict(container)).toBe("At 0.00%, the payments are worth $659.2M more than the cash.");
    expect(deeper(container)).toContain("Try a higher rate.");
  });

  it("lists the 30 payments at 5% in the table view", () => {
    const container = called();
    const rows = container.querySelectorAll(".sig-table tbody tr");
    expect(rows).toHaveLength(30);
    expect([...rows[0].querySelectorAll("td")].map((td) => textOf(td))).toEqual(["2018", "$23.1M", "$23.1M"]);
    expect(textOf(rows[29].querySelector("td"))).toBe("2047");
  });
});
