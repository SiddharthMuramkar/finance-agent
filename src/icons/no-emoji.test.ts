import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The product ships no emoji (spec 2026-11-11, ticket A1c). Patterns are escapes and Unicode property classes, never
 * literal emoji, so this file does not match its own scan. A10a widens the code-point set; no second gate is written.
 */

const GONE = ["public/emoji", "src/emoji", "scripts/vendor-emoji.mjs", "src/app/dev/emoji"];

/**
 * Every pictograph except © ® ™, plus what the spec bans by name (A1c, R8): every emoji-presentation code point (skin-tone
 * modifiers among them), the emoji variation selector U+FE0F, the keycap U+20E3 and the regional indicators of a flag.
 */
const EMOJI = /(?:(?![\u{A9}\u{AE}\u{2122}])\p{Extended_Pictographic})|\p{Emoji_Presentation}|\u{FE0F}|\u{20E3}|\p{Regional_Indicator}/u;

const IMPORTS = /@\/emoji\/|\.\.\/emoji\/|"\/emoji\//;

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

function hits(files: string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (pattern.test(line)) found.push(`${file}:${i + 1}`);
    });
  }
  return found;
}

describe("the product ships no emoji (A1c)", () => {
  it("the pattern catches flags, keycaps and skin-tone modifiers, and lets (c) (r) and TM through", () => {
    for (const sample of ["\u{1F1EE}\u{1F1F3}", "1\u{20E3}", "\u{1F3FD}", "\u{1F1EE}", "\u{2B50}", "\u{2764}\u{FE0F}"]) expect(EMOJI.test(sample), sample).toBe(true);
    for (const sample of ["\u{A9}", "\u{AE}", "\u{2122}", "\u{2713}", "\u{20B9}1,000"]) expect(EMOJI.test(sample), sample).toBe(false);
  });

  it("the emoji kit is gone", () => {
    for (const path of GONE) expect(existsSync(path), path).toBe(false);
  });

  it("no product file holds an emoji code point", () => {
    const src = walk("src").filter((file) => /\.(ts|tsx|css)$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith("src/tutor/reply-checks.ts") && !file.includes("/behaviour/") && !file.startsWith("src/test/") && !file.includes("/src/test/"));
    const yaml = walk("course").filter((file) => file.endsWith(".yaml"));
    expect(hits([...src, ...yaml], EMOJI)).toEqual([]);
  });

  it("no file under src names the old glyphs U+24D8 or U+2197, comments and tests included (A5)", () => {
    const files = walk("src").filter((file) => /\.(ts|tsx|css)$/.test(file) && file !== "src/icons/no-emoji.test.ts");
    expect(hits(files, /[\u{24D8}\u{2197}]/u)).toEqual([]);
  });

  it("nothing imports the emoji kit or a /emoji/ path", () => {
    const files = [...walk("src"), ...walk("scripts")].filter((file) => /\.(ts|tsx|mjs|js|css)$/.test(file) && file !== "src/icons/no-emoji.test.ts");
    expect(hits(files, IMPORTS)).toEqual([]);
  });
});
