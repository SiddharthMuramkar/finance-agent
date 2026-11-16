"use client";

import { useSyncExternalStore } from "react";
import { useAnnounce } from "./announcer";
import { Button } from "./primitives";
import { TABLET_UP } from "./screen";
import { setTheme, useTheme } from "./theme-store";
import type { ThemeId } from "./theme";

// The sun/moon switch (ADR 0019). Both icons are drawn; CSS on <html data-theme> shows the one for the theme on screen
// (globals.css, .theme-show-light / .theme-show-dark), so the right icon is there from the first frame, before hydration.

export const SWITCH_LABEL: Record<ThemeId, string> = { light: "Switch to dark theme", dark: "Switch to light theme" };
const ON: Record<ThemeId, string> = { light: "Light theme on", dark: "Dark theme on" };

// Lucide geometry at stroke 1.75: a moon in Light (press for Dark), a sun in Dark (press for Light).
const icon = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/**
 * One button that flips the theme. A press switches at once, saves the choice in the `theme` cookie for a year, keeps
 * focus on the button, and says "Dark theme on" or "Light theme on" to screen readers. `text` adds a visible word beside
 * the icon (the phone menu); without it the button is an icon with a tooltip. `role="menuitem"` makes it a row of a
 * menu (the account menu on a phone), which the menu's arrows reach.
 */
export function ThemeSwitch({ className = "", text, role }: { className?: string; text?: Record<ThemeId, string>; role?: "menuitem" }) {
  const theme = useTheme();
  const announce = useAnnounce();
  const next: ThemeId = theme === "dark" ? "light" : "dark";
  return (
    <Button
      unstyled
      className={className}
      role={role}
      data-testid="theme-switch"
      data-affordance={role ? "button" : "icon"}
      aria-label={SWITCH_LABEL[theme]}
      title={text ? undefined : SWITCH_LABEL[theme]}
      onClick={() => {
        setTheme(next);
        announce(ON[next]);
      }}
    >
      <svg {...icon} data-testid="theme-icon-moon" className="theme-show-light">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg {...icon} data-testid="theme-icon-sun" className="theme-show-dark">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      {text && (
        <>
          <span className="theme-show-light">{text.light}</span>
          <span className="theme-show-dark">{text.dark}</span>
        </>
      )}
    </Button>
  );
}

const watchTablet = (changed: () => void) => {
  const query = window.matchMedia(TABLET_UP);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

/**
 * Whether this is a phone by the one screen-size rule (./screen: below 768 px), kept up to date as it resizes. A server
 * render says no, so a page hydrates as it was drawn; CSS has laid the phone out from the first frame.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(watchTablet, () => !window.matchMedia(TABLET_UP).matches, () => false);
}

/**
 * The app bar's switch (ADR 0019): a 32px ghost icon from 768 px. On a phone the bar has no room for it beside the gear
 * and the account menu (spec #68, #84: one line at 360 px), so the switch is a row of the account menu there
 * (AccountMenu). CSS hides this one from the first frame, and once the page runs it is not mounted at all: the page has
 * one switch.
 */
export function AppBarThemeSwitch() {
  return usePhone() ? null : <ThemeSwitch className="btn btn-icon max-md:hidden" />;
}
