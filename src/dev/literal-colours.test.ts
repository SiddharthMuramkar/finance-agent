import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Token-first (ADR 0015, ADR 0019): a colour is written as a literal only in a token block of globals.css, the Light
// `:root`, the Dark `:root[data-theme="dark"]` and the print `:root`, so a theme re-colours every screen. Everything
// else names a token. Tests and the dev pages are left out: they measure and stage colours on purpose.

/** A literal colour: a hex colour (not an issue number such as #119), a colour function, or a named white or black. */
const hex = (line: string) =>
  [...line.matchAll(/(?<![\w&/-])#([0-9a-f]+)(?![\w-])/gi)].some(([, h]) => [3, 4, 6, 8].includes(h.length) && (h.length >= 6 || /[a-f]/i.test(h)));
const LITERAL = [
  { test: hex },
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i,
  /\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow|decoration|divide|accent|caret)-(?:white|black)\b/,
  /(?:[:=]\s*['"]?|['"])(?:white|black)\b(?!-)/,
];

/** Drops every token block (`:root` with or without a selector part) of a stylesheet, so its literals are allowed. */
const withoutTokenBlocks = (css: string) => css.replace(/(^|[}\s]):root(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, "$1");

/** Comments say "white" and "black" in prose; only code is scanned. */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/.*$/gm, "$1");

/** The tracked source files a page draws from. */
const FILES = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(?:tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith("src/dev/") && !f.startsWith("src/app/dev/") && !f.startsWith("src/test/"));

/** Every line of `file` that writes a literal colour outside a token block. */
function literals(file: string, text = readFileSync(file, "utf8")): string[] {
  const code = withoutComments(file.endsWith(".css") ? withoutTokenBlocks(text) : text);
  return code.split("\n").filter((line) => LITERAL.some((re) => re.test(line))).map((line) => `${file}: ${line.trim()}`);
}

describe("literal colours", () => {
  it("live only in the token blocks of globals.css", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.flatMap((file) => literals(file))).toEqual([]);
  });

  it("are found wherever else they are written", () => {
    for (const line of [
      'const SEG_TODO = "[--seg:rgb(255_255_255/0.35)]";',
      'className="hover:bg-white/15"',
      'export const CHART_PALETTE = ["#868c97", "#1f3fae"];',
      "url(\"data:image/svg+xml,%3Csvg stroke='white'%3E\")",
      "body { background: #fff; }",
    ])
      expect(literals("x.tsx", line), line).toHaveLength(1);
    for (const line of ["// spec #119, ticket #245", 'className="bg-[var(--band-todo)]"', "color: var(--ink);", "forced-colors:[--seg:GrayText]"])
      expect(literals("x.tsx", line), line).toEqual([]);
    expect(literals("x.css", ':root {\n  --paper: #ffffff;\n}\n:root[data-theme="dark"] {\n  --paper: #0b0d12;\n}\n@media print {\n  :root {\n    --ink: #000000;\n  }\n}')).toEqual([]);
    expect(literals("x.css", ".band {\n  color: #ffffff;\n}")).toHaveLength(1);
  });
});
