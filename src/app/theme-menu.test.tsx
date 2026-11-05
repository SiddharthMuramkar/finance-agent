// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeMenu } from "./theme-menu";
import { DEFAULT_PREF } from "./theme";
import { ThemeFollower, pinTheme } from "./theme-store";

// The header's Theme menu and the store behind it: picks apply at once and save, the keyboard works, and a Learner
// following the computer follows it live, on every page.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let osDark: boolean;
let changeListeners: Set<(e: { matches: boolean }) => void>;

const html = document.documentElement;
const cookie = (name: string) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
const button = () => host.querySelector<HTMLButtonElement>('[data-testid="theme-menu-button"]')!;
const items = () => [...host.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]")];
const item = (name: string) => items().find((i) => i.textContent?.startsWith(name))!;
const checked = () => items().filter((i) => i.getAttribute("aria-checked") === "true").map((i) => i.textContent);
const press = (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const click = (el: HTMLElement) => act(async () => el.click());
const flipOs = (dark: boolean) =>
  act(async () => {
    osDark = dark;
    changeListeners.forEach((listener) => listener({ matches: dark }));
  });

async function mount(saved?: string) {
  if (saved) document.cookie = `theme=${saved}; path=/`;
  await act(async () => {
    root.render(<ThemeMenu initial={DEFAULT_PREF} />);
  });
}

beforeEach(() => {
  osDark = false;
  changeListeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return osDark;
    },
    addEventListener: (_: string, listener: (e: { matches: boolean }) => void) => changeListeners.add(listener),
    removeEventListener: (_: string, listener: (e: { matches: boolean }) => void) => changeListeners.delete(listener),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  document.cookie = "theme=; path=/; max-age=0";
  for (const name of ["data-theme", "data-openui-theme", "style", "class"]) html.removeAttribute(name);
});

describe("the Theme menu", () => {
  it("names the button for the theme in use, and for what the computer gives while following it", async () => {
    osDark = true;
    await mount();
    expect(button().getAttribute("aria-label")).toBe("Theme: Dark");
    expect(button().getAttribute("aria-haspopup")).toBe("menu");
  });

  it("three choices: Light, Dark, Match my Mac, in that order, each with three dots", async () => {
    await mount();
    await click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(items().map((i) => i.textContent)).toEqual(["Light", "Dark", "Match my Mac"]);
    for (const row of items()) expect(row.querySelectorAll('[data-testid^="swatch-"] > span')).toHaveLength(3);
    expect(checked()).toEqual(["Match my Mac"]);
  });

  it("applies a pick at once, saves it, closes and returns focus to the button", async () => {
    await mount();
    await click(button());
    await click(item("Dark"));
    expect(html.dataset.theme).toBe("dark");
    expect(html.classList.contains("dark")).toBe(true);
    expect(html.style.colorScheme).toBe("dark");
    expect(html.dataset.openuiTheme).toBe("dark");
    expect(cookie("theme")).toBe("single%3Adark");
    expect(host.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(button().getAttribute("aria-label")).toBe("Theme: Dark");
  });

  it("works from the keyboard alone: ArrowDown opens on the checked item, the arrows move and wrap, Escape returns", async () => {
    await mount("single:light");
    button().focus();
    await press(button(), "ArrowDown");
    expect(document.activeElement).toBe(item("Light"));
    expect(item("Light").getAttribute("aria-checked")).toBe("true");
    await press(item("Light"), "ArrowDown");
    expect(document.activeElement).toBe(item("Dark"));
    await press(item("Dark"), "End");
    expect(document.activeElement).toBe(item("Match my Mac"));
    await press(item("Match my Mac"), "ArrowDown");
    expect(document.activeElement).toBe(item("Light"));
    await press(item("Light"), "ArrowUp");
    expect(document.activeElement).toBe(item("Match my Mac"));
    await press(item("Match my Mac"), "Escape");
    expect(host.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(html.dataset.theme).toBeUndefined();
  });

  it("closes when the Learner presses elsewhere", async () => {
    await mount();
    await click(button());
    await act(async () => void document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(host.querySelector("[role=menu]")).toBeNull();
  });

  it("Match my Mac follows the computer again after a theme was pinned", async () => {
    osDark = true;
    await mount("single:light");
    await click(button());
    expect(checked()).toEqual(["Light"]);
    await click(item("Match my Mac"));
    expect(cookie("theme")).toBe("system");
    expect(html.dataset.theme).toBe("dark");
  });

  it("opens an old saved Paper, Forest or Midnight as Light or Dark", async () => {
    await mount("single:forest");
    await click(button());
    expect(checked()).toEqual(["Dark"]);
    await click(item("Light"));
    expect(cookie("theme")).toBe("single%3Alight");
  });
});

describe("following the computer live", () => {
  it("switches the theme and the button's name while following", async () => {
    await mount();
    await flipOs(true);
    expect(html.dataset.theme).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Theme: Dark");
    await flipOs(false);
    expect(html.dataset.theme).toBe("light");
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("leaves a pinned theme alone", async () => {
    await mount("single:light");
    await act(async () => pinTheme("light"));
    await flipOs(true);
    expect(html.dataset.theme).toBe("light");
    expect(button().getAttribute("aria-label")).toBe("Theme: Light");
  });

  it("follows on a page with no header, through ThemeFollower", async () => {
    await act(async () => root.render(<ThemeFollower />));
    await flipOs(true);
    expect(html.dataset.theme).toBe("dark");
    await act(async () => root.render(<></>));
    expect(changeListeners.size).toBe(0);
  });
});
