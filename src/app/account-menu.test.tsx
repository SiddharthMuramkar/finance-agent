// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

// The header's account menu (A5): the Learner's initial in a 28px avatar circle on a 32px ghost icon button;
// the menu is a popover that names the Learner, links to Settings and signs out through the same form post as everywhere
// else. Keyboard through useMenu, like the Topic options menu.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const button = () => host.querySelector<HTMLButtonElement>('[data-testid="account-menu-button"]')!;
const menu = () => host.querySelector<HTMLElement>("[role=menu]");
const items = () => [...host.querySelectorAll<HTMLElement>("[role=menuitem]")];
const press = (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const click = (el: HTMLElement) => act(async () => el.click());

async function mount(props: { name: string; email?: string; admin?: boolean }) {
  await act(async () => {
    root.render(<AccountMenu {...props} />);
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("account menu", () => {
  it("is closed by default: a ghost icon button with the Learner's initial in an avatar circle, named Account menu", async () => {
    await mount({ name: "Asha" });
    expect(button().getAttribute("aria-label")).toBe("Account menu");
    expect(button().getAttribute("title")).toBe("Account menu");
    expect(button().getAttribute("aria-haspopup")).toBe("menu");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(button().textContent).toBe("A");
    expect(button().className).toMatch(/^btn btn-icon\b/);
    const avatar = button().querySelector<HTMLElement>('[data-testid="account-avatar"]')!;
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatar.className).toMatch(/\bh-7 w-7\b.*\brounded-full\b/);
    expect(menu()).toBeNull();
  });

  it("paints the avatar in neutral tokens (a wash face, a --line edge, an --ink-2 initial), with no lip and no per-theme patch", async () => {
    await mount({ name: "Asha" });
    const avatar = button().querySelector<HTMLElement>('[data-testid="account-avatar"]')!;
    for (const token of ["bg-[var(--wash)]", "border-[var(--line)]", "text-[var(--ink-2)]"]) expect(avatar.className).toContain(token);
    expect(button().className).not.toMatch(/--lip|--rim|--brand|\[\.dark_&\]/);
    // While the menu is open the button keeps a washed face.
    expect(button().className).toContain("aria-expanded:[--face:var(--wash)]");
  });

  it("Enter opens it, on Settings first; it shows the name and, when given, the email", async () => {
    await mount({ name: "Asha Rao", email: "asha@example.com" });
    button().focus();
    await press(button(), "Enter");
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(menu()).not.toBeNull();
    expect(menu()!.textContent).toContain("Asha Rao");
    expect(host.querySelector('[data-testid="account-email"]')?.textContent).toBe("asha@example.com");
    expect(items().map((i) => i.textContent)).toEqual(["Settings", "Sign out"]);
    expect(document.activeElement).toBe(items()[0]);
    expect(items()[0].getAttribute("href")).toBe("/settings");
  });

  it("draws the open menu as a popover: the name, a hairline, then the flat rows", async () => {
    await mount({ name: "Asha Rao", email: "asha@example.com" });
    await click(button());
    expect(menu()!.className).toMatch(/^popover\b/);
    expect(menu()!.className).not.toMatch(/\bborder\b|rounded-|shadow-|bg-/);
    const separator = menu()!.querySelector<HTMLElement>('[role="separator"]')!;
    expect(separator.className).toContain("bg-[var(--rule)]");
    expect(separator.previousElementSibling?.textContent).toContain("Asha Rao");
    expect(separator.nextElementSibling).toBe(items()[0]);
    for (const item of items()) expect(item.className).toMatch(/\bmenu-item\b/);
  });

  it("Sign out is inside a plain form that posts to the sign-out route", async () => {
    await mount({ name: "Asha" });
    await click(button());
    const signOut = items().find((i) => i.textContent === "Sign out")!;
    const form = signOut.closest("form");
    expect(form?.getAttribute("action")).toBe("/api/logout");
    expect(form?.getAttribute("method")).toBe("post");
    expect(signOut.getAttribute("type")).toBe("submit");
  });

  it("the arrows move between the items and wrap; Escape closes and focus returns to the button", async () => {
    await mount({ name: "Asha" });
    button().focus();
    await press(button(), "ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
    await press(items()[0], "ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    await press(items()[1], "ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
    await press(items()[0], "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("with no email no empty line renders", async () => {
    await mount({ name: "tools" });
    await click(button());
    expect(host.querySelector('[data-testid="account-email"]')).toBeNull();
    expect(menu()!.textContent).toContain("tools");
    expect(menu()!.textContent).not.toContain("@");
  });

  it("closes when the Learner presses elsewhere", async () => {
    await mount({ name: "Asha" });
    await click(button());
    await act(async () => void document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(menu()).toBeNull();
  });

  // ADR 0017, issue #33: the admin's menu has an Admin row above Settings. Who waits is Clerk's Waitlist now, so the row
  // carries no count. Everyone else's menu has no Admin row.
  it("the admin's menu has Admin above Settings, with no waiting count", async () => {
    await mount({ name: "owner", email: "owner@example.com", admin: true });
    await click(button());
    expect(items().map((i) => i.textContent)).toEqual(["Admin", "Settings", "Sign out"]);
    expect(items()[0].getAttribute("href")).toBe("/admin");
    expect(items()[0].querySelector('[data-affordance="tag"]')).toBeNull();
  });

  it("anyone else has no Admin row", async () => {
    await mount({ name: "Asha", email: "asha@example.com" });
    await click(button());
    expect(items().map((i) => i.textContent)).toEqual(["Settings", "Sign out"]);
    expect(host.querySelector('a[href="/admin"]')).toBeNull();
  });
});

/** A screen of this width, by the matchMedia queries the screen-size rule asks (./screen). */
const screenOf = (width: number) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: width >= Number(query.match(/(\d+)px/)?.[1]),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

// ADR 0019 and spec #68, #84: a phone's one-line app bar has no room for the sun/moon switch beside the gear and this
// menu, so on a phone the switch is a row here, after Settings, with a word beside the icon as in the site's Menu sheet.
describe("account menu, the theme switch row", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
  });

  it("on a phone, the switch is a row after Settings, with a word beside the icon, and the arrows reach it", async () => {
    screenOf(360);
    await mount({ name: "Asha" });
    button().focus();
    await press(button(), "ArrowDown");
    const rows = items();
    expect(rows.map((i) => i.getAttribute("aria-label") ?? i.textContent)).toEqual(["Settings", "Switch to dark theme", "Sign out"]);
    const theme = rows[1];
    expect(theme.getAttribute("data-testid")).toBe("theme-switch");
    expect(theme.className).toMatch(/\bmenu-item\b/);
    expect(theme.querySelector("span.theme-show-light")?.textContent).toBe("Dark theme");
    expect(theme.querySelector("span.theme-show-dark")?.textContent).toBe("Light theme");
    expect(document.activeElement).toBe(rows[0]);
    await press(rows[0], "ArrowDown");
    expect(document.activeElement).toBe(theme);
  });

  it("on a phone, a press on the row flips the theme and the menu stays open on it", async () => {
    screenOf(390);
    await mount({ name: "Asha" });
    await click(button());
    items()[1].focus();
    await click(items()[1]);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(menu()).not.toBeNull();
    expect(items()[1].getAttribute("aria-label")).toBe("Switch to light theme");
    expect(document.activeElement).toBe(items()[1]);
  });

  it("from 768 px there is no row: the switch sits in the app bar", async () => {
    for (const width of [768, 1024, 1512]) {
      screenOf(width);
      await mount({ name: "Asha", admin: true });
      await click(button());
      expect(items().map((i) => i.textContent), `${width} px`).toEqual(["Admin", "Settings", "Sign out"]);
      expect(host.querySelector('[data-testid="theme-switch"]'), `${width} px`).toBeNull();
      await click(button());
      vi.unstubAllGlobals();
    }
  });
});
