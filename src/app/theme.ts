// The two themes, Light and Dark, and how a saved choice turns into one of them (ADR 0013; spec 2026-11-05 ticket A4).
// Everyone starts in Light; the computer's setting is never read. Used on the server and in the browser, so nothing here
// touches the document until a function is called.

export const THEMES = ["light", "dark"] as const;
export type ThemeId = (typeof THEMES)[number];
export const THEME_KIND: Record<ThemeId, "light" | "dark"> = { light: "light", dark: "dark" };
export const THEME_LABEL: Record<ThemeId, string> = { light: "Light", dark: "Dark" };

/** The header toggle's accessible name and tooltip in each theme: what pressing it does (the enjoy.dev wording). */
export const TOGGLE_LABEL: Record<ThemeId, string> = { light: "Switch to dark theme", dark: "Switch to light theme" };

/**
 * The page, text and accent colour of each theme, copied from globals.css for the Settings tiles, which show a theme
 * other than the one the page is in (the tokens only hold the current one). A test keeps these equal to globals.css.
 */
export const THEME_SWATCH: Record<ThemeId, { paper: string; ink: string; accent: string }> = {
  light: { paper: "#ffffff", ink: "#0b0d12", accent: "#1f3fae" },
  dark: { paper: "#0b0b0b", ink: "#f5f5f7", accent: "#6aa1ff" },
};

/** The Learner's saved choice: one of the two themes. There is no "follow the computer" any more. */
export type ThemePref = ThemeId;
export const DEFAULT_PREF: ThemePref = "light";

/** The cookie holding the Learner's choice. */
export const THEME_COOKIE = "theme";

export const isTheme = (v: unknown): v is ThemeId => THEMES.includes(v as ThemeId);

/** Saved values that open Dark; everything else (system…, single:light, single:paper, none, unreadable) is Light. */
const OPENS_DARK = /^(?:dark|single:(?:dark|midnight|forest))$/;

/**
 * Reads a saved choice. `dark` opens Dark, and so do the old pinned dark themes (`single:dark`, `single:midnight`,
 * `single:forest`). Everything else opens Light: `light`, the old light themes, the old "Match my Mac" (`system`, and a
 * day and night pair such as `system:paper:forest`), and anything unreadable. The cookie is rewritten on the next press.
 */
export const parsePref = (raw?: string | null): ThemePref => (OPENS_DARK.test(raw ?? "") ? "dark" : "light");

/** Puts a theme on <html>: the same four things THEME_INIT_SCRIPT sets before first paint. */
export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement) {
  const kind = THEME_KIND[theme];
  root.dataset.theme = theme;
  root.classList.toggle("dark", kind === "dark");
  root.style.colorScheme = kind;
  root.dataset.openuiTheme = kind;
}

/**
 * Runs at the top of <head>, before first paint: parsePref and applyTheme written out by hand, because it runs before
 * any bundle loads. It is the only thing that sets the theme on <html> on load: the layout renders no theme attributes at
 * all, so React has none to strip when router.refresh() redraws the layout. A test runs this string through every kind of
 * saved value, under both computer modes, against the functions above, so the two copies cannot drift.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),t=m&&${OPENS_DARK}.test(decodeURIComponent(m[1]))?"dark":"light",h=document.documentElement;h.dataset.theme=t;h.classList.toggle("dark",t==="dark");h.style.colorScheme=t;h.dataset.openuiTheme=t}catch(e){}})()`;
