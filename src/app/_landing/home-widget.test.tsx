// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { homeAnnuity } from "./home-widget-data";
import { HomeWidget } from "./home-widget";

// Home's Explorable (the owner's design E, 11 Nov 2026; spec 2026-11-12 E3) in a browser-like page (happy-dom), as a
// visitor uses it: a plain question, a guess before the first move, one rate with chips, the yearly payments in today's
// money on a fixed axis, the line that tracks where the payments stand and the match line, then the total against the
// sourced cash option. Its Case Data comes with the page, so nothing is fetched. Figures come from Appendix B.4 (worked
// out separately), and the lines a visitor must read are the spec's.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tracked = vi.hoisted(() => vi.fn());
vi.mock("../analytics", () => ({ track: tracked }));

const withheld: CaseData = {
  caseId: "mega-millions-2018",
  asOf: "2018-10-24",
  revealed: false,
  datasets: [
    {
      id: "cash-option",
      label: "Cash option",
      unit: "USD",
      source: "Source of cash-option",
      sourceUrl: "https://example.com/",
      checkedOn: "2026-10-01",
      points: [{ date: "2018-10-23", value: 877_800_000 }],
    },
  ],
};

let root: Root;
let host: HTMLElement;
const fetchSpy = vi.fn(async () => new Response("{}", { status: 401 }));

/** The visitor's motion setting: most cases ask for reduced motion, so the total shows its new value at once. */
function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
}

async function draw({ cases = [withheld], signedOut = false, reduce = true }: { cases?: CaseData[]; signedOut?: boolean; reduce?: boolean } = {}) {
  vi.stubGlobal("fetch", fetchSpy);
  motion(reduce);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<HomeWidget annuity={homeAnnuity(loadCourseMap())!} cases={cases} signedOut={signedOut} />));
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
  tracked.mockClear();
});

const range = () => host.querySelector<HTMLInputElement>('input[type="range"]')!;
const shown = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const text = (id: string) => shown(id)?.textContent ?? null;
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === name)!;

/** Drags the rate to `value`, as the browser reports a range input's move. */
async function drag(value: number) {
  const input = range();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
  await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
}

async function press(key: string, shiftKey = false) {
  await act(async () => range().dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })));
}

async function tap(name: string) {
  await act(async () => button(name).click());
}

