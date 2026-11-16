// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_COOKIE, THEME_INIT_SCRIPT, applyTheme, parseTheme, type ThemeId } from "./theme";

// ADR 0019: two themes; a first visit follows the device, and the switch's choice, kept in the `theme` cookie, wins.

const root = document.documentElement;
const shown = () => ({ theme: root.dataset.theme, scheme: root.style.colorScheme });
const clear = () => {
  root.removeAttribute("data-theme");
  root.removeAttribute("style");
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
};

afterEach(() => {
  clear();
  vi.unstubAllGlobals();
});

/** [saved cookie, device in dark mode, the theme that opens]. */
const CASES: [string | null, boolean, ThemeId][] = [
  [null, false, "light"],
  [null, true, "dark"],
  ["dark", false, "dark"],
  ["light", true, "light"],
  ["dark", true, "dark"],
  ["light", false, "light"],
  ["banana", true, "dark"],
  ["banana", false, "light"],
  ["", true, "dark"],
];

describe("parseTheme", () => {
  it("opens the saved choice, and with no readable choice follows the device", () => {
    for (const [raw, deviceDark, want] of CASES) expect(parseTheme(raw, deviceDark), `${raw} ${deviceDark}`).toBe(want);
  });
});

describe("applyTheme", () => {
  it("puts the theme and its color-scheme on <html>", () => {
    applyTheme("dark");
    expect(shown()).toEqual({ theme: "dark", scheme: "dark" });
    applyTheme("light");
    expect(shown()).toEqual({ theme: "light", scheme: "light" });
  });
});

describe("THEME_INIT_SCRIPT, the head script's copy of the logic", () => {
  for (const [raw, deviceDark, want] of CASES) {
    it(`opens ${want} for the cookie "${raw}" on a device in ${deviceDark ? "dark" : "light"} mode`, () => {
      if (raw !== null) document.cookie = `${THEME_COOKIE}=${raw}; path=/`;
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" && deviceDark }));
      new Function(THEME_INIT_SCRIPT)();
      expect(shown()).toEqual({ theme: want, scheme: want });
      expect(want).toBe(parseTheme(raw, deviceDark));
    });
  }

  it("opens Light when the browser cannot answer", () => {
    vi.stubGlobal("matchMedia", undefined);
    new Function(THEME_INIT_SCRIPT)();
    expect(shown()).toEqual({ theme: "light", scheme: "light" });
  });
});
