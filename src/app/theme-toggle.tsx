"use client";

import { useAnnounce } from "./announcer";
import { IconButton } from "./primitives";
import { THEME_LABEL, TOGGLE_LABEL, type ThemeId } from "./theme";
import { setTheme, useTheme } from "./theme-store";

// Lucide geometry at stroke 1.75 (ADR 0013): a moon in Light, a sun in Dark. Both are drawn; CSS shows the one for the
// theme on <html> (`dark:` display swap), so the right icon is there from the first frame, before hydration.
const icon = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/**
 * The header's theme toggle (ADR 0013): one 32px ghost icon button. In Light it shows a moon and is named "Switch to dark
 * theme" (its tooltip too); in Dark a sun, "Switch to light theme". A press switches at once, saves the choice in the
 * `theme` cookie for a year, keeps focus on the button, and says "Dark theme on" or "Light theme on" to screen readers,
 * since some do not re-read a focused button's new name. `initial` comes from readTheme(), so the server draws the right
 * name; after hydration the theme on <html> decides.
 */
export function ThemeToggle({ initial }: { initial: ThemeId }) {
  const theme = useTheme(initial);
  const announce = useAnnounce();
  const next: ThemeId = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      label={TOGGLE_LABEL[theme]}
      data-testid="theme-toggle"
      onClick={() => {
        setTheme(next);
        announce(`${THEME_LABEL[next]} theme on`);
      }}
    >
      <svg {...icon} data-testid="theme-icon-moon" className="dark:hidden">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg {...icon} data-testid="theme-icon-sun" className="hidden dark:block">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </IconButton>
  );
}
