// The two themes, Light and Dark, and how a saved choice turns into one of them (spec 2026-11-05 ticket A4, ADR 0012).
// Used on the server and in the browser, so nothing here touches the document until a function is called.

export const THEMES = ["light", "dark"] as const;
export type ThemeId = (typeof THEMES)[number];
export const THEME_KIND: Record<ThemeId, "light" | "dark"> = { light: "light", dark: "dark" };
export const THEME_LABEL: Record<ThemeId, string> = { light: "Light", dark: "Dark" };

/**
 * The page, text and brand colour of each theme, copied from globals.css for the little swatches, which show a theme
 * other than the one the page is in (the tokens only hold the current one). A test keeps these equal to globals.css.
 */
export const THEME_SWATCH: Record<ThemeId, { bg: string; ink: string; brand: string }> = {
  light: { bg: "#f6f8ff", ink: "#121a33", brand: "#2f5bea" },
  dark: { bg: "#141a33", ink: "#dce4fa", brand: "#4466d8" },
};

export type ThemePref = { mode: "system" } | { mode: "single"; theme: ThemeId };
export const DEFAULT_PREF: ThemePref = { mode: "system" };

/** The cookie holding the Learner's choice, and the media query that says the computer is in dark mode. */
export const THEME_COOKIE = "theme";
export const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

export const isTheme = (v: unknown): v is ThemeId => THEMES.includes(v as ThemeId);

/**
 * Reads a saved choice. Values saved before there were two themes still open: the old light kinds (Paper) become Light,
 * the old dark kinds (Midnight, Forest) become Dark, and an old day and night pair becomes Match my Mac. Anything
 * unreadable is the default, Match my Mac. The cookie is rewritten on the next change.
 */
export function parsePref(raw: string | null | undefined): ThemePref {
  if (raw === "dark") return { mode: "single", theme: "dark" };
  if (raw === "light") return { mode: "single", theme: "light" };
  const [mode, a] = (raw ?? "").split(":");
  if (mode === "single") {
    if (a === "light" || a === "paper") return { mode: "single", theme: "light" };
    if (a === "dark" || a === "midnight" || a === "forest") return { mode: "single", theme: "dark" };
  }
  return DEFAULT_PREF;
}

export const serializePref = (p: ThemePref) => (p.mode === "single" ? `single:${p.theme}` : "system");

export const resolveTheme = (p: ThemePref, osDark: boolean): ThemeId => (p.mode === "single" ? p.theme : osDark ? "dark" : "light");

/** Puts a theme on <html>: the same four things THEME_INIT_SCRIPT sets before first paint. */
export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement) {
  const kind = THEME_KIND[theme];
  root.dataset.theme = theme;
  root.classList.toggle("dark", kind === "dark");
  root.style.colorScheme = kind;
  root.dataset.openuiTheme = kind;
}

/**
 * Runs at the top of <head>, before first paint: parsePref, resolveTheme and applyTheme written out by hand, because it
 * runs before any bundle loads. It is the only thing that sets the theme on <html> on load: the layout renders no theme
 * attributes at all, so React has none to strip when router.refresh() redraws the layout. A test runs this string through
 * every kind of saved value and both computer modes against the functions above, so the two copies cannot drift.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),r=m?m[1]:"",p=r.split(":"),d=matchMedia("${OS_DARK_QUERY}").matches,t;if(r==="dark")t="dark";else if(r==="light")t="light";else if(p[0]==="single"&&/^(light|paper)$/.test(p[1]))t="light";else if(p[0]==="single"&&/^(dark|midnight|forest)$/.test(p[1]))t="dark";else t=d?"dark":"light";var h=document.documentElement;h.dataset.theme=t;h.classList.toggle("dark",t==="dark");h.style.colorScheme=t;h.dataset.openuiTheme=t}catch(e){}})()`;
