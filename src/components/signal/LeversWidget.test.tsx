// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leverBand, LEVERS } from "@/finance/signal/levers";
import { bridgeRows, LeverLab, LeversWidget, leverSpoken, subLine } from "./LeversWidget";
import { leversModel, PRESETS } from "@/finance/signal/levers";
import { cleanup, click, getByRole, render, setRange, textOf } from "./test-dom";

// The levers widget (spec §6.2) on the valuation engine (decision #18): his story is $35.04, and every value below is the
// engine's, as the re-pinned §6.2.4 table and QA rows 5 to 9, 11 and 20 list them.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const widget = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-widget="levers"]')!;
const value = (container: HTMLElement) => textOf(container.querySelector("[data-value]"));
const sub = (container: HTMLElement) => textOf(container.querySelector(".sig-lab-sub"));
const reading = (container: HTMLElement) => textOf(container.querySelector(".sig-verdict"));
const lever = (container: HTMLElement, key: string) => container.querySelector<HTMLElement>(`[data-lever="${key}"]`)!;
const pill = (container: HTMLElement, key: string) => {
  const p = lever(container, key).querySelector(".sig-pill")!;
  return p.classList.contains("sig-pill-ghost") ? null : textOf(p);
};
const pills = (container: HTMLElement) => ["rev", "margin", "s2c", "wacc"].map((key) => pill(container, key));
const delta = (container: HTMLElement, key: string) => lever(container, key).querySelector<HTMLElement>(".sig-lever-delta");

describe("the levers widget renders", () => {
  it("5: opens on his story at $35, against the $84 price", () => {
    const { container } = render(<LeversWidget />);
    const w = widget(container);
    expect(w.dataset.case).toBe("amazon-2000");
    expect(textOf(w)).toContain("Feb 2000");
    expect(w.querySelector("h3")?.textContent).toBe("Four levers. What is Amazon worth?");
    expect(value(w)).toBe("$35");
    expect(sub(w)).toBe("42% of the $84 price.");
    expect(reading(w)).toBe("This is his story: $35 a share, against a price of $84. Drag any lever to write your own.");
    expect(textOf(w.querySelector(".sig-ruler"))).toContain("His story $35");
    expect(textOf(w.querySelector(".sig-ruler"))).toContain("Price paid, 3 Feb 2000");
    expect(pills(w)).toEqual([null, null, null, null]);
    expect(LEVERS.map((l) => textOf(lever(w, l.key).querySelector(".sig-lever-value")))).toEqual(["$39bn", "10%", "$3.00", "12.84%"]);
    expect(textOf(w)).toContain("It reproduces his $35.08 within 2%.");
  });

  it("drops the head in compact mode and renders nothing for another Case", () => {
    expect(widget(render(<LeversWidget compact />).container).querySelector("h3")).toBeNull();
    expect(render(<LeversWidget caseSlug="mega-millions-2018" />).container.innerHTML).toBe("");
  });
});

describe("call before reveal", () => {
  it("keeps Go deeper locked until the first lever move", () => {
    const { container } = render(<LeversWidget />);
    expect(textOf(container.querySelector(".sig-l2"))).toContain("Opens after you move a lever.");
    expect(container.querySelector("[data-bridge]")).toBeNull();
    expect(textOf(container)).not.toContain("Show the numbers");
  });

  it("20: moving a lever fires onCall once and opens Go deeper with the year strip and the bridge", () => {
    const onCall = vi.fn();
    const onEvent = vi.fn();
    const { container } = render(<LeversWidget onCall={onCall} onEvent={onEvent} />);
    setRange(getByRole(container, "slider", "What it keeps"), 12);
    setRange(getByRole(container, "slider", "What it keeps"), 13);
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith({ id: "margin", label: "What it keeps", verdict: null, feedback: "" });
    expect(onEvent.mock.calls.map(([e]) => e.type).slice(0, 2)).toEqual(["call", "layer2_open"]);
    const deeper = container.querySelector('.sig-l2[data-open="true"]')!;
    expect(textOf(deeper)).toContain("Where the value comes from");
    expect(deeper.querySelectorAll("[data-flow]")).toHaveLength(10);
    expect([...deeper.querySelectorAll("[data-bridge]")].map((r) => r.getAttribute("data-bridge"))).toEqual([
      "Cash from years 1 to 10",
      "Everything after year 10",
      "What it owes others",
      "Your story, a share",
    ]);
    expect(textOf(deeper)).toContain("The thin black line is the $84 price.");
  });

  it("counts a preset tap as the call", () => {
    const onCall = vi.fn();
    const { container } = render(<LeversWidget onCall={onCall} />);
    click(getByRole(container, "button", "A grocer’s margins"));
    expect(onCall).toHaveBeenCalledWith({ id: "grocer", label: "A grocer’s margins", verdict: null, feedback: "" });
  });
});

