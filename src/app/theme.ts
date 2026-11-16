// The two themes, Light and Dark (ADR 0019), and how the page picks one. A first visit follows the device's light or
// dark setting; the switch saves a choice in the `theme` cookie, and a saved choice wins from then on. Used on the
// server and in the browser, so nothing here touches the document until a function is called.

export const THEMES = ["light", "dark"] as const;
export type ThemeId = (typeof THEMES)[number];

/** The cookie holding the choice made with the switch. Browser only: the server never reads it (pages stay static). */
export const THEME_COOKIE = "theme";

/** The device's setting, as the browser reports it. */
export const DEVICE_DARK = "(prefers-color-scheme: dark)";

/** A saved choice opens itself; no choice (or an unreadable one) follows the device. */
export const parseTheme = (raw: string | null | undefined, deviceDark: boolean): ThemeId =>
  raw === "dark" || raw === "light" ? raw : deviceDark ? "dark" : "light";

/** Puts a theme on <html>: the same two things THEME_INIT_SCRIPT sets before the first paint. */
export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Runs at the top of <head>, before the first paint: parseTheme and applyTheme written out by hand, because it runs
 * before any bundle loads. It is the only thing that sets the theme on <html> on load: the layout renders no theme
 * attributes, so React has none to strip when router.refresh() redraws it. A test runs this string through every saved
 * value under both device modes against the functions above, so the two copies cannot drift.
 */
export const THEME_INIT_SCRIPT = `(function(){var t="light";try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),v=m&&decodeURIComponent(m[1]);t=v==="dark"||v==="light"?v:window.matchMedia&&window.matchMedia("${DEVICE_DARK}").matches?"dark":"light"}catch(e){}var h=document.documentElement;h.dataset.theme=t;h.style.colorScheme=t})()`;
