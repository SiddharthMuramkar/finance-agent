// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREF, THEME_SWATCH } from "../theme";
import { ThemeMenu } from "../theme-menu";
import { AppearanceSettings } from "./settings-controls";

// The Appearance section on the Settings page, with the header's Theme menu on screen too: both read the one store,
// so a pick in either shows in the other at once.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let osDark: boolean;
let changeListeners: Set<(e: { matches: boolean }) => void>;

const cookie = (name: string) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
const radio = (name: string, label: string) =>
  [...host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].find((i) => i.closest("label")?.textContent?.trim() === label)!;
const checkedIn = (name: string) => [...host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].filter((i) => i.checked).map((i) => i.closest("label")!.textContent!.trim());
const click = (el: HTMLElement) => act(async () => el.click());
const menuButton = () => host.querySelector<HTMLButtonElement>('[data-testid="theme-menu-button"]')!;
const menuItems = () => [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
const menuChecked = () => menuItems().filter((i) => i.getAttribute("aria-checked") === "true").map((i) => i.textContent);
const flipOs = (dark: boolean) =>
  act(async () => {
    osDark = dark;
    changeListeners.forEach((listener) => listener({ matches: dark }));
  });

beforeEach(async () => {
  osDark = false;
  changeListeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return osDark;
    },
    addEventListener: (_: string, listener: (e: { matches: boolean }) => void) => changeListeners.add(listener),
    removeEventListener: (_: string, listener: (e: { matches: boolean }) => void) => changeListeners.delete(listener),
  }));
  document.cookie = "theme=; path=/; max-age=0";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <>
        <ThemeMenu initial={DEFAULT_PREF} />
        <AppearanceSettings initial={DEFAULT_PREF} />
      </>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  for (const name of ["data-theme", "data-openui-theme", "style", "class"]) document.documentElement.removeAttribute(name);
});

describe("Settings > Appearance", () => {
  it("three tiles, no day/night pickers: Light, Dark and Match my Mac, starting on Match my Mac", () => {
    const labels = [...host.querySelectorAll<HTMLInputElement>('input[name="theme"]')].map((i) => i.closest("label")!.textContent!.trim());
    expect(labels).toEqual(["Light", "Dark", "Match my Mac"]);
    expect(host.querySelectorAll("input[type=radio]")).toHaveLength(3);
    expect(checkedIn("theme")).toEqual(["Match my Mac"]);
    expect(host.textContent).not.toMatch(/Day theme|Night theme|Always use one theme/);
  });

  it("picking Dark pins it, and the header menu shows it checked; picking Match my Mac follows the Mac live", async () => {
    await click(radio("theme", "Dark"));
    const html = document.documentElement;
    expect(html.dataset.theme).toBe("dark");
    expect(cookie("theme")).toBe("single%3Adark");
    await click(menuButton());
    expect(menuChecked()).toEqual(["Dark"]);
    await click(menuItems().find((i) => i.textContent === "Light")!);
    expect(checkedIn("theme")).toEqual(["Light"]);
    await click(radio("theme", "Match my Mac"));
    expect(cookie("theme")).toBe("system");
    await flipOs(true);
    expect(html.dataset.theme).toBe("dark");
    await flipOs(false);
    expect(html.dataset.theme).toBe("light");
  });

  it("gives every radio a label and previews each theme from its swatch colours", () => {
    for (const input of host.querySelectorAll("input[type=radio]")) expect(input.closest("label")?.textContent?.trim()).toBeTruthy();
    const tile = host.querySelector<HTMLElement>('[data-testid="tile-dark"]')!;
    expect(tile.style.backgroundColor).not.toBe("");
    expect(THEME_SWATCH.dark.bg).toBe("#141a33");
  });
});
