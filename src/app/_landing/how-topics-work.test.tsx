// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "./copy";

// Home's section 3, "How every Topic works" (spec 2026-11-12 E5, E10, Appendix F), as a visitor uses it: four steps on a
// Band, each a real piece of Spine Topic 1 on a white card; the visitor moves between them and nothing plays by itself; the
// Quick try marks a wrong tap at once and shows its fix with no request (E Done when); the first step opened is sent once.

const tracked = vi.hoisted(() => vi.fn());
vi.mock("../analytics", () => ({ track: tracked }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { HowTopicsWork, markHomeTry } = await import("./how-topics-work");

let root: Root;
let host: HTMLElement;
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  tracked.mockClear();
  fetchSpy = vi.fn(() => Promise.reject(new Error("no request may leave section 3")));
  vi.stubGlobal("fetch", fetchSpy);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<HowTopicsWork />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tab = (name: string) => tabs().find((t) => t.textContent?.includes(name))!;
const openPanel = () => host.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
const press = (el: Element) => act(async () => (el as HTMLElement).click());
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("How every Topic works (E5)", () => {
  it("is a Band with four steps in Appendix F's order, the first open, with its one line of caption", () => {
    const section = host.querySelector("section#how-it-works")!;
    expect(section.className.split(" ")).toContain("band");
    expect(section.getAttribute("data-band")).toBe("home-how-it-works");
    expect(tabs().map((t) => t.textContent)).toEqual(["01Hear the story", "02Learn the lingo", "03Try it", "04Value it"]);
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
    expect(openPanel().querySelector("p")!.textContent).toBe("A true moment, and what people knew that day.");
    expect(host.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
  });

  it("each step's tab is a white button on the Band (F1, F4) and its card a white band-card", () => {
    for (const t of tabs()) expect(t.className).toMatch(/\bbtn\b/);
    expect(openPanel().querySelector(".band-card")).not.toBeNull();
  });

  it("Hear the story shows Spine Topic 1's story, every beat at once, with no Next to press", () => {
    const story = host.querySelector('[data-testid="home-step-story"]')!;
    expect(story.querySelectorAll("[data-beat]")).toHaveLength(6);
    expect(story.querySelector("[data-beat]")!.textContent).toBe("February 2000.");
    expect(story.textContent).toContain("Its shares cost $84.");
    expect(story.textContent).toContain("What is Amazon worth, and is $84 a fair price for it?");
    expect(button("Next")).toBeUndefined();
  });

  it("plays nothing by itself: ten seconds on, the first step is still the open one", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => vi.advanceTimersByTime(10_000));
      expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
      expect(tracked).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves by the arrow keys (Up and Down too, for the phone's two-by-two grid) and Home and End, and focus follows", async () => {
    const key = (i: number, k: string) => act(async () => tabs()[i].dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
    const at = () => tabs().findIndex((t) => t.getAttribute("aria-selected") === "true");
    await key(0, "ArrowRight");
    expect(at()).toBe(1);
    expect(document.activeElement).toBe(tabs()[1]);
    await key(1, "ArrowDown");
    expect(at()).toBe(2);
    await key(2, "ArrowUp");
    expect(at()).toBe(1);
    await key(1, "End");
    expect(at()).toBe(3);
    expect(document.activeElement).toBe(tabs()[3]);
    await key(3, "ArrowRight");
    expect(at()).toBe(0);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("marks the open step inside its button, so the Band's focus ring outside it stays plain (F1)", async () => {
    expect(tabs()[0].querySelector("[data-open-mark]")).not.toBeNull();
    expect(tabs()[0].className).not.toMatch(/\bring-/);
    await press(tab("Value it"));
    expect(tabs()[0].querySelector("[data-open-mark]")).toBeNull();
    expect(tabs()[3].querySelector("[data-open-mark]")).not.toBeNull();
  });

  it("Learn the lingo shows the word price, and the card turns over to the word in the story", async () => {
    await press(tab("Learn the lingo"));
    expect(openPanel().querySelector("p")!.textContent).toBe("Each money word in plain English, when the story needs it.");
    const front = host.querySelector('[data-testid="home-lingo-front"]')!;
    const back = host.querySelector('[data-testid="home-lingo-back"]')!;
    expect(front.textContent).toContain("What buyers pay for one share today.");
    expect(front.getAttribute("aria-hidden")).toBe("false");
    expect(back.hasAttribute("inert")).toBe(true);
    const turn = host.querySelector('[data-testid="home-lingo-turn"]')!;
    expect(turn.getAttribute("aria-pressed")).toBe("false");
    await press(turn);
    expect(turn.getAttribute("aria-pressed")).toBe("true");
    expect(turn.textContent).toBe("In the story");
    expect(back.getAttribute("aria-hidden")).toBe("false");
    expect(back.hasAttribute("inert")).toBe(false);
    expect(front.getAttribute("aria-hidden")).toBe("true");
    expect(front.hasAttribute("inert")).toBe(true);
    expect(back.textContent).toContain("In the story, $84 is what buyers pay for an Amazon share.");
    await press(turn);
    expect(front.getAttribute("aria-hidden")).toBe("false");
  });

  // Spec E, Done when: "Section 3's Quick try marks a wrong tap and shows its fix with no network request." And G4: a
  // wrong tap shows a cross and "Your pick"; only the right choice shows a tick.
  it("Try it marks a wrong tap at once, with its cross, Your pick and its fix, and sends no request", async () => {
    await press(tab("Try it"));
    expect(openPanel().textContent).toContain("His story says $35 a share. Is that a price or a value?");
    await press(button("A price"));
    await settle();
    const wrong = host.querySelector('[data-testid="quick-try-choice"][data-wrong-pick="true"]')!;
    expect(wrong.textContent).toContain("A price");
    expect(wrong.textContent).toContain("Your pick");
    expect(host.querySelector('[data-testid="quick-try-choice"][data-right="true"]')!.textContent).toContain("A value");
    const result = host.querySelector('[data-testid="quick-try-result"]')!;
    expect(result.getAttribute("data-verdict")).toBe("known_mistake");
    expect(result.textContent).toBe("Nobody paid $35: it is worked out from a story about the business, so it is a value.");
    expect([...host.querySelectorAll<HTMLButtonElement>('[data-testid="quick-try-choice"]')].every((b) => b.disabled)).toBe(true);
    // Read out, and focus lands on Try again rather than on the page once the choices lock.
    expect(result.closest('[aria-live="polite"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Try again");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Try again clears the mark, and a right tap is marked right with a tick only on it", async () => {
    await press(tab("Try it"));
    await press(button("A price"));
    await settle();
    await press(button("Try again"));
    expect(host.querySelector('[data-testid="quick-try-result"]')).toBeNull();
    // A fresh try: no chip still pressed from the last one, and focus on its first choice.
    expect([...host.querySelectorAll('[data-testid="quick-try-choice"]')].map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    expect(document.activeElement?.textContent).toBe("A value");
    await press(button("A value"));
    await settle();
    expect(host.querySelector('[data-testid="quick-try-result"]')!.getAttribute("data-verdict")).toBe("right");
    expect(host.querySelector('[data-testid="quick-try-your-pick"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Value it shows the reveal, $35.08 against the $84 price, as two bars on one scale", async () => {
    await press(tab("Value it"));
    expect(openPanel().querySelector("p")!.textContent).toBe("Put your own number on it, then see what really happened.");
    const reveal = host.querySelector('[data-testid="home-step-value"]')!;
    expect(reveal.textContent).toContain("His story came to $35.08 a share against the $84 price.");
    const width = (id: string) => (reveal.querySelector(`[data-reveal-bar="${id}"] [aria-hidden] > div`) as HTMLElement).style.width;
    expect(width("price")).toBe("100%");
    expect(width("value")).toBe("41.76%");
  });

  it("sends home_step_opened once, for the first step the visitor opens, and nothing on first paint (E10)", async () => {
    expect(tracked).not.toHaveBeenCalled();
    // Pressing the step already open opens nothing, so it is not counted.
    await press(tab("Hear the story"));
    expect(tracked).not.toHaveBeenCalled();
    await press(tab("Learn the lingo"));
    await press(tab("Try it"));
    await press(tab("Hear the story"));
    expect(tracked.mock.calls).toEqual([["home_step_opened", { step: "lingo" }]]);
  });
});

describe("markHomeTry", () => {
  it("marks the right choice right, and the wrong one with its Known mistake's fix", () => {
    expect(markHomeTry("value")).toMatchObject({ verdict: "right", line: copy.movesUi.right, choice: "value", answer: "value" });
    expect(markHomeTry("price")).toMatchObject({ verdict: "known_mistake", choice: "price", answer: "value" });
    expect(markHomeTry("other")).toMatchObject({ verdict: "wrong", line: "Not quite." });
  });
});
