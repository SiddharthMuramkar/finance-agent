"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_PREF, OS_DARK_QUERY, THEME_COOKIE, applyTheme, parsePref, resolveTheme, serializePref, type SystemPref, type ThemeId, type ThemePref } from "./theme";

// The Learner's theme choice in the browser, shared by every control that shows or changes it, so they stay in step.
// The cookies are the store: each read goes to them, so there is no second copy to fall out of date.

/** Remembers the last day and night pair while one theme is pinned, because `single:forest` has no room for it. */
const PAIR_COOKIE = "theme-pair";
const YEAR = 31536000;

const readCookie = (name: string) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
const writeCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
};
const osMedia = () => (typeof matchMedia === "function" ? matchMedia(OS_DARK_QUERY) : undefined);

const readPref = () => parsePref(readCookie(THEME_COOKIE));
const readPair = (): SystemPref => {
  const pref = readPref();
  if (pref.mode === "system" && readCookie(THEME_COOKIE)) return pref;
  const pair = parsePref(`system:${readCookie(PAIR_COOKIE) ?? ""}`);
  return pair.mode === "system" ? pair : DEFAULT_PREF;
};

const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

/** The computer changed mode: a Learner following it gets the new theme at once. A pinned theme stays as it is. */
function onOsChange(e: { matches: boolean }) {
  const pref = readPref();
  if (pref.mode === "system") applyTheme(resolveTheme(pref, e.matches));
  tell();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) osMedia()?.addEventListener("change", onOsChange);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) osMedia()?.removeEventListener("change", onOsChange);
  };
}

/** Applies a choice at once and saves it for a year. A system choice also becomes the pair Match my Mac comes back to. */
export function setThemePref(pref: ThemePref) {
  writeCookie(THEME_COOKIE, serializePref(pref));
  if (pref.mode === "system") writeCookie(PAIR_COOKIE, `${pref.day}:${pref.night}`);
  applyTheme(resolveTheme(pref, osMedia()?.matches ?? false));
  tell();
}

/** Pins one theme. */
export const pinTheme = (theme: ThemeId) => setThemePref({ mode: "single", theme });

/** Follows the computer again, with the saved day and night pair. */
export const followSystem = () => setThemePref(readPair());

const prefSnapshot = () => serializePref(readPref());
const pairSnapshot = () => serializePref(readPair());
const osDarkSnapshot = () => osMedia()?.matches ?? false;
const noOsOnServer = () => null;

export type ThemeState = {
  pref: ThemePref;
  /** The day and night pair Match my Mac uses, saved even while one theme is pinned. */
  pair: SystemPref;
  /** The computer's mode. Null only while drawing on the server and hydrating, when it cannot be known. */
  osDark: boolean | null;
  /** The theme in use. Null in the same moment if the Learner follows the computer. */
  theme: ThemeId | null;
};

/**
 * The Learner's choice and the theme it gives, kept current. `initial` is the server's reading of the cookie, used only
 * for the server's drawing and for hydrating to match it; after that the cookie decides, so a stale prop from a cached
 * page cannot put the control out of step.
 */
export function useThemeState(initial: ThemePref = DEFAULT_PREF): ThemeState {
  const serverPref = serializePref(initial);
  const pref = parsePref(useSyncExternalStore(subscribe, prefSnapshot, () => serverPref));
  const pair = parsePref(useSyncExternalStore(subscribe, pairSnapshot, () => serializePref(initial.mode === "system" ? initial : DEFAULT_PREF))) as SystemPref;
  const osDark = useSyncExternalStore(subscribe, osDarkSnapshot, noOsOnServer);
  const theme = pref.mode === "single" ? pref.theme : osDark === null ? null : resolveTheme(pref, osDark);
  return { pref, pair, osDark, theme };
}

const nothing = () => {};

/** Keeps the page following the computer on every page, those with no header included (Home, sign-in). Draws nothing. */
export function ThemeFollower() {
  useEffect(() => subscribe(nothing), []);
  return null;
}
