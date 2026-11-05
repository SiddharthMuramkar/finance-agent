// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allById, byId, draw, redraw, setRange, stubReducedMotion, type Page } from "../wave1/test-kit";
import { RateMoveView } from "./rate-move";

let page: Page | null = null;
const show = (element: Parameters<typeof draw>[0]) => (page = draw(element));
const text = () => (page!.host.textContent ?? "").replace(/\s+/g, " ");

beforeEach(() => stubReducedMotion(false));
afterEach(() => {
  page?.cleanup();
  page = null;
  vi.unstubAllGlobals();
});

const choiceButtons = () => [...page!.host.querySelectorAll<HTMLButtonElement>('[data-testid="rate-move-choice"]')];
const readings = () => choiceButtons().map((b) => b.textContent?.trim() ?? "");
const tap = (name: string) =>
  act(() => {
    choiceButtons().find((b) => b.textContent?.trim() === name)!.click();
  });
const status = () => byId(page!, "rate-move-answer")!.getAttribute("data-status");

describe("RateMove, show mode", () => {
  it("draws an arrow with a head from the old rate to the new one, labelled in percent", () => {
    show(<RateMoveView oldRate={4} newRate={5} />);
    const line = byId(page!, "rate-move-line")!;
    expect(line.getAttribute("role")).toBe("img");
    expect(line.getAttribute("aria-label")).toBe("A number line: the rate moves from 4% up to 5%.");
    expect(line.getAttribute("data-direction")).toBe("rise");
    expect(byId(page!, "rate-move-arrow")).not.toBeNull();
    expect(byId(page!, "rate-move-head")).not.toBeNull();
    expect(byId(page!, "rate-move-old")!.textContent).toBe("Old 4%");
    expect(byId(page!, "rate-move-new")!.textContent).toBe("New 5%");
    const from = Number(byId(page!, "rate-move-arrow")!.getAttribute("x1"));
    const to = Number(byId(page!, "rate-move-arrow")!.getAttribute("x2"));
    expect(to).toBeGreaterThan(from);
  });

  it("shows the three worked lines at once: 1 point, 100 bp and 25%", () => {
    show(<RateMoveView oldRate={4} newRate={5} />);
    expect(allById(page!, "rate-move-readout").map((r) => r.textContent)).toEqual([
      "Points: new minus old5% minus 4% is 1 point",
      "Basis points: points times 1001 point times 100 is 100 bp",
      "Percent of the old rate1 divided by the old 4%, times 100, is 25%",
    ]);
    expect(byId(page!, "rate-move-answer")).toBeNull();
  });

  it("rewrites the lines and points the arrow back when the rates move (a fall)", () => {
    show(<RateMoveView oldRate={4} newRate={5} />);
    redraw(page!, <RateMoveView oldRate={7.5} newRate={7.2} />);
    expect(byId(page!, "rate-move-line")!.getAttribute("data-direction")).toBe("fall");
    expect(byId(page!, "rate-move-line")!.getAttribute("aria-label")).toBe("A number line: the rate moves from 7.5% down to 7.2%.");
    expect(text()).toContain("7.2% minus 7.5% is a fall of 0.3 points");
    expect(text()).toContain("0.3 points times 100 is a fall of 30 bp");
    const from = Number(byId(page!, "rate-move-arrow")!.getAttribute("x1"));
    const to = Number(byId(page!, "rate-move-arrow")!.getAttribute("x2"));
    expect(to).toBeLessThan(from);
  });

  it("says an old rate of 0 has no percent change", () => {
    show(<RateMoveView oldRate={0} newRate={1.5} />);
    expect(text()).toContain("The old rate is 0%, so the percent change has no value");
  });

  it("draws no arrow when the rate does not move", () => {
    show(<RateMoveView oldRate={4} newRate={4} />);
    expect(byId(page!, "rate-move-arrow")).toBeNull();
    expect(byId(page!, "rate-move-line")!.getAttribute("aria-label")).toBe("A number line: the rate stays at 4%.");
  });

  it("never shows a currency symbol", () => {
    show(<RateMoveView oldRate={7.5} newRate={9.25} />);
    expect(text()).not.toMatch(/[$₹]/);
  });

  it("says it is working while a rate has no number yet", () => {
    show(<RateMoveView oldRate={NaN} newRate={5} />);
    expect(byId(page!, "rate-move")).toBeNull();
    expect(text()).toContain("Working out the move");
  });
});

describe("RateMove, practice mode", () => {
  it("asks which reading is right, offers three buttons and shows no worked line before a tap", () => {
    show(<RateMoveView oldRate={4} newRate={5} mode="practice" />);
    expect(text()).toContain("The rate moves from 4% to 5%. Which reading is right?");
    expect(readings().sort()).toEqual(["Up 1 point, or 100 bps", "Up 1%", "Up 10 bps"]);
    for (const b of choiceButtons()) expect(b.tagName).toBe("BUTTON");
    expect(allById(page!, "rate-move-readout")).toHaveLength(0);
    expect(page!.host.querySelectorAll("input")).toHaveLength(0);
    expect(page!.host.querySelectorAll('input[type="range"]')).toHaveLength(0);
    expect(status()).toBe("idle");
  });

  it("offers the fall's readings: 7.5% to 7.2%", () => {
    show(<RateMoveView oldRate={7.5} newRate={7.2} mode="practice" />);
    expect(readings().sort()).toEqual(["Down 0.3 points, or 30 bps", "Down 0.3%", "Down 3 bps"]);
  });

  it("marks the right reading, then shows the three lines and locks the choices", () => {
    show(<RateMoveView oldRate={2} newRate={4.5} mode="practice" />);
    tap("Up 2.5 points, or 250 bps");
    expect(status()).toBe("right");
    expect(text()).toContain("Right. The move is 250 bp.");
    expect(allById(page!, "rate-move-readout")).toHaveLength(3);
    expect(text()).toContain("2.5 points times 100 is 250 bp");
    for (const b of choiceButtons()) expect(b.disabled).toBe(true);
  });

  it("marks a wrong reading, says the move and the fix, and shows the lines", () => {
    show(<RateMoveView oldRate={7.5} newRate={7.2} mode="practice" />);
    tap("Down 0.3%");
    expect(status()).toBe("wrong");
    expect(text()).toContain("Not quite. The move is 30 bp (a fall).");
    expect(text()).toContain("That is a percent.");
    expect(text()).toContain("0.3 points times 100 is a fall of 30 bp");
  });

  it("marks the x10 slip with its own fix", () => {
    show(<RateMoveView oldRate={4} newRate={5} mode="practice" />);
    tap("Up 10 bps");
    expect(status()).toBe("wrong");
    expect(text()).toContain("multiply by 100, not 10");
  });

  it("after marking, offers sliders that move the lines but not the marked question", () => {
    show(<RateMoveView oldRate={5} newRate={5.2} mode="practice" />);
    tap("Up 0.2 points, or 20 bps");
    const [oldSlider, newSlider] = [...page!.host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    expect([oldSlider.value, newSlider.value]).toEqual(["5", "5.2"]);
    setRange(newSlider, 6);
    expect(text()).toContain("6% minus 5% is 1 point");
    expect(text()).toContain("The rate moves from 5% to 5.2%. Which reading is right?");
    expect(text()).toContain("Right. The move is 20 bp.");
    expect(status()).toBe("right");
    expect(byId(page!, "rate-move-new")!.textContent).toBe("New 6%");
  });
});
