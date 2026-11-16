// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBarThemeSwitch, ThemeSwitch } from "./theme-switch";

// The sun/moon switch in the app (ADR 0019): an icon in the app bar from 768 px. A phone's bar has no room for it beside
// the gear and the account menu (spec #68, #84: one line at 360 px), so there it is a row of the account menu instead
// (account-menu.test.tsx) and the bar does not draw it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement;

/** A screen `width` px wide, by the matchMedia queries the screen-size rule asks; `turn` resizes it and tells the listeners. */
function screen(width: number) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return width >= Number(query.match(/(\d+)px/)?.[1]);
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    turn: (to: number) =>
      act(() => {
        width = to;
        listeners.forEach((listener) => listener());
      }),
  };
}

const switches = () => host.querySelectorAll('[data-testid="theme-switch"]');

async function mount(node: ReactNode) {
  root = createRoot(host);
  await act(async () => root!.render(node));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  delete document.documentElement.dataset.theme;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("the app bar's theme switch", () => {
  it("is drawn by the server as a 32px ghost icon with a tooltip, hidden by CSS below 768 px so a phone's first frame fits", () => {
    const html = renderToString(<AppBarThemeSwitch />);
    expect(html.match(/data-testid="theme-switch"/g)).toHaveLength(1);
    const tag = html.match(/<button[^>]*>/)![0];
    expect(tag).toContain('class="btn btn-icon max-md:hidden"');
    expect(tag).toContain('data-affordance="icon"');
    expect(tag).toContain('aria-label="Switch to dark theme"');
    expect(tag).toContain('title="Switch to dark theme"');
    expect(tag).not.toContain("role=");
  });

  it("is in the bar on a tablet or a laptop, and not mounted at all on a phone", async () => {
    for (const [width, count] of [[1512, 1], [1024, 1], [768, 1], [767, 0], [390, 0], [360, 0]] as const) {
      screen(width);
      await mount(<AppBarThemeSwitch />);
      expect(switches(), `${width} px`).toHaveLength(count);
      await act(async () => root!.unmount());
      root = undefined;
      vi.unstubAllGlobals();
    }
  });

  it("follows the screen as it turns across 768 px", async () => {
    const { turn } = screen(390);
    await mount(<AppBarThemeSwitch />);
    expect(switches()).toHaveLength(0);
    turn(844);
    expect(switches()).toHaveLength(1);
    turn(390);
    expect(switches()).toHaveLength(0);
  });

  it("hydrates on a phone as the server drew it, then lets it go, with no mismatch", async () => {
    screen(360);
    host.innerHTML = renderToString(<AppBarThemeSwitch />);
    expect(switches()).toHaveLength(1);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(host, <AppBarThemeSwitch />);
    });
    expect(switches()).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("the theme switch as a menu row", () => {
  it("is a menuitem with a word beside the icon and no tooltip, and a press flips the theme", async () => {
    await mount(<ThemeSwitch role="menuitem" className="menu-item" text={{ light: "Dark theme", dark: "Light theme" }} />);
    const row = host.querySelector<HTMLButtonElement>('[data-testid="theme-switch"]')!;
    expect(row.getAttribute("role")).toBe("menuitem");
    expect(row.getAttribute("data-affordance")).toBe("button");
    expect(row.className).toBe("menu-item");
    expect(row.hasAttribute("title")).toBe(false);
    expect(row.querySelector("span.theme-show-light")?.textContent).toBe("Dark theme");
    expect(row.querySelector("span.theme-show-dark")?.textContent).toBe("Light theme");
    expect(row.getAttribute("aria-label")).toBe("Switch to dark theme");
    await act(async () => row.click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(row.getAttribute("aria-label")).toBe("Switch to light theme");
  });
});
