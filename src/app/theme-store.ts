"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PREF, THEME_COOKIE, applyTheme, type ThemeId } from "./theme";

// The Learner's theme in the browser, shared by every control that shows or changes it (the header toggle and the
// Settings radios), so they stay in step. <html data-theme> is the truth: a control always offers the theme that is not
// on screen, so a tab left open never shows a press that does nothing.

const YEAR = 31536000;

export const writeCookie = (name: string, value: string) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
};

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const shown = (): ThemeId => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Applies a theme at once and saves it for a year. One frame without transitions, so the switch is one clean cut. */
export function setTheme(theme: ThemeId) {
  writeCookie(THEME_COOKIE, theme);
  const calm = document.createElement("style");
  calm.dataset.themeSwitch = "";
  calm.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(calm);
  applyTheme(theme);
  void getComputedStyle(document.documentElement).backgroundColor;
  setTimeout(() => calm.remove(), 1);
  listeners.forEach((listener) => listener());
}

/**
 * The theme on screen, kept current. `initial` is the server's reading of the cookie (readTheme), used only for the
 * server's drawing and for hydrating to match it; after that <html data-theme> decides.
 */
export const useTheme = (initial: ThemeId = DEFAULT_PREF) => useSyncExternalStore(subscribe, shown, () => initial);
