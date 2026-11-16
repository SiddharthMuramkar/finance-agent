// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JackpotWidget } from "./JackpotWidget";
import { allByRole, cleanup, click, getByRole, reduceMotion, render, setRange, textOf } from "./test-dom";

// The jackpot widget (spec §6.3) as a learner meets it: QA rows 1 to 4 and the §6.3.4 acceptance values, on
// the Kerala Thiruvonam Bumper of 9 October 2024. Reduced motion
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
  it("1: draws the idle card: rate 0, controls locked, the prize verdict, no pills", () => {
    const { container } = render(<JackpotWidget />);
    const w = widget(container);
    expect(w.dataset.case).toBe("kerala-bumper-2024");
    expect(textOf(w)).toContain("Oct 2024");
    expect(w.querySelector("h3")?.textContent).toBe("Is ₹25 crore over 30 years worth ₹25 crore?");
    expect(textOf(w)).toContain("Kerala paid its 2024 Thiruvonam Bumper prize of ₹25 crore at once.");
    expect(allByRole(w, "button").slice(0, 3).map((b) => textOf(b))).toEqual(["The 30 payments", "The cash", "About the same"]);
    expect(w.querySelectorAll("[data-year]")).toHaveLength(30);
    expect(textOf(w.querySelector(".sig-range-top output"))).toBe("0.00%");
    expect(getByRole(w, "slider", "Interest rate")).toHaveProperty("disabled", true);
    expect(getByRole(w, "button", "5%")).toHaveProperty("disabled", true);
    expect(textOf(w)).toContain("Make your call to unlock the rate.");
    expect(verdict(w)).toBe("Added up as paid, the 30 payments come to ₹25 crore, the same as the prize paid at once.");
    expect(row(w, "payments")).toBe("30 payments, worth today | ₹25 crore");
    expect(row(w, "cash")).toBe("Cash today | ₹25 crore");
    expect(w.querySelectorAll(".sig-meter .sig-pill")).toHaveLength(0);
    expect(deeper(w)).toContain("Opens after your call.");
    expect(textOf(w)).not.toContain("Show the numbers");
    expect(textOf(w)).toContain("Source: The Hindu, 9 Oct 2024.");
  });

  it("drops the head in compact mode and renders nothing for another Example", () => {
    expect(widget(render(<JackpotWidget compact />).container).querySelector("h3")).toBeNull();
    expect(render(<JackpotWidget caseSlug="rbi-repo-cut-2025" />).container.innerHTML).toBe("");
  });
});

describe("call before reveal", () => {
  it("2: tapping The cash is right, runs the rate to 5.00% and shows ₹11.29 crore, Worth more on Cash today, ₹13.71 crore away", () => {
    const onCall = vi.fn();
    const onEvent = vi.fn();
    const { container } = render(<JackpotWidget onCall={onCall} onEvent={onEvent} />);
    click(getByRole(container, "button", "The cash"));
    expect(getByRole(container, "button", "The cash").className).toContain("is-right");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Right At an ordinary 5% a year/);
    expect(textOf(container.querySelector(".sig-range-top output"))).toBe("5.00%");
    expect(row(container, "payments")).toBe("30 payments, worth today | ₹11.29 crore");
    expect(row(container, "cash")).toBe("Cash today Worth more | ₹25 crore");
    expect(verdict(container)).toBe("At 5.00%, the payments are worth ₹13.71 crore less than the cash.");
    expect(deeper(container)).toContain("Find the rate where the two are worth the same.");
    expect(deeper(container)).toContain("You are ₹13.71 crore away. Try a lower rate.");
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ id: "cash", verdict: "right" }));
    expect(onEvent.mock.calls.map(([e]) => e.type)).toEqual(["call", "layer2_open"]);
  });

  it("uses the Close pill for About the same", () => {
    const { container } = render(<JackpotWidget />);
    click(getByRole(container, "button", "About the same"));
    expect(getByRole(container, "button", "About the same").className).toContain("is-careful");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Close They match only at 0%/);
  });

  it("3: the scripted run from the same-valued 0% does not find the break-even", () => {
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
    expect(seen.size).toBeGreaterThan(2);
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

  it("4: a hand-set 0% is ₹25 crore, Same on both rows, and Break-even found, which stays", () => {
    const onEvent = vi.fn();
    const { container } = render(<JackpotWidget onEvent={onEvent} />);
    click(getByRole(container, "button", "The cash"));
    click(getByRole(container, "button", /^0%$/));
    expect(row(container, "payments")).toBe("30 payments, worth today Same | ₹25 crore");
    expect(row(container, "cash")).toBe("Cash today Same | ₹25 crore");
    expect(verdict(container)).toBe("At 0.00%, the payments and the cash are worth about the same today.");
    expect(deeper(container)).toContain("Break-even found At 0% a year the two are worth the same.");
    expect(onEvent).toHaveBeenCalledWith({ type: "milestone", id: "break_even_found" });
    setRange(getByRole(container, "slider", "Interest rate"), 8);
    expect(container.querySelector("[data-found]")).not.toBeNull();
  });

  it.each([
    [0.05, "₹24.78 crore"],
    [1, "₹20.96 crore"],
    [2, "₹17.73 crore"],
    [3, "₹15.13 crore"],
    [4, "₹13.01 crore"],
    [7.5, "₹8.19 crore"],
    [10, "₹6.23 crore"],
  ])("at %f%% the payments are worth %s today", (rate, worth) => {
    const container = called();
    setRange(getByRole(container, "slider", "Interest rate"), rate);
    expect(textOf(container.querySelector('[data-row="payments"] output'))).toBe(worth);
  });

  it("puts Worth more on the cash at any rate above zero, with a lower-rate hint", () => {
    const container = called();
    setRange(getByRole(container, "slider", "Interest rate"), 0.05);
    expect(row(container, "cash")).toBe("Cash today Worth more | ₹25 crore");
    expect(verdict(container)).toBe("At 0.05%, the payments are worth ₹22.41 lakh less than the cash.");
    expect(deeper(container)).toContain("Try a lower rate.");
  });

  it("lists the 30 payments at 5% in the table view, 2024 to 2053", () => {
    const container = called();
    const rows = container.querySelectorAll(".sig-table tbody tr");
    expect(rows).toHaveLength(30);
    expect([...rows[0].querySelectorAll("td")].map((td) => textOf(td))).toEqual(["2024", "₹37.63 lakh", "₹37.63 lakh"]);
    expect(textOf(rows[29].querySelector("td"))).toBe("2053");
  });
});
