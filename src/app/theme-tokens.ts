import { readFileSync } from "node:fs";
import { join } from "node:path";

// The theme tokens of globals.css for what cannot read var() (ADR 0015, ADR 0019): the share cards are images drawn on
// the server (issue #71), and the Dark sweep in e2e/theme.spec.ts looks for Light-only colours. Both read the token blocks
// themselves, so a colour is still written once, in globals.css.

const read = () => readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The declarations of the first `<selector> {` block of `css`, name without "--" to value, comments left out. */
function tokenBlock(css: string, selector: string): Record<string, string> {
  const at = css.search(new RegExp(`(?:^|\\s)${selector.replace(/[[\]]/g, "\\$&")}\\s*\\{`));
  const block = at < 0 ? "" : css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries([...block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

/** The Light theme's tokens: the first `:root { … }` block of globals.css. */
export const lightTokens = (css = read()) => tokenBlock(css, ":root");

/** The Dark theme's own tokens: the `:root[data-theme="dark"] { … }` block (every other name follows Light's var()). */
export const darkTokens = (css = read()) => tokenBlock(css, ':root[data-theme="dark"]');