describe("key numbers on the engine", () => {
  it("6: One story worth $84 shows $84, worth the price, pills +$27, +$17, none, +$5, and You reached the price", () => {
    const onEvent = vi.fn();
    const { container } = render(<LeversWidget onEvent={onEvent} />);
    click(getByRole(container, "button", "One story worth $84"));
    expect(value(container)).toBe("$84");
    expect(sub(container)).toBe("Worth the $84 price, on this story.");
    expect(pills(container)).toEqual(["+$27", "+$17", null, "+$5"]);
    expect(reading(container)).toBe("You reached the price Your story needs $59bn of sales in year 10 and a margin of 12%. Would you have believed that in 2000?");
    expect(onEvent).toHaveBeenCalledWith({ type: "milestone", id: "reached_price", rev: 59, margin: 12 });
  });

  it("7: A grocer’s margins shows $1 with one red pill, −$34, under What it keeps", () => {
    const { container } = render(<LeversWidget />);
    click(getByRole(container, "button", "A grocer’s margins"));
    expect(value(container)).toBe("$1");
    expect(pills(container)).toEqual([null, "−$34", null, null]);
    expect(lever(container, "margin").querySelector(".sig-pill-loss")).not.toBeNull();
    expect(reading(container)).toBe("Your story is worth $34 less than his. The pills under each lever show where that came from.");
  });

  it("8: How risky at the top paints a red band and a red pill, and the value falls", () => {
    const { container } = render(<LeversWidget />);
    setRange(getByRole(container, "slider", "How risky"), 17.84);
    expect(delta(container, "wacc")?.className).toContain("is-loss");
    expect(delta(container, "wacc")?.className).not.toContain("is-missing");
    expect(lever(container, "wacc").querySelector(".sig-pill-loss")).not.toBeNull();
    expect(Number(value(container).slice(1))).toBeLessThan(35);
  });

  it("9: How risky below the notch paints a pale green band and a green pill", () => {
    const { container } = render(<LeversWidget />);
    setRange(getByRole(container, "slider", "How risky"), 10.04);
    expect(delta(container, "wacc")?.className).toContain("is-gain");
    expect(delta(container, "wacc")?.className).toContain("is-missing");
    expect(pill(container, "wacc")).toMatch(/^\+\$\d+$/);
  });

  it("11: What it keeps at 17.5% is $86, worth the price; 17% is $82", () => {
    const { container } = render(<LeversWidget />);
    setRange(getByRole(container, "slider", "What it keeps"), 17);
    expect(value(container)).toBe("$82");
    setRange(getByRole(container, "slider", "What it keeps"), 17.5);
    expect(value(container)).toBe("$86");
    expect(sub(container)).toBe("Worth the $84 price, on this story.");
  });

  it("shows the far-future warning for his story's 112% after year 10", () => {
    const { container } = render(<LeversWidget />);
    setRange(getByRole(container, "slider", "What growth costs"), 3.25);
    setRange(getByRole(container, "slider", "What growth costs"), 3);
    expect(textOf(container.querySelector("[data-far-future]"))).toBe(
      "Careful 112% of this business’s value arrives after year 10. The first ten years burn cash, so the far future carries the whole number.",
    );
  });

  it("drags a lever with the mouse from anywhere on its track", () => {
    const { container } = render(<LeversWidget />);
    const track = lever(container, "margin").querySelector<HTMLElement>(".sig-lever-track")!;
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 200, height: 200, left: 0, right: 44, width: 44, x: 0, y: 0, toJSON: () => ({}) });
    const fire = (type: string, clientY: number) => act(() => void track.dispatchEvent(new PointerEvent(type, { bubbles: true, clientY, pointerType: "mouse", pointerId: 1 })));
    // y = 58 is n = 0.75 of the margin's 0 to 20: 15%.
    fire("pointerdown", 58);
    expect(widget(container).querySelector("[data-dragging]")).not.toBeNull();
    fire("pointermove", 58);
    fire("pointerup", 58);
    expect(textOf(lever(container, "margin").querySelector(".sig-lever-value"))).toBe("15%");
    expect(widget(container).querySelector("[data-dragging]")).toBeNull();
    expect(textOf(container.querySelector(".sig-lab p.sig-sr"))).toBe(`Your story is worth $${Math.round(leversModel({ ...PRESETS.damodaran.levers, margin: 15 }).perShare)} a share.`);
  });
});

describe("the lever lab's band mode (the home scroll story)", () => {
  it("10: What it keeps alone, focused, shades a band from $0 to $102 and dims the other levers", () => {
    const band = leverBand("margin");
    const { container } = render(
      <section className="sig-w">
        <LeverLab values={PRESETS.damodaran.levers} focus="margin" band="margin" />
      </section>,
    );
    expect(container.querySelector(".is-band-loss")).not.toBeNull();
    expect(container.querySelector(".is-band-gain")).not.toBeNull();
    expect(Math.max(0, Math.round(band.lo))).toBe(0);
    expect(Math.round(band.hi)).toBe(102);
    expect([...container.querySelectorAll("[data-lever]")].map((el) => el.getAttribute("data-enabled"))).toEqual(["false", "true", "false", "false"]);
    expect(container.querySelectorAll(".sig-lever-knob")).toHaveLength(1);
  });
});

describe("pure helpers", () => {
  it("speaks a lever's value and effect", () => {
    expect(leverSpoken(LEVERS[1], 12, 17.3)).toBe("Operating margin once mature 12 percent, adds 17 dollars a share");
    expect(leverSpoken(LEVERS[3], 12.84, 0)).toBe("Cost of capital while it grows 12.84 percent, no change from his story");
  });

  it("writes the sub-line from the value", () => {
    expect(subLine(83.69)).toBe("Worth the $84 price, on this story.");
    expect(subLine(-17.37)).toBe("Less than it owes, on this story.");
    expect(subLine(35.04)).toBe("42% of the $84 price.");
  });

  it("builds a bridge that adds up to the value a share", () => {
    const rows = bridgeRows(leversModel(PRESETS.damodaran.levers));
    expect(rows.map((r) => r.text)).toEqual(["−$5", "+$50", "−$9", "$35"]);
    expect(rows[2].to).toBeCloseTo(rows[3].to, 10);
  });
});
