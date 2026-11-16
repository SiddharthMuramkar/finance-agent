import type { HomeButton } from "./home-button";

// Pure, so the client nav can import it (home-button.ts reads the database).

/** The Continue button's sub-line: the Topic it opens, What comes next, or the fallback (the Study Workspace). */
export function continueLine(button: HomeButton, fallback: string): string {
  if (button.kind === "resume" || button.kind === "start") return button.topic;
  if (button.kind === "next") return button.label;
  return fallback;
}
