// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountMenu } from "./account-menu";

// The header's account menu (A5): the Learner's initial on a round button; the menu names the Learner, links to
// Settings and signs out through the same form post as everywhere else. Keyboard like the Theme menu.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const button = () => host.querySelector<HTMLButtonElement>('[data-testid="account-menu-button"]')!;
const menu = () => host.querySelector<HTMLElement>("[role=menu]");
const items = () => [...host.querySelectorAll<HTMLElement>("[role=menuitem]")];
const press = (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const click = (el: HTMLElement) => act(async () => el.click());

async function mount(props: { name: string; email?: string }) {
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
  it("is closed by default: a round button with the Learner's initial, named Account menu", async () => {
    await mount({ name: "Asha" });
    expect(button().getAttribute("aria-label")).toBe("Account menu");
    expect(button().getAttribute("aria-haspopup")).toBe("menu");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(button().textContent).toBe("A");
    expect(menu()).toBeNull();
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
});
