// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREF, THEME_SWATCH } from "../theme";
import { ThemeToggle } from "../theme-toggle";
import { AppearanceSettings } from "./settings-controls";
import { SettingsView } from "./settings-view";

// The Appearance section on the Settings page, with the header's theme toggle on screen too: both read the one store,
// so a pick in either shows in the other at once (ADR 0013: two radios, Light and Dark; no Match my Mac).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const cookie = (name: string) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
const radio = (name: string, label: string) =>
  [...host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].find((i) => i.closest("label")?.textContent?.trim() === label)!;
const checkedIn = (name: string) => [...host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].filter((i) => i.checked).map((i) => i.closest("label")!.textContent!.trim());
const click = (el: HTMLElement) => act(async () => el.click());
const toggle = () => host.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!;

beforeEach(async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.cookie = "theme=; path=/; max-age=0";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <>
        <ThemeToggle initial={DEFAULT_PREF} />
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
  it("two radios, Light and Dark, starting on Light; no Match my Mac", () => {
    const labels = [...host.querySelectorAll<HTMLInputElement>('input[name="theme"]')].map((i) => i.closest("label")!.textContent!.trim());
    expect(labels).toEqual(["Light", "Dark"]);
    expect(host.querySelectorAll("input[type=radio]")).toHaveLength(2);
    expect(checkedIn("theme")).toEqual(["Light"]);
    expect(host.textContent).not.toMatch(/Match my Mac|Day theme|Night theme|Always use one theme/);
  });

  it("picking Dark switches and saves it, and the header toggle then offers Light; pressing the toggle checks Light", async () => {
    await click(radio("theme", "Dark"));
    const html = document.documentElement;
    expect(html.dataset.theme).toBe("dark");
    expect(cookie("theme")).toBe("dark");
    expect(checkedIn("theme")).toEqual(["Dark"]);
    expect(toggle().getAttribute("aria-label")).toBe("Switch to light theme");
    await click(toggle());
    expect(html.dataset.theme).toBe("light");
    expect(checkedIn("theme")).toEqual(["Light"]);
  });

  it("gives every radio a label, previews each theme from its swatch colours, and marks the checked row", () => {
    for (const input of host.querySelectorAll("input[type=radio]")) expect(input.closest("label")?.textContent?.trim()).toBeTruthy();
    for (const theme of ["light", "dark"]) expect(host.querySelector(`[data-testid="tile-${theme}"]`), theme).not.toBeNull();
    const tile = host.querySelector<HTMLElement>('[data-testid="tile-dark"]')!;
    expect(tile.style.backgroundColor).not.toBe("");
    expect(THEME_SWATCH.dark.paper).toBe("#0b0b0b");
    const row = radio("theme", "Light").closest("label")!.querySelector("span")!;
    expect(row.className).toContain("has-[:checked]:border-[var(--accent)]");
    expect(row.className).toContain("has-[:checked]:shadow-[inset_0_0_0_1px_var(--accent)]");
    expect(row.className).toContain("min-h-11");
  });
});

describe("Appearance on the Settings page (A5)", () => {
  it("renders inside the appearance card", () => {
    const html = renderToStaticMarkup(
      <SettingsView profile={{ work: "", location: "", loan: "", savingFor: "" }} developerDetails={false} account={{ name: "Asha" }} />,
    );
    const card = html.slice(html.indexOf('id="appearance"'), html.indexOf('id="about-you"'));
    expect(card).toContain('data-testid="tile-dark"');
    expect(card.match(/type="radio"/g)).toHaveLength(2);
    expect(card).not.toContain("Match my Mac");
  });
});
