// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR 0015's type: Inter for text and Inter Tight for headings, loaded once in the root layout through next/font
// (self-hosted, no call to Google), both put on <body> as CSS variables; Manrope is gone. <html> stays untouched,
// because the head script alone sets the theme on it.

const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("fonts", () => {
  it("loads Inter (with latin-ext, for ₹) and Inter Tight, and puts both variables on body", () => {
    expect(layout).toContain('import { Inter, Inter_Tight } from "next/font/google";');
    expect(layout).toMatch(/Inter\(\{ subsets: \["latin", "latin-ext"\], variable: "--font-text"/);
    expect(layout).toMatch(/Inter_Tight\(\{ subsets: \["latin"\], variable: "--font-display"/);
    expect(layout).toMatch(/<body className=\{`[^`]*\$\{text\.variable\} \$\{display\.variable\}`\}>/);
  });

  it("drops Manrope and leaves <html> as it was", () => {
    expect(layout).not.toContain("Manrope");
    expect(layout).toContain("<html lang=\"en\" suppressHydrationWarning>");
  });

  it("gives body the text font first, with the system stack behind it", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\nbody \{\n  background: var\(--paper\);\n  color: var\(--ink\);\n  font-family: var\(--font-text, system-ui\), -apple-system, system-ui/);
  });
});
