// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShowcaseTabs } from "./showcase-tabs";
import { loadShowcases } from "./showcase-widgets";

// Home's section 4 (spec 2026-11-12 E6, E8) in a browser-like page: three Showcases as tabs, one on screen, and the general
// Widget renderer asked for only when the section comes within one screen of view. The observer is a stand-in the test
// moves by hand; nothing is fetched.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const showcases = loadShowcases();
let root: Root;
let host: HTMLElement;
const fetchSpy = vi.fn(async () => new Response("{}", { status: 401 }));
const observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit; targets: Element[] }[] = [];

class Observer {
  entry: (typeof observers)[number];
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.entry = { callback, options, targets: [] };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.targets.push(el);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(async () => {
  observers.length = 0;
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("IntersectionObserver", Observer);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ShowcaseTabs showcases={showcases} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const panels = () => [...host.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
const widgets = () => host.querySelectorAll('[data-testid="showcase-widget"]');

/** The section comes within one screen of view, and the lazy renderer's chunk has time to arrive. */
async function nearView() {
  await act(async () => {
    for (const o of observers) o.callback(o.targets.map((target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry), {} as IntersectionObserver);
  });
  await act(async () => {
    // The first import of the renderer is slow (OpenUI is large), so wait for it generously.
    await vi.waitFor(() => expect(widgets().length).toBeGreaterThan(0), { timeout: 30_000 });
  });
}

describe("Home's Showcases as tabs", { timeout: 60_000 }, () => {
  it("draws no Widget until the section is within one screen of view, then only the open one's", async () => {
    expect(widgets()).toHaveLength(0);
    expect(host.querySelectorAll('[data-testid="showcase-widget-space"]')).toHaveLength(3);
    expect(observers).toHaveLength(1);
    expect(observers[0].options?.rootMargin).toBe("100% 0px");
    await nearView();
    expect(widgets()).toHaveLength(1);
    expect(panels()[0].querySelector('[data-testid="showcase-widget"]')?.textContent).toContain(showcases[0].title);
  });

  it("shows one Showcase at a time and switches with a tap", async () => {
    await nearView();
    expect(panels().map((p) => p.hidden)).toEqual([false, true, true]);
    await act(async () => tabs()[1].click());
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(panels().map((p) => p.hidden)).toEqual([true, false, true]);
    await act(async () => {
      await vi.waitFor(() => expect(panels()[1].querySelector('[data-testid="showcase-widget"]')).not.toBeNull());
    });
    expect(widgets()).toHaveLength(1);
  });

  it("moves between tabs with the arrow keys, Home and End, as the ARIA tabs pattern does", async () => {
    const key = (i: number, k: string) => act(async () => tabs()[i].dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
    await key(0, "ArrowRight");
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[1]);
    await key(1, "End");
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    await key(2, "ArrowRight");
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    await key(0, "ArrowLeft");
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("never calls fetch", async () => {
    await nearView();
    await act(async () => tabs()[2].click());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
