// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "./announcer";
import { THEME_INIT_SCRIPT, parsePref } from "./theme";
import { ThemeToggle } from "./theme-toggle";

// The header's theme toggle: one icon button, a moon in Light and a sun in Dark, named and titled for what a
// press does. A press switches at once and saves; the computer's setting is never read, even on a dark computer.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let media: ReturnType<typeof vi.fn>;

const html = document.documentElement;
const cookie = (name: string) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
const button = () => host.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!;
const announcer = () => document.querySelector('[data-testid="app-announcer"]')?.textContent ?? "";
const click = (el: HTMLElement) => act(async () => el.click());
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

/** Like a page load: the cookie, then the head script, then the toggle drawn with the server's reading of the cookie. */
async function mount(saved?: string) {
  if (saved) document.cookie = `theme=${saved}; path=/`;
  new Function(THEME_INIT_SCRIPT)();
  await act(async () => {
    root.render(
      <AnnouncerProvider>
        <ThemeToggle initial={parsePref(saved)} />
      </AnnouncerProvider>,
    );
  });
}

beforeEach(() => {
  media = vi.fn(() => ({ matches: true }));
  vi.stubGlobal("matchMedia", media);
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
  document.head.querySelectorAll("style[data-theme-switch]").forEach((s) => s.remove());
});

describe("the theme toggle", () => {
  it("opens Light with no cookie, even on a dark computer: a moon named and titled Switch to dark theme, no menu", async () => {
    await mount();
    expect(html.dataset.theme).toBe("light");
    const b = button();
    expect(b.getAttribute("aria-label")).toBe("Switch to dark theme");
    expect(b.getAttribute("title")).toBe("Switch to dark theme");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("data-affordance")).toBe("icon");
    for (const attr of ["aria-haspopup", "aria-expanded", "aria-pressed"]) expect(b.hasAttribute(attr), attr).toBe(false);
    expect(b.querySelector('[data-testid="theme-icon-moon"]')!.getAttribute("class")).toBe("dark:hidden");
    expect(b.querySelector('[data-testid="theme-icon-sun"]')!.getAttribute("class")).toBe("hidden dark:block");
    expect(media).not.toHaveBeenCalled();
  });

  it("a press goes Dark at once, saves dark, renames itself and keeps focus; no menu opens", async () => {
    await mount();
    button().focus();
    await click(button());
    expect(html.dataset.theme).toBe("dark");
    expect(html.classList.contains("dark")).toBe(true);
    expect(html.style.colorScheme).toBe("dark");
    expect(html.dataset.openuiTheme).toBe("dark");
    expect(cookie("theme")).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Switch to light theme");
    expect(button().getAttribute("title")).toBe("Switch to light theme");
    expect(document.activeElement).toBe(button());
    expect(host.querySelector("[role=menu]")).toBeNull();
  });

  it("a second press goes back to Light and saves light", async () => {
    await mount();
    await click(button());
    await click(button());
    expect(html.dataset.theme).toBe("light");
    expect(html.classList.contains("dark")).toBe(false);
    expect(cookie("theme")).toBe("light");
    expect(button().getAttribute("aria-label")).toBe("Switch to dark theme");
  });

  it("tells screen readers which theme is on", async () => {
    await mount();
    await click(button());
    await wait(80);
    expect(announcer()).toBe("Dark theme on");
    await click(button());
    await wait(80);
    expect(announcer()).toBe("Light theme on");
  });

  it("opens an old pinned Forest as Dark, and a press saves light", async () => {
    await mount("single:forest");
    expect(html.dataset.theme).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Switch to light theme");
    await click(button());
    expect(cookie("theme")).toBe("light");
    expect(html.dataset.theme).toBe("light");
  });

  it("opens an old Match my Mac (system) in Light", async () => {
    await mount("system");
    expect(html.dataset.theme).toBe("light");
    expect(button().getAttribute("aria-label")).toBe("Switch to dark theme");
    expect(media).not.toHaveBeenCalled();
  });

  it("switches in one clean cut: transitions are off for one frame, then the rule is gone", async () => {
    await mount();
    const added: Node[] = [];
    const watch = new MutationObserver((records) => records.forEach((r) => added.push(...r.addedNodes)));
    watch.observe(document.head, { childList: true });
    await click(button());
    await wait(5);
    watch.disconnect();
    const calm = added.find((n): n is HTMLStyleElement => n instanceof HTMLStyleElement && n.dataset.themeSwitch !== undefined);
    expect(calm?.textContent).toContain("transition:none!important");
    expect(calm?.isConnected).toBe(false);
    expect(document.head.querySelector("style[data-theme-switch]")).toBeNull();
  });

  it("follows the page, not a cookie written behind it: a Light page offers Dark, and a press gives Dark", async () => {
    await mount();
    document.cookie = "theme=dark; path=/";
    expect(button().getAttribute("aria-label")).toBe("Switch to dark theme");
    await click(button());
    expect(html.dataset.theme).toBe("dark");
    expect(cookie("theme")).toBe("dark");
  });
});
