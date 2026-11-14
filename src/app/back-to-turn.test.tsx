// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUICK_TRY, QUICK_TRY_RESULT } from "@/tutor/session-item-kinds";
import { BackToTurn, openQuickTryKey } from "./back-to-turn";
import type { ThreadLine } from "./thread";

// G3, A5: "Back to your turn" sits above the message box only while a Quick try is open and its card is off screen;
// pressing it scrolls the card into view (smooth, or "auto" for reduced motion) and focuses its first choice.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Watch = { callback: IntersectionObserverCallback; targets: Element[]; root: Element | Document | null | undefined };
let observers: Watch[];

class FakeObserver {
  private watch: Watch;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.watch = { callback, targets: [], root: options?.root };
    observers.push(this.watch);
  }
  observe(el: Element) {
    this.watch.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.watch.targets = [];
  }
  takeRecords() {
    return [];
  }
}

/** Tells every observer watching `el` whether it is in view. */
function see(el: Element, visible: boolean) {
  act(() => {
    for (const w of observers.filter((o) => o.targets.includes(el)))
      w.callback([{ target: el, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

let host: HTMLElement;
let root: Root;
let reduce: boolean;

beforeEach(() => {
  observers = [];
  reduce = false;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const card = (choices = '<button type="button">20 bp</button><button type="button">200 bp</button>') =>
  `<section data-testid="quick-try" aria-label="Quick try"><p>How many basis points?</p>${choices}</section>`;

/** A thread viewport holding the conversation, as LeftColumn draws it, with the button's place outside it. */
function draw(thread: string, openKey: string | null) {
  const viewport = document.createElement("div");
  viewport.dataset.testid = "thread-viewport";
  const block = document.createElement("div");
  block.innerHTML = thread;
  viewport.append(block);
  document.body.prepend(viewport);
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = block;
  act(() => root.render(<BackToTurn thread={ref} openKey={openKey} />));
  return { viewport, block };
}

const button = () => host.querySelector<HTMLButtonElement>('[data-testid="back-to-turn"]');

describe("BackToTurn", () => {
  it("is absent while the open Quick try is in view", () => {
    const { block } = draw(card(), "k1");
    see(block.querySelector('[data-testid="quick-try"]')!, true);
    expect(button()).toBeNull();
  });

  it("is absent with no open Quick try, even off screen", () => {
    draw(card(), null);
    expect(observers).toHaveLength(0);
    expect(button()).toBeNull();
  });

  it("shows above the message box once the open Quick try is off screen, and goes when it is back", () => {
    const { block, viewport } = draw(`<p>Earlier</p>${card()}<p>Four own questions later</p>`, "k1");
    const tryCard = block.querySelector('[data-testid="quick-try"]')!;
    expect(observers.at(-1)?.root).toBe(viewport);
    see(tryCard, false);
    const shown = button();
    expect(shown?.tagName).toBe("BUTTON");
    expect(shown?.textContent).toBe("Back to your turn");
    see(tryCard, true);
    expect(button()).toBeNull();
  });

  it("scrolls the open Quick try to the centre, smoothly, and focuses its first choice", () => {
    const { block } = draw(card(), "k1");
    const tryCard = block.querySelector<HTMLElement>('[data-testid="quick-try"]')!;
    const scrolled = vi.fn();
    tryCard.scrollIntoView = scrolled;
    see(tryCard, false);
    act(() => button()!.click());
    expect(scrolled).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(document.activeElement).toBe(tryCard.querySelector("button"));
  });

  it("jumps without animation for a Learner who asks for reduced motion", () => {
    reduce = true;
    const { block } = draw(card(), "k1");
    const tryCard = block.querySelector<HTMLElement>('[data-testid="quick-try"]')!;
    const scrolled = vi.fn();
    tryCard.scrollIntoView = scrolled;
    see(tryCard, false);
    act(() => button()!.click());
    expect(scrolled).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  });

  it("goes to the newest copy of the open Quick try (A5 re-shows it under each own-question reply)", () => {
    const { block } = draw(`${card()}<p>Reply</p>`, "k1");
    const [first] = block.querySelectorAll<HTMLElement>('[data-testid="quick-try"]');
    first.scrollIntoView = vi.fn();
    see(first, false);
    // A reply and its re-shown card arrive; the button now follows the new copy.
    act(() => block.insertAdjacentHTML("beforeend", card()));
    return Promise.resolve().then(() => {
      const copies = block.querySelectorAll<HTMLElement>('[data-testid="quick-try"]');
      const newest = copies.item(copies.length - 1);
      newest.scrollIntoView = vi.fn();
      see(newest, false);
      act(() => button()!.click());
      expect(newest.scrollIntoView).toHaveBeenCalled();
      expect(first.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("focuses the card itself when it has no choice to tap", () => {
    const { block } = draw(card(""), "k1");
    const tryCard = block.querySelector<HTMLElement>('[data-testid="quick-try"]')!;
    tryCard.scrollIntoView = vi.fn();
    see(tryCard, false);
    act(() => button()!.click());
    expect(tryCard.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(tryCard);
  });
});

describe("openQuickTryKey", () => {
  const tryLine = (key: string, id: string): ThreadLine => ({ id, role: "item", kind: QUICK_TRY, data: { key, prompt: "How many?", kind: "choice", choices: [] } }) as ThreadLine;
  const result = (key: string, id: string): ThreadLine => ({ id, role: "item", kind: QUICK_TRY_RESULT, data: { key, verdict: "right", line: "Right." } }) as ThreadLine;
  const said = (text: string, id: string): ThreadLine => ({ id, role: "user", text });

  it("is the latest Quick try while it has no result", () => {
    expect(openQuickTryKey([tryLine("a", "1"), result("a", "2"), tryLine("b", "3"), said("Why?", "4")])).toBe("b");
  });

  it("is null once the latest Quick try is answered, or when there is none", () => {
    expect(openQuickTryKey([tryLine("a", "1"), result("a", "2")])).toBeNull();
    expect(openQuickTryKey([said("Hi", "1")])).toBeNull();
  });
});
