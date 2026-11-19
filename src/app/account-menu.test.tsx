// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installPopoverStandIn, isOpen } from "@/test/popover";
import { AccountMenu } from "./account-menu";

// The header's account menu (A5): the Learner's initial in a 28px avatar circle on a 32px ghost icon button;
// the menu is a popover that names the Learner, links to Settings and signs out through the same form post as everywhere
// else. Keyboard through useMenu, like the Topic options menu. Since audit batch 2 it is a native popover, always in the
// page and opened by the button's popovertarget; happy-dom has no Popover API, so src/test/popover.ts stands in for it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const button = () => host.querySelector<HTMLButtonElement>('[data-testid="account-menu-button"]')!;
const menu = () => host.querySelector<HTMLElement>("[role=menu]")!;
const items = () => [...host.querySelectorAll<HTMLElement>("[role=menuitem]")];
const press = (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const click = (el: HTMLElement) => act(async () => el.click());

async function mount(props: { name: string; email?: string; admin?: boolean }) {
  await act(async () => {
    root.render(<AccountMenu {...props} />);
  });
}

let uninstall: () => void;
beforeAll(() => {
  uninstall = installPopoverStandIn();
});
afterAll(() => uninstall());

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
    // The menu is in the page, closed, right after its button, which opens it (a native popover, light dismiss and all).
    expect(menu().getAttribute("popover")).toBe("auto");
    expect(isOpen(menu())).toBe(false);
    expect(button().nextElementSibling).toBe(menu());
    expect(button().getAttribute("popovertarget")).toBe(menu().id);
    expect(button().getAttribute("aria-controls")).toBe(menu().id);
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
    // Enter on a button is its click, which the browser turns into opening the popover; nothing intercepts the key.
    await press(button(), "Enter");
    expect(isOpen(menu())).toBe(false);
    await click(button());
    expect(isOpen(menu())).toBe(true);
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(menu().textContent).toContain("Asha Rao");
    expect(host.querySelector('[data-testid="account-email"]')?.textContent).toBe("asha@example.com");
    expect(items().map((i) => i.textContent)).toEqual(["Settings", "Sign out"]);
    expect(document.activeElement).toBe(items()[0]);
    expect(items()[0].getAttribute("href")).toBe("/settings");
  });

  it("draws the open menu as a popover: the name, a hairline, then the flat rows", async () => {
    await mount({ name: "Asha Rao", email: "asha@example.com" });
    await click(button());
    expect(menu().className).toMatch(/^popover\b/);
    expect(menu().className).not.toMatch(/\bborder\b|rounded-|shadow-|bg-/);
    // No placing or stacking of its own: the top layer holds it and globals.css hangs it under the button. Laid out as a
    // column only while open, so a closed menu keeps the browser's display: none.
    expect(menu().className).not.toMatch(/\b(absolute|fixed|relative|top-|right-|z-\d)/);
    expect(menu().className.split(" ")).not.toContain("flex");
    expect(menu().className).toContain("open:flex");
    const separator = menu().querySelector<HTMLElement>('[role="separator"]')!;
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
    await press(items()[0], "Home");
    expect(document.activeElement).toBe(items()[0]);
    await press(items()[0], "End");
    expect(document.activeElement).toBe(items()[1]);
    // ArrowDown on the button of an open menu enters it again.
    button().focus();
    await press(button(), "ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
    await press(items()[0], "Escape");
    expect(isOpen(menu())).toBe(false);
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button());
  });

  it("Escape is the menu's own: it cancels the browser's close request, so focus goes back to the button every time", async () => {
    await mount({ name: "Asha" });
    await click(button());
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void items()[0].dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button());
  });

  it("closes once focus moves on past it (Tab out), but not while focus moves between its rows", async () => {
    await mount({ name: "Asha" });
    await click(button());
    const blur = (from: Element, to: Element | null) =>
      act(async () => {
        from.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    await blur(items()[0], items()[1]);
    await blur(items()[1], null);
    expect(isOpen(menu())).toBe(true);
    const page = document.createElement("a");
    page.href = "/elsewhere";
    document.body.append(page);
    await blur(items()[1], page);
    expect(isOpen(menu())).toBe(false);
    expect(button().getAttribute("aria-expanded")).toBe("false");
    page.remove();
  });

  it("with no email no empty line renders", async () => {
    await mount({ name: "tools" });
    await click(button());
    expect(host.querySelector('[data-testid="account-email"]')).toBeNull();
    expect(menu().textContent).toContain("tools");
    expect(menu().textContent).not.toContain("@");
  });

  it("a press elsewhere is the browser's light dismiss: when the popover closes, the button reads collapsed again", async () => {
    await mount({ name: "Asha" });
    await click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    // No pointerdown listener of the menu's own closes it any more.
    await act(async () => void document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(isOpen(menu())).toBe(true);
    // What the browser does on a press outside: hide the popover, which fires its toggle event.
    await act(async () => menu().hidePopover());
    expect(button().getAttribute("aria-expanded")).toBe("false");
    // A second press on the button opens it again, and one more closes it.
    await click(button());
    expect(isOpen(menu())).toBe(true);
    await click(button());
    expect(isOpen(menu())).toBe(false);
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
