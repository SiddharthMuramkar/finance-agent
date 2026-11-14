// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREF, THEMES, THEME_INIT_SCRIPT, THEME_KIND, THEME_SWATCH, TOGGLE_LABEL, applyTheme, parsePref, type ThemePref } from "./theme";

const root = document.documentElement;
const attributes = () => ({ theme: root.dataset.theme, dark: root.classList.contains("dark"), scheme: root.style.colorScheme, openui: root.dataset.openuiTheme });
const clear = () => {
  root.removeAttribute("data-theme");
  root.removeAttribute("data-openui-theme");
  root.removeAttribute("style");
  root.removeAttribute("class");
  document.cookie = "theme=; path=/; max-age=0";
};

afterEach(() => {
  clear();
  vi.unstubAllGlobals();
});

/** Every saved value there has ever been, with the theme it opens (ADR 0013: only Dark's own values open Dark). */
const MIGRATION: [string | null, ThemePref][] = [
  ["dark", "dark"],
  ["single:dark", "dark"],
  ["single:midnight", "dark"],
  ["single:forest", "dark"],
  ["light", "light"],
  ["single:light", "light"],
  ["single:paper", "light"],
  ["single:neon", "light"],
  ["system", "light"],
  ["system:paper:forest", "light"],
  ["system:light:midnight", "light"],
  [null, "light"],
  ["", "light"],
  ["banana", "light"],
  ["darkish", "light"],
  ["Dark", "light"],
];

describe("parsePref", () => {
  it("opens Dark only from dark and the old pinned dark themes; everything else, Match my Mac included, opens Light", () => {
    for (const [raw, want] of MIGRATION) expect(parsePref(raw), String(raw)).toBe(want);
    expect(parsePref(undefined)).toBe("light");
  });

  it("starts everyone in Light", () => {
    expect(DEFAULT_PREF).toBe("light");
  });
});

describe("TOGGLE_LABEL", () => {
  it("names the toggle for what a press does", () => {
    expect(TOGGLE_LABEL).toEqual({ light: "Switch to dark theme", dark: "Switch to light theme" });
  });
});

describe("applyTheme", () => {
  it("sets the four things on <html>, and takes off what the last theme set", () => {
    applyTheme("dark");
    expect(attributes()).toEqual({ theme: "dark", dark: true, scheme: "dark", openui: "dark" });
    applyTheme("light");
    expect(attributes()).toEqual({ theme: "light", dark: false, scheme: "light", openui: "light" });
  });
});

describe("THEME_INIT_SCRIPT, the head script's copy of the logic", () => {
  const SAVED = [...MIGRATION.map(([raw]) => raw ?? ""), "system:midnight:light"];

  for (const raw of SAVED) {
    for (const osDark of [false, true]) {
      it(`the first-paint script agrees for "${raw}" with the computer ${osDark ? "dark" : "light"}, and never asks the computer`, () => {
        clear();
        if (raw) document.cookie = `theme=${raw}; path=/`;
        const media = vi.fn(() => ({ matches: osDark }));
        vi.stubGlobal("matchMedia", media);
        new Function(THEME_INIT_SCRIPT)();
        expect(media).not.toHaveBeenCalled();
        const got = attributes();
        applyTheme(parsePref(raw));
        expect(got).toEqual(attributes());
        expect(got.theme).toBe(parsePref(raw));
      });
    }
  }

  it("reads an encoded value: single%3Adark opens Dark", () => {
    document.cookie = "theme=single%3Adark; path=/";
    new Function(THEME_INIT_SCRIPT)();
    expect(root.dataset.theme).toBe("dark");
  });

  it("finds the theme cookie among others, not one whose name only ends in theme", () => {
    document.cookie = "not-theme=dark; path=/";
    document.cookie = "theme=single:paper; path=/";
    new Function(THEME_INIT_SCRIPT)();
    expect(root.dataset.theme).toBe("light");
    document.cookie = "not-theme=; path=/; max-age=0";
  });

  it("never throws, so a broken cookie still draws the page (in Light)", () => {
    document.cookie = "theme=%E0%A4%A; path=/";
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(root.classList.contains("dark")).toBe(false);
  });
});

describe("THEME_SWATCH", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const block = (selector: string) => {
    // The theme's own block starts with its color-scheme line; other rules share these selectors.
    const at = css.indexOf(`${selector} {\n${selector === ":root" ? "  " : "    "}color-scheme`);
    if (at < 0) throw new Error(`no ${selector} block in globals.css`);
    return css.slice(at, css.indexOf("}", at));
  };
  const SELECTOR = { light: ":root", dark: ":root.dark" } as const;

  it("swatches equal the stylesheet", () => {
    for (const id of THEMES) {
      const tokens = block(SELECTOR[id]);
      const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]+)`, "i").exec(tokens)?.[1]?.toLowerCase();
      expect({ id, paper: token("paper"), ink: token("ink"), accent: token("accent-fill") }).toEqual({ id, ...THEME_SWATCH[id] });
      expect(tokens).toContain(`color-scheme: ${THEME_KIND[id]}`);
    }
  });
});
