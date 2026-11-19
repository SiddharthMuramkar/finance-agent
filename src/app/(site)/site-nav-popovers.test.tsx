// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The site nav's two overlays in a browser (audit batch 2): Menu and the avatar open native popovers (popover="auto"),
// whose toggle events keep each button's aria-expanded, and Menu's Menu/Close label (spec 4.2), true to what is showing.
// Esc and a press outside are the browser's own; the nav closes the sheet on a route change or once the window is wider
// than 860 px, and either overlay once focus moves on past both ends of it. happy-dom has no Popover API, so a small
// stand-in below shows and hides, answers :popover-open and fires toggle events as a browser does.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => at.path,
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {} }),
}));

const { SiteNav } = await import("./site-nav");

const showing = new WeakSet<Element>();
const fire = (el: Element, newState: "open" | "closed") =>
  el.dispatchEvent(Object.assign(new Event("toggle"), { newState, oldState: newState === "open" ? "closed" : "open" }));
const realMatches = Element.prototype.matches;
const popoverApi = {
  showPopover(this: HTMLElement) {
    if (showing.has(this)) return;
    showing.add(this);
    fire(this, "open");
  },
  hidePopover(this: HTMLElement) {
    if (!showing.has(this)) return;
    showing.delete(this);
    fire(this, "closed");
  },
};

beforeAll(() => {
  Object.assign(HTMLElement.prototype, popoverApi);
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ":popover-open" ? showing.has(this) : realMatches.call(this, selector);
  };
});
afterAll(() => {
  for (const name of Object.keys(popoverApi)) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  Element.prototype.matches = realMatches;
});

/** The phone breakpoint as matchMedia reports it, so a test can widen the window. */
const phone = { matches: true, listeners: new Set<() => void>() };

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  at.path = "/about";
  phone.matches = true;
  phone.listeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === "(max-width: 860px)" ? phone.matches : false;
    },
    addEventListener: (_: string, listener: () => void) => phone.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => phone.listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const visitor = { state: "visitor" } as const;
const member = { state: "member", name: "Asha Rao", button: { label: "Continue", href: "/study" } } as never;
const draw = (viewer: Parameters<typeof SiteNav>[0]["viewer"]) => act(async () => root.render(<SiteNav viewer={viewer} />));
const menuButton = () => host.querySelector<HTMLButtonElement>(".v-menu-btn")!;
const sheet = () => host.querySelector<HTMLElement>("#site-menu")!;
const avatar = () => host.querySelector<HTMLButtonElement>(".v-account-btn")!;
const accountMenu = () => host.querySelector<HTMLElement>(`[id="${avatar().getAttribute("aria-controls")}"]`)!;
const open = (popover: HTMLElement) => act(async () => popover.showPopover());
const close = (popover: HTMLElement) => act(async () => popover.hidePopover());
/** Focus leaving `from` for `to` (null: the window lost focus), then the tick the nav waits before it closes anything. */
const blur = (from: Element, to: Element | null) =>
  act(async () => {
    from.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("the phone Menu sheet", () => {
  it("reads Menu, collapsed, until its sheet opens; then Close, expanded; then Menu again once it closes", async () => {
    await draw(visitor);
    expect(menuButton().textContent).toBe("Menu");
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(menuButton().getAttribute("aria-controls")).toBe("site-menu");
    expect(sheet().getAttribute("popover")).toBe("auto");

    await open(sheet());
    expect(menuButton().textContent).toBe("Close");
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");

    // Esc, a press outside or Close itself: the browser hides the popover and its toggle event says so.
    await close(sheet());
    expect(menuButton().textContent).toBe("Menu");
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on a route change: it belongs to the page it was opened on", async () => {
    await draw(visitor);
    await open(sheet());
    at.path = "/examples";
    await draw(visitor);
    expect(showing.has(sheet())).toBe(false);
    expect(menuButton().textContent).toBe("Menu");
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes once the window is wider than 860 px, where the Menu button steps aside", async () => {
    await draw(visitor);
    await open(sheet());
    await act(async () => {
      phone.matches = false;
      for (const listener of phone.listeners) listener();
    });
    expect(showing.has(sheet())).toBe(false);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("stays open while focus moves from Menu through its rows, and closes once focus moves on past it", async () => {
    await draw(visitor);
    await open(sheet());
    const rows = [...sheet().querySelectorAll<HTMLElement>("a, button")];
    await blur(menuButton(), rows[0]);
    await blur(rows[0], rows[1]);
    await blur(rows.at(-1)!, null);
    expect(showing.has(sheet())).toBe(true);
    // Tab past the theme row, on to the page under the sheet.
    const page = document.createElement("a");
    page.href = "/elsewhere";
    document.body.append(page);
    await blur(rows.at(-1)!, page);
    expect(showing.has(sheet())).toBe(false);
    page.remove();
  });
});

describe("the account menu", () => {
  it("keeps the avatar's aria-expanded true to the menu's toggle events", async () => {
    await draw(member);
    expect(avatar().getAttribute("aria-label")).toBe("Account menu");
    expect(avatar().getAttribute("aria-expanded")).toBe("false");
    expect(accountMenu().getAttribute("popover")).toBe("auto");
    await open(accountMenu());
    expect(avatar().getAttribute("aria-expanded")).toBe("true");
    await close(accountMenu());
    expect(avatar().getAttribute("aria-expanded")).toBe("false");
  });

  it("stays open while focus moves from the avatar into its links, and closes once focus moves on past it", async () => {
    await draw(member);
    await open(accountMenu());
    const rows = [...accountMenu().querySelectorAll<HTMLElement>("a, button")];
    expect(rows.map((row) => row.textContent)).toEqual(["Course map", "Notebook", "Account settings", "Sign out"]);
    await blur(avatar(), rows[0]);
    await blur(rows[2], rows[3]);
    expect(showing.has(accountMenu())).toBe(true);
    // Tab from Sign out on to the theme switch beside the avatar.
    await blur(rows[3], host.querySelector(".v-theme-btn"));
    expect(showing.has(accountMenu())).toBe(false);
    expect(avatar().getAttribute("aria-expanded")).toBe("false");
  });
});
