"use client";

import { useState } from "react";

export type Theme = "light" | "dark";

/** Switches dark and light mode and remembers the choice in a cookie for a year. Styled as a quiet header link. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="py-2 text-sm leading-5 text-[var(--muted)] transition-colors duration-200 hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
      aria-label="Switch dark or light mode"
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
