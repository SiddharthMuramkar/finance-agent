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

  // #471, A8: accents are thin marks with a meaning: the Old rate's tick is a sunflower stroke (history), and the readouts
  // sit beside a 2 px violet rule (lingo), their labels muted. Royal blue now marks only what can be pressed, so the arrow
  // is ink: a rate move has no money in it, so its direction is neither a gain (mint also means "you") nor a loss (coral).
  it("royal blue only for what can be pressed", () => {
    show(<RateMoveView oldRate={4} newRate={5} />);
    expect(byId(page!, "rate-move-arrow")!.getAttribute("stroke")).toBe("var(--ink)");
    expect(byId(page!, "rate-move-head")!.getAttribute("fill")).toBe("var(--ink)");
    expect(byId(page!, "rate-move-old")!.getAttribute("fill")).toBe("var(--muted)");
    expect(byId(page!, "rate-move-old-tick")!.getAttribute("stroke")).toBe("var(--sun-ink)");
    const labels = allById(page!, "rate-move-readout").map((r) => r.querySelector("[data-testid=\"rate-move-label\"]")!.getAttribute("class") ?? "");
    expect(labels).toHaveLength(3);
    for (const c of labels) {
      expect(c).toContain("text-[var(--muted)]");
      expect(c).not.toContain("--violet-ink");
    }
    expect(page!.host.querySelector("ol")!.className).toContain("border-l-2");
    expect(page!.host.querySelector("ol")!.className).toContain("border-[var(--violet)]");
  });

  it("a rise and a fall keep the same ink arrow", () => {
    for (const [oldRate, newRate] of [[4, 5], [5, 4]] as const) {
      show(<RateMoveView oldRate={oldRate} newRate={newRate} />);
      const paints = [byId(page!, "rate-move-arrow")!.getAttribute("stroke"), byId(page!, "rate-move-head")!.getAttribute("fill")];
      expect(paints).toEqual(["var(--ink)", "var(--ink)"]);
      expect(page!.host.innerHTML).not.toMatch(/--(mint|coral)/);
    }
  });

  it("shows the three worked lines at once: 1 point, 100 bp and 25%", () => {
    show(<RateMoveView oldRate={4} newRate={5} />);
    expect(allById(page!, "rate-move-readout").map((r) => r.textContent)).toEqual([
      "How far it movedThe rate climbs from 4% to 5%: up 1 point",
      "How traders say itTraders call that 100 bp",
      "Next to the old rateUp 25% on the old rate",
    ]);
    expect(byId(page!, "rate-move-answer")).toBeNull();
  });

  it("rewrites the lines and points the arrow back when the rates move (a fall)", () => {
    show(<RateMoveView oldRate={4} newRate={5} />);
    redraw(page!, <RateMoveView oldRate={7.5} newRate={7.2} />);
    expect(byId(page!, "rate-move-line")!.getAttribute("data-direction")).toBe("fall");
    expect(byId(page!, "rate-move-line")!.getAttribute("aria-label")).toBe("A number line: the rate moves from 7.5% down to 7.2%.");
    expect(text()).toContain("The rate drops from 7.5% to 7.2%: down 0.3 points");
    expect(text()).toContain("Traders call that a fall of 30 bp");
    const from = Number(byId(page!, "rate-move-arrow")!.getAttribute("x1"));
    const to = Number(byId(page!, "rate-move-arrow")!.getAttribute("x2"));
    expect(to).toBeLessThan(from);
  });

  it("says an old rate of 0 has no percent change", () => {
    show(<RateMoveView oldRate={0} newRate={1.5} />);
    expect(text()).toContain("From 0% no percent change can be given: the old rate is zero, so there is nothing to take a share of");
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

  it("draws each reading as the shared Chip (Appendix B.7), with no hand-made border look", () => {
    show(<RateMoveView oldRate={2} newRate={4.5} mode="practice" />);
    expect(choiceButtons()).toHaveLength(3);
    for (const b of choiceButtons()) {
      expect(b.getAttribute("data-affordance")).toBe("chip");
      expect(b.className.split(/\s+/)).toContain("chip");
      expect(b.className).not.toMatch(/border-\[var\(--border\)\]|border-b-\[3px\]/);
      expect(b.getAttribute("aria-pressed")).toBe("false");
    }
    tap("Up 2.5 points, or 250 bps");
    const on = choiceButtons().find((b) => b.textContent?.trim() === "Up 2.5 points, or 250 bps")!;
    expect(on.getAttribute("aria-pressed")).toBe("true");
  });

  it("after a tap, the tapped Chip carries no pressed weight class: 600 is only the key figure's (A8)", () => {
    show(<RateMoveView oldRate={2} newRate={4.5} mode="practice" />);
    tap("Up 2.5 points, or 250 bps");
    const on = choiceButtons().find((b) => b.textContent?.trim() === "Up 2.5 points, or 250 bps")!;
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.className).not.toMatch(/aria-pressed:font-/);
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
    expect(text()).toContain("Traders call that 250 bp");
    for (const b of choiceButtons()) expect(b.disabled).toBe(true);
  });

  it("marks a wrong reading, says the move and the fix, and shows the lines", () => {
    show(<RateMoveView oldRate={7.5} newRate={7.2} mode="practice" />);
    tap("Down 0.3%");
    expect(status()).toBe("wrong");
    expect(text()).toContain("Not quite. The move is 30 bp (a fall).");
    expect(text()).toContain("That is a percent.");
    expect(text()).toContain("Traders call that a fall of 30 bp");
  });

  // Spec 2026-11-12 G4: a wrong tap shows a cross and "Your pick"; only the right reading shows a tick.
  it("marks a wrong tap with a cross and Your pick, and only the right reading with a tick", () => {
    show(<RateMoveView oldRate={7.5} newRate={7.2} mode="practice" />);
    tap("Down 0.3%");
    const by = (start: string) => choiceButtons().find((b) => b.textContent!.trim().startsWith(start))!;
    const pick = by("Down 0.3%");
    expect(pick.querySelector('[data-result="wrong"]')).not.toBeNull();
    expect(pick.querySelector('[data-result="right"]')).toBeNull();
    expect(pick.textContent).toContain("Your pick");
    const right = by("Down 0.3 points, or 30 bps");
    expect(right.querySelector('[data-result="right"]')).not.toBeNull();
    expect(right.textContent).not.toContain("Your pick");
    expect(page!.host.querySelectorAll('[data-result="right"]')).toHaveLength(1);
    expect(page!.host.querySelectorAll('[data-result="wrong"]')).toHaveLength(1);
    for (const b of choiceButtons()) expect(b.className).not.toContain("content-['✓");
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
    expect(text()).toContain("The rate climbs from 5% to 6%: up 1 point");
    expect(text()).toContain("The rate moves from 5% to 5.2%. Which reading is right?");
    expect(text()).toContain("Right. The move is 20 bp.");
    expect(status()).toBe("right");
    expect(byId(page!, "rate-move-new")!.textContent).toBe("New 6%");
  });
});

