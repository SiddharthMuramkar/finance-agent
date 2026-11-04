// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREF, THEMES, THEME_INIT_SCRIPT, THEME_KIND, THEME_SWATCH, applyTheme, parsePref, resolveTheme, serializePref } from "./theme";

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

describe("parsePref", () => {
  it("moves the old saved values to a pinned theme", () => {
    expect(parsePref("dark")).toEqual({ mode: "single", theme: "midnight" });
    expect(parsePref("light")).toEqual({ mode: "single", theme: "light" });
  });

  it("reads a pinned theme and a day and night pair", () => {
    expect(parsePref("single:forest")).toEqual({ mode: "single", theme: "forest" });
    expect(parsePref("system:paper:forest")).toEqual({ mode: "system", day: "paper", night: "forest" });
  });

  it("falls back to following the computer on anything unreadable", () => {
    for (const raw of ["system:midnight:light", "", "garbage", "single:neon", "system:light", null, undefined]) expect(parsePref(raw)).toEqual(DEFAULT_PREF);
  });

  it("reads back what it saves", () => {
    for (const pref of [DEFAULT_PREF, { mode: "system", day: "paper", night: "forest" } as const, ...THEMES.map((theme) => ({ mode: "single", theme }) as const)]) {
      expect(parsePref(serializePref(pref))).toEqual(pref);
    }
  });
});

describe("resolveTheme", () => {
  it("gives a pinned theme whatever the computer's mode", () => {
    expect(resolveTheme({ mode: "single", theme: "paper" }, true)).toBe("paper");
    expect(resolveTheme({ mode: "single", theme: "forest" }, false)).toBe("forest");
  });

  it("gives the day theme in light mode and the night theme in dark mode", () => {
    const pair = { mode: "system", day: "paper", night: "forest" } as const;
    expect(resolveTheme(pair, false)).toBe("paper");
    expect(resolveTheme(pair, true)).toBe("forest");
  });
});

describe("applyTheme", () => {
  it("sets the four things on <html>, and takes off what the last theme set", () => {
    applyTheme("forest");
    expect(attributes()).toEqual({ theme: "forest", dark: true, scheme: "dark", openui: "dark" });
    applyTheme("paper");
    expect(attributes()).toEqual({ theme: "paper", dark: false, scheme: "light", openui: "light" });
  });
});

describe("THEME_INIT_SCRIPT, the head script's copy of the logic", () => {
  const SAVED = ["dark", "light", "", "garbage", "single:neon", "system:midnight:light", "system:light", ...THEMES.map((t) => `single:${t}`)];
  for (const day of ["light", "paper"]) for (const night of ["midnight", "forest"]) SAVED.push(`system:${day}:${night}`);

  for (const raw of SAVED) {
    for (const osDark of [false, true]) {
      it(`matches parsePref, resolveTheme and applyTheme for "${raw}" with the computer ${osDark ? "dark" : "light"}`, () => {
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
    document.cookie = "not-theme=single:forest; path=/";
    document.cookie = "theme=single:paper; path=/";
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    new Function(THEME_INIT_SCRIPT)();
    expect(root.dataset.theme).toBe("paper");
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
    const at = css.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`no ${selector} block in globals.css`);
    return css.slice(at, css.indexOf("}", at));
  };
  const SELECTOR = { light: ":root", paper: ':root[data-theme="paper"]', midnight: ":root.dark", forest: ':root.dark[data-theme="forest"]' } as const;

  it("copies each theme's colours from globals.css", () => {
    for (const id of THEMES) {
      const tokens = block(SELECTOR[id]);
      const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]+)`, "i").exec(tokens)?.[1];
      expect({ id, bg: token("bg"), ink: token("ink"), brand: token("brand") }).toEqual({ id, ...THEME_SWATCH[id] });
      expect(tokens).toContain(`color-scheme: ${THEME_KIND[id]}`);
    }
  });
});
