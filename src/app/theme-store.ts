"use client";

import { useSyncExternalStore } from "react";
import { writeCookie } from "./cookie";
import { THEME_COOKIE, applyTheme, type ThemeId } from "./theme";

// The theme in the browser, shared by every switch that shows or changes it, so they stay in step (ADR 0019).
// <html data-theme> is the truth: the head script set it before the first paint, and a switch always offers the theme
// that is not on screen.

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

/** The theme on screen, kept current. The server draws Light; after hydration <html data-theme> decides. */
export const useTheme = () => useSyncExternalStore(subscribe, shown, (): ThemeId => "light");