// #480, A1b: a speaker Icon on each worked line and a direction Icon by the arrow, in show and practice mode; the words
// and the arithmetic stay the same (ADR 0003). The speakers keep their names (reporter, trader, headline) as aria-label.
describe("RateMove's characters are Icons (#480, A1b)", () => {
  const speakers = [
    ["woman", "reporter"],
    ["man-office-worker", "trader"],
    ["newspaper", "headline"],
  ];
  const lineIcons = () =>
    allById(page!, "rate-move-readout").map((li) =>
      [...li.querySelectorAll("svg[data-icon]")].map((i) => [i.getAttribute("data-icon"), i.getAttribute("aria-label"), i.getAttribute("role")]),
    );
  const expected = speakers.map(([icon, who]) => [[icon, who, "img"]]);
  const direction = () => byId(page!, "rate-move-direction");
  /** The name of the one Icon by the arrow: exactly one `svg[data-icon]`, and no emoji (A8). */
  const directionIcon = () => {
    const icons = direction()!.querySelectorAll("svg[data-icon]");
    expect(icons).toHaveLength(1);
    expect(direction()!.outerHTML).not.toContain("data-emoji");
    return icons[0].getAttribute("data-icon");
  };

  it("show mode: one speaker per line and a rising chart by the arrow, with the words unchanged", () => {
    show(<RateMoveView oldRate={4} newRate={5} />);
    expect(lineIcons()).toEqual(expected);
    expect(directionIcon()).toBe("chart-increasing");
    expect(page!.host.querySelector("img")).toBeNull();
    expect(text()).toContain("How far it moved");
    expect(text()).toContain("Next to the old rate");
  });

  it("practice mode: a falling chart before the tap, and one speaker per line after it", () => {
    show(<RateMoveView oldRate={9} newRate={8.75} mode="practice" />);
    expect(directionIcon()).toBe("chart-decreasing");
    tap("Down 0.25 points, or 25 bps");
    expect(status()).toBe("right");
    expect(lineIcons()).toEqual(expected);
    expect(page!.host.querySelector("img")).toBeNull();
  });

  it("an unmoved rate gets a bar chart, neither a rise nor a fall", () => {
    show(<RateMoveView oldRate={5} newRate={5} />);
    expect(directionIcon()).toBe("bar-chart");
    expect(page!.host.querySelector("img")).toBeNull();
  });
});

