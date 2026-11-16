import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Light theme's colours for what cannot read var(): the share cards are images drawn on the server (issue #71), so
// they read the tokens from the Light block of globals.css itself, and a colour is still written once (ADR 0015, ADR 0019).

/** The first `:root { … }` block of `css` (the Light tokens), name without "--" to value, comments left out. */
export function lightTokens(css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")): Record<string, string> {
  const block = css.match(/(?:^|\n):root\s*\{([^{}]*)\}/)?.[1] ?? "";
  return Object.fromEntries([...block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}
