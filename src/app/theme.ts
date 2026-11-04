// The four themes and how a saved choice turns into one of them (themes spec T-02). Used on the server and in the
// browser, so nothing here touches the document until a function is called. The palettes are credited in globals.css.

export const THEMES = ["light", "paper", "midnight", "forest"] as const;
export type ThemeId = (typeof THEMES)[number];
export const THEME_KIND: Record<ThemeId, "light" | "dark"> = { light: "light", paper: "light", midnight: "dark", forest: "dark" };
export const THEME_LABEL: Record<ThemeId, string> = { light: "Light", paper: "Paper", midnight: "Midnight", forest: "Forest" };

/**
 * The page, text and brand colour of each theme, copied from globals.css for the little swatches, which show a theme
 * other than the one the page is in (the tokens only hold the current one). A test keeps these equal to globals.css.
 */
export const THEME_SWATCH: Record<ThemeId, { bg: string; ink: string; brand: string }> = {
  light: { bg: "#fafaf9", ink: "#1c1917", brand: "#002366" },
  paper: { bg: "#faf4ed", ink: "#4d4870", brand: "#286983" },
  midnight: { bg: "#1e1e2e", ink: "#cdd6f4", brand: "#89b4fa" },
  forest: { bg: "#2d353b", ink: "#eae2cf", brand: "#7fbbb3" },
};

export type DayTheme = "light" | "paper";
export type NightTheme = "midnight" | "forest";
export type SystemPref = { mode: "system"; day: DayTheme; night: NightTheme };
export type ThemePref = SystemPref | { mode: "single"; theme: ThemeId };
export const DEFAULT_PREF: SystemPref = { mode: "system", day: "light", night: "midnight" };

/** The cookie holding the Learner's choice, and the media query that says the computer is in dark mode. */
export const THEME_COOKIE = "theme";
export const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

export const isTheme = (v: unknown): v is ThemeId => THEMES.includes(v as ThemeId);

/** Reads a saved choice. The old values "dark" and "light" pin Midnight and Light; anything unreadable is the default. */
export function parsePref(raw: string | null | undefined): ThemePref {
  if (raw === "dark") return { mode: "single", theme: "midnight" };
  if (raw === "light") return { mode: "single", theme: "light" };
  const [mode, a, b] = (raw ?? "").split(":");
  if (mode === "single" && isTheme(a)) return { mode: "single", theme: a };
  if (mode === "system" && (a === "light" || a === "paper") && (b === "midnight" || b === "forest")) return { mode: "system", day: a, night: b };
  return DEFAULT_PREF;
}

export const serializePref = (p: ThemePref) => (p.mode === "single" ? `single:${p.theme}` : `system:${p.day}:${p.night}`);

export const resolveTheme = (p: ThemePref, osDark: boolean): ThemeId => (p.mode === "single" ? p.theme : osDark ? p.night : p.day);

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
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),r=m?m[1]:"",p=r.split(":"),d=matchMedia("${OS_DARK_QUERY}").matches,t;if(r==="dark")t="midnight";else if(r==="light")t="light";else if(p[0]==="single"&&/^(light|paper|midnight|forest)$/.test(p[1]))t=p[1];else if(p[0]==="system"&&/^(light|paper)$/.test(p[1])&&/^(midnight|forest)$/.test(p[2]))t=d?p[2]:p[1];else t=d?"midnight":"light";var k=t==="midnight"||t==="forest"?"dark":"light",h=document.documentElement;h.dataset.theme=t;h.classList.toggle("dark",k==="dark");h.style.colorScheme=k;h.dataset.openuiTheme=k}catch(e){}})()`;