describe("Home's Explorable", () => {
  it("asks its question in plain words and opens at 0%, with the line under the slider", async () => {
    await draw();
    expect(host.querySelector("h2")?.textContent).toBe("Is a $1.537B jackpot really worth $1.537B?");
    expect(host.textContent).toContain("30 yearly payments, or $877.8M in cash now");
    expect(range().value).toBe("0");
    expect(range().getAttribute("aria-label")).toBe("Interest rate (discount rate)");
    expect(text("explorable-status")).toContain("Raise the rate and watch the far-off payments shrink.");
  });

  // Spec 2026-11-12 F2 and F6 Done when: "Every slider in the product, Home's included, has a blue fill and thumb", and
  // the one key number of each Widget is blue, never underlined, and not something to press.
  it("draws the slider's fill and thumb in the accent blue, and the total as the one key number in the key-number blue", async () => {
    await draw();
    expect(host.querySelector("[data-slider-fill]")?.className).toContain("bg-[var(--accent)]");
    expect(host.querySelector("[data-slider-thumb] span")?.className).toContain("bg-[var(--accent)]");
    const worth = shown("explorable-worth")!;
    expect(worth.className).toContain("text-key-number");
    expect(worth.className).not.toMatch(/underline/);
    expect(worth.closest("a, button")).toBeNull();
  });

  it("opens all green: at 0% the annuity is worth its full $1.537B, $659.2M more than the cash", async () => {
    await draw();
    expect(text("explorable-worth")).toBe("$1.537B");
    expect(text("explorable-gap")).toContain("+$659.2M");
    expect(shown("explorable-gap")?.getAttribute("data-side")).toBe("gain");
    expect([...host.querySelectorAll('[data-testid="explorable-bar"]')].every((b) => b.getAttribute("data-side") === "gain")).toBe(true);
  });

  it("labels the comparison's two parts, from the Case Data sent with the page, and never fetches", async () => {
    await draw();
    const meter = shown("explorable-meter")!;
    expect(meter.querySelector('[data-meter-part="payments"]')?.textContent).toBe("30 payments, in today's money$1.537B");
    expect(meter.querySelector('[data-meter-part="cash"]')?.textContent).toBe("Cash now$877.8M");
    await drag(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("turns red when the rate rises to 5%: worth $694.0M today, $183.8M short, and the cash is worth more", async () => {
    await draw();
    await drag(5);
    expect(text("explorable-worth")).toBe("$694.0M");
    expect(text("explorable-gap")).toContain("−$183.8M");
    expect(text("explorable-gap")).toContain("short of the cash option");
    expect(text("explorable-standing")).toBe("The cash is worth more than the payments.");
    expect([...host.querySelectorAll('[data-testid="explorable-bar"]')].every((b) => b.getAttribute("data-side") === "loss")).toBe(true);
  });

  it("turns green again at 2%: worth $1.090B, $212.4M more, and the payments are worth more", async () => {
    await draw();
    await drag(5);
    await drag(2);
    expect(text("explorable-worth")).toBe("$1.090B");
    expect(text("explorable-gap")).toContain("+$212.4M");
    expect(text("explorable-standing")).toBe("The payments are worth more than the cash.");
  });

  it("rests on the match when dragged near it, and says so: You found it, at about 3.4%", async () => {
    await draw();
    await drag(3.35);
    expect(text("explorable-rate")).toBe("3.38%");
    expect(text("explorable-found")).toBe("You found it. At about 3.4% the 30 payments are worth the cash on offer.");
    expect(shown("explorable-standing")).toBeNull();
    await drag(3.6);
    expect(shown("explorable-found")).toBeNull();
    expect(text("explorable-standing")).toBe("The cash is worth more than the payments.");
  });

  // E3: at the match the 30 payments "are worth the cash on offer", so nothing beside that line may say they fall short
  // (at 3.38% they are $877.4M against $877.8M, inside the 1% match): the gap, the bars and the comparison read even.
  it("at the match, says the payments and the cash are about the same everywhere, never short", async () => {
    await draw();
    await drag(3.4);
    expect(text("explorable-found")).toContain("You found it.");
    expect(shown("explorable-gap")?.getAttribute("data-side")).toBe("even");
    expect(text("explorable-gap")).toContain("about the same as the cash option");
    expect(text("explorable-gap")).not.toContain("short of");
    expect([...host.querySelectorAll('[data-testid="explorable-bar"]')].every((b) => b.getAttribute("data-side") === "even")).toBe(true);
  });

  // Appendix B.4: at 2.99% the 30 payments are worth $931.4M today.
  it("reads $931.4M at 2.99%, as Appendix B.4 gives", async () => {
    await draw();
    await drag(3);
    await press("ArrowLeft");
    expect(text("explorable-rate")).toBe("2.99%");
    expect(text("explorable-worth")).toBe("$931.4M");
  });

  it("keeps the axis at $100.0M while the bars shrink and grow", async () => {
    await draw();
    const heights = () => [...host.querySelectorAll('[data-testid="explorable-bar"]')].map((b) => Number(b.getAttribute("height")));
    expect(text("explorable-axis")).toBe("$100.0M");
    const at0 = heights();
    await drag(5);
    expect(text("explorable-axis")).toBe("$100.0M");
    expect(heights().at(-1)!).toBeLessThan(at0.at(-1)! / 3);
    await drag(10);
    expect(text("explorable-axis")).toBe("$100.0M");
    await drag(0);
    expect(heights()).toEqual(at0);
  });

  it("asks for a guess before the first move, keeps the tap without marking it, and shows it beside the match line", async () => {
    await draw();
    expect(shown("explorable-guess-ask")?.textContent).toContain("At an ordinary interest rate, which is worth more?");
    await tap("The 30 payments");
    expect(button("The 30 payments").getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).not.toMatch(/wrong|right|correct/i);
    // The guess never blocks the slider: the first move works and the ask gives way.
    await drag(3.4);
    expect(shown("explorable-guess-ask")).toBeNull();
    expect(text("explorable-guess")).toBe("You guessed: the 30 payments");
    expect(text("explorable-found")).toContain("You found it.");
  });

  it("sets 0%, 5% and 10% with one tap, and Reset returns to 0%", async () => {
    await draw();
    await tap("5%");
    expect(text("explorable-rate")).toBe("5.00%");
    expect(text("explorable-worth")).toBe("$694.0M");
    await tap("10%");
    expect(text("explorable-worth")).toBe("$382.9M");
    await tap("Reset");
    expect(range().value).toBe("0");
    expect(text("explorable-worth")).toBe("$1.537B");
  });

  it("moves 0.01 per arrow key (0.1 with Shift), a point with Page keys, and to the ends with Home and End", async () => {
    await draw();
    await press("ArrowLeft");
    expect(range().value).toBe("0");
    await press("ArrowRight");
    expect(range().value).toBe("0.01");
    await press("ArrowRight", true);
    expect(range().value).toBe("0.11");
    await press("PageUp");
    expect(range().value).toBe("1.11");
    await press("End");
    expect(range().value).toBe("10");
    expect(text("explorable-worth")).toBe("$382.9M");
    await press("Home");
    expect(range().value).toBe("0");
    expect(range().getAttribute("aria-valuetext")).toBe("0.00 percent");
  });

  it("draws one bar per payment, what it is worth today, with no payment bar behind it", async () => {
    await draw();
    expect(host.querySelectorAll('[data-testid="explorable-bar"]')).toHaveLength(30);
    expect(host.querySelectorAll("svg rect")).toHaveLength(31); // the 30 bars and the hover layer, nothing else
  });

  it("signed out, offers Sign in to learn why → after its state line; signed in, no link", async () => {
    await draw({ signedOut: true });
    const link = shown("explorable-status")!.querySelector("a");
    expect(link?.textContent).toBe("Sign in to learn why →");
    expect(link?.getAttribute("href")).toBe("/login");
    act(() => root.unmount());
    host.remove();
    await draw();
    expect(host.querySelector('a[href="/login"]')).toBeNull();
  });

  it("without the cash option's Case Data, still shows the worth but no gap, meter, guess or match", async () => {
    await draw({ cases: [] });
    expect(text("explorable-worth")).toBe("$1.537B");
    expect(shown("explorable-gap")).toBeNull();
    expect(shown("explorable-meter")).toBeNull();
    expect(shown("explorable-guess-ask")).toBeNull();
    expect(host.textContent).toContain("paid as 30 yearly payments");
    await drag(3.35);
    expect(text("explorable-rate")).toBe("3.35%");
    expect(shown("explorable-found")).toBeNull();
  });

  // E9: the number counts to its new value; under reduced motion it is there at once (every case above). Frames are run
  // by hand here, a clock that moves only when told.
  it("counts the total to its new value when motion is allowed", async () => {
    const frames: FrameRequestCallback[] = [];
    let now = 1000;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    await draw({ reduce: false });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    await tap("10%");
    expect(text("explorable-worth")).toBe("$1.537B");
    const step = async (ms: number) => {
      now += ms;
      const due = frames.splice(0);
      await act(async () => due.forEach((cb) => cb(now)));
    };
    await step(100);
    const midway = text("explorable-worth");
    expect(midway).not.toBe("$1.537B");
    expect(midway).not.toBe("$382.9M");
    await step(300);
    expect(text("explorable-worth")).toBe("$382.9M");
    vi.restoreAllMocks();
  });

  // E10: the first move and the match found, once each, with no personal data.
  it("tells analytics the slider's first move and the match found, once each", async () => {
    await draw();
    await tap("About the same");
    await drag(1);
    await drag(2);
    await drag(3.4);
    await drag(5);
    await drag(3.35);
    expect(tracked.mock.calls).toEqual([
      ["home_slider_first_move", { via: "drag" }],
      ["home_match_found", { guess: "same" }],
    ]);
  });
});
