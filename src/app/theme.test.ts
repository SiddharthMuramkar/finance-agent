// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREF, THEMES, THEME_INIT_SCRIPT, THEME_KIND, THEME_SWATCH, applyTheme, parsePref, resolveTheme, serializePref, type ThemePref } from "./theme";

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

/** Every saved value the migration table of spec A4 names, with what parsePref must give. */
const MIGRATION: [string | null, ThemePref][] = [
  ["dark", { mode: "single", theme: "dark" }],
  ["light", { mode: "single", theme: "light" }],
  ["single:paper", { mode: "single", theme: "light" }],
  ["single:forest", { mode: "single", theme: "dark" }],
  ["single:midnight", { mode: "single", theme: "dark" }],
  ["single:light", { mode: "single", theme: "light" }],
  ["single:dark", { mode: "single", theme: "dark" }],
  ["system", { mode: "system" }],
  ["system:paper:forest", { mode: "system" }],
  ["system:light:midnight", { mode: "system" }],
  [null, { mode: "system" }],
  ["", { mode: "system" }],
  ["banana", { mode: "system" }],
];

describe("parsePref", () => {
  it("stored preferences migrate", () => {
    for (const [raw, want] of MIGRATION) expect(parsePref(raw), String(raw)).toEqual(want);
    expect(parsePref(undefined)).toEqual({ mode: "system" });
    expect(parsePref("single:neon")).toEqual({ mode: "system" });
  });

  it("saves as system or single:<theme>, and reads back what it saves", () => {
    expect(serializePref({ mode: "system" })).toBe("system");
    expect(serializePref({ mode: "single", theme: "dark" })).toBe("single:dark");
    for (const pref of [DEFAULT_PREF, ...THEMES.map((theme) => ({ mode: "single", theme }) as const)]) expect(parsePref(serializePref(pref))).toEqual(pref);
  });
});

describe("resolveTheme", () => {
  it("gives a pinned theme whatever the computer's mode", () => {
    expect(resolveTheme({ mode: "single", theme: "light" }, true)).toBe("light");
    expect(resolveTheme({ mode: "single", theme: "dark" }, false)).toBe("dark");
  });

  it("follows the computer: Light in light mode, Dark in dark mode", () => {
    expect(resolveTheme({ mode: "system" }, false)).toBe("light");
    expect(resolveTheme({ mode: "system" }, true)).toBe("dark");
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
  const SAVED = [...MIGRATION.map(([raw]) => raw ?? ""), "single:neon", "system:midnight:light"];

  for (const raw of SAVED) {
    for (const osDark of [false, true]) {
      it(`the first-paint script agrees for "${raw}" with the computer ${osDark ? "dark" : "light"}`, () => {
        clear();
        if (raw) document.cookie = `theme=${raw}; path=/`;
        const media = vi.fn(() => ({ matches: osDark }));
        vi.stubGlobal("matchMedia", media);
        new Function(THEME_INIT_SCRIPT)();
        expect(media).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
        const got = attributes();
        applyTheme(resolveTheme(parsePref(raw), osDark));
        expect(got).toEqual(attributes());
        expect(got.theme).toBe(resolveTheme(parsePref(raw), osDark));
      });
    }
  }

  it("finds the theme cookie among others, not one whose name only ends in theme", () => {
    document.cookie = "not-theme=single:dark; path=/";
    document.cookie = "theme=single:paper; path=/";
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    new Function(THEME_INIT_SCRIPT)();
    expect(root.dataset.theme).toBe("light");
    document.cookie = "not-theme=; path=/; max-age=0";
  });

  it("never throws, so a browser that blocks something still draws the page", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("blocked");
    });
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
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
      const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]+)`, "i").exec(tokens)?.[1];
      expect({ id, bg: token("bg"), ink: token("ink"), brand: token("brand-main") }).toEqual({ id, ...THEME_SWATCH[id] });
      expect(tokens).toContain(`color-scheme: ${THEME_KIND[id]}`);
    }
  });
});
