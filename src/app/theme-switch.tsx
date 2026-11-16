"use client";

import { useAnnounce } from "./announcer";
import { Button } from "./primitives";
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
 * the icon (the phone menu); without it the button is an icon with a tooltip.
 */
export function ThemeSwitch({ className = "", text }: { className?: string; text?: Record<ThemeId, string> }) {
  const theme = useTheme();
  const announce = useAnnounce();
  const next: ThemeId = theme === "dark" ? "light" : "dark";
  return (
    <Button
      unstyled
      className={className}
      data-testid="theme-switch"
      data-affordance="icon"
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
