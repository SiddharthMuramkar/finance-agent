"use client";

import { useState } from "react";

export type Theme = "light" | "dark";

/** Switches dark and light mode and remembers the choice in a cookie for a year. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }
  return (
    <button onClick={toggle} className="min-h-11 text-sm text-stone-500 hover:underline dark:text-stone-400" aria-label="Switch dark or light mode">
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