describe("RateMove, number line end labels (#417, #394, #318)", () => {
  // The svg viewBox is 0..320 and clips anything outside it. jsdom has no text layout, so estimate each glyph's width
  // in em from the widest sans the system stack can land on (DejaVu Sans on Linux: digits 0.636, "." 0.318, "%" 0.95;
  // Arial and SF are narrower). A flat 0.6em per glyph under-counts "%" and let 6-character ends like 10.25% clip.
  const VIEW_WIDTH = 320;
  const GLYPH_EM: Record<string, number> = { ".": 0.32, "%": 0.95 };
  const textWidth = (text: string, fontSize: number) => fontSize * [...text].reduce((sum, ch) => sum + (GLYPH_EM[ch] ?? (/\d/.test(ch) ? 0.64 : 0.6)), 0);
  const endLabels = () => {
    const texts = [...byId(page!, "rate-move-line")!.querySelectorAll("text")].filter((t) => !t.getAttribute("data-testid"));
    return texts.map((t) => {
      const x = Number(t.getAttribute("x"));
      const width = textWidth(t.textContent ?? "", Number(t.getAttribute("font-size")));
      const anchor = t.getAttribute("text-anchor");
      return { text: t.textContent, left: anchor === "end" ? x - width : x, right: anchor === "end" ? x : x + width };
    });
  };

  it.each([
    [4, 5],
    [4.5, 4.75],
    [3.75, 5.25],
    [10, 10.5],
    [10, 10.25],
    // 6-character ends at both sides: 10.25% and 11.25%; 13.75% and 21.25%; 19.74% and 20.25%.
    [10.5, 11],
    [15, 20],
    [19.99, 20],
    // The top of the slider range: the axis reaches 24.99%.
    [0.04, 20],
    [4, 20],
  ])("keeps both axis end labels inside the box for old %s, new %s", (oldRate, newRate) => {
    show(<RateMoveView oldRate={oldRate} newRate={newRate} />);
    const labels = endLabels();
    expect(labels).toHaveLength(2);
    for (const l of labels) {
      expect(l.left, `${l.text} left edge`).toBeGreaterThanOrEqual(0);
      expect(l.right, `${l.text} right edge`).toBeLessThanOrEqual(VIEW_WIDTH);
    }
  });
});
