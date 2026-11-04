// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeMenu } from "./theme-menu";
import { DEFAULT_PREF } from "./theme";
import { ThemeFollower, setThemePref } from "./theme-store";

// The header's Theme menu and the store behind it: picks apply at once and save, the keyboard works, and a Learner
// following the computer follows it live, on every page and with a pair that survives pinning a theme.

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
  for (const name of ["theme", "theme-pair"]) document.cookie = `${name}=; path=/; max-age=0`;
  for (const name of ["data-theme", "data-openui-theme", "style", "class"]) html.removeAttribute(name);
});

describe("the Theme menu", () => {
  it("names the button for the theme in use, and for what the computer gives while following it", async () => {
    osDark = true;
    await mount();
    expect(button().getAttribute("aria-label")).toBe("Theme: Midnight");
    expect(button().getAttribute("aria-haspopup")).toBe("menu");
  });

  it("offers Match my Mac with the pair, then the four themes, each with three dots", async () => {
    await mount();
    await click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(items().map((i) => i.textContent)).toEqual(["Match my MacLight by day, Midnight at night", "Light", "Paper", "Midnight", "Forest"]);
    for (const row of items()) expect(row.querySelectorAll('[data-testid^="swatch-"] > span')).toHaveLength(3);
    expect(checked()).toEqual(["Match my MacLight by day, Midnight at night"]);
  });

  it("applies a pick at once, saves it, closes and returns focus to the button", async () => {
    await mount();
    await click(button());
    await click(item("Forest"));
    expect(html.dataset.theme).toBe("forest");
    expect(html.classList.contains("dark")).toBe(true);
    expect(html.style.colorScheme).toBe("dark");
    expect(html.dataset.openuiTheme).toBe("dark");
    expect(cookie("theme")).toBe("single:forest");
    expect(host.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(button().getAttribute("aria-label")).toBe("Theme: Forest");
  });

  it("works from the keyboard alone: ArrowDown opens on the checked item, the arrows move and wrap, Escape returns", async () => {
    await mount("single:paper");
    button().focus();
    await press(button(), "ArrowDown");
    expect(document.activeElement).toBe(item("Paper"));
    expect(item("Paper").getAttribute("aria-checked")).toBe("true");
    await press(item("Paper"), "ArrowDown");
    expect(document.activeElement).toBe(item("Midnight"));
    await press(item("Midnight"), "End");
    await press(item("Forest"), "ArrowDown");
    expect(document.activeElement).toBe(item("Match my Mac"));
    await press(item("Match my Mac"), "ArrowUp");
    expect(document.activeElement).toBe(item("Forest"));
    await press(item("Forest"), "Escape");
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

  it("Match my Mac comes back to the saved pair after a theme was pinned", async () => {
    await mount("system:paper:forest");
    await act(async () => setThemePref({ mode: "system", day: "paper", night: "forest" }));
    await click(button());
    await click(item("Midnight"));
    expect(cookie("theme")).toBe("single:midnight");
    await click(button());
    expect(item("Match my Mac").textContent).toContain("Paper by day, Forest at night");
    await click(item("Match my Mac"));
    expect(cookie("theme")).toBe("system:paper:forest");
    expect(html.dataset.theme).toBe("paper");
  });

  it("uses Light and Midnight when no pair was ever saved, as after an old dark cookie", async () => {
    await mount("dark");
    await click(button());
    expect(checked()).toEqual(["Midnight"]);
    await click(item("Match my Mac"));
    expect(cookie("theme")).toBe("system:light:midnight");
  });
});

describe("following the computer live", () => {
  it("switches the theme and the button's name while following", async () => {
    await mount();
    await flipOs(true);
    expect(html.dataset.theme).toBe("midnight");
    expect(button().getAttribute("aria-label")).toBe("Theme: Midnight");
    await flipOs(false);
    expect(html.dataset.theme).toBe("light");
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("leaves a pinned theme alone", async () => {
    await mount("single:paper");
    await act(async () => setThemePref({ mode: "single", theme: "paper" }));
    await flipOs(true);
    expect(html.dataset.theme).toBe("paper");
    expect(button().getAttribute("aria-label")).toBe("Theme: Paper");
  });

  it("follows on a page with no header, through ThemeFollower", async () => {
    await act(async () => root.render(<ThemeFollower />));
    await flipOs(true);
    expect(html.dataset.theme).toBe("midnight");
    await act(async () => root.render(<></>));
    expect(changeListeners.size).toBe(0);
  });
});
