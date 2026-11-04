"use client";

import { useState } from "react";
import { IconButton } from "./icon-button";

export type Theme = "light" | "dark";

const icon = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", className: "h-4 w-4", "aria-hidden": true } as const;

/**
 * Switches dark and light mode and remembers the choice in a cookie for a year. An icon button named "Dark mode" that is
 * pressed (aria-pressed) while dark mode is on; the icon shows the mode you would switch to. className adds to the button.
 */
export function ThemeToggle({ initial, className = "" }: { initial: Theme; className?: string }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }
  return (
    <IconButton label="Dark mode" pressed={theme === "dark"} onClick={toggle} className={className}>
      {theme === "dark" ? (
        <svg {...icon}>
          <circle cx="10" cy="10" r="3.5" />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        </svg>
      ) : (
        <svg {...icon}>
          <path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8Z" />
        </svg>
      )}
    </IconButton>
  );
}
