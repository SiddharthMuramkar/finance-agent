import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S7 (spec 2026-11-05, A1): the app's pages fill the window. Single-task forms (Welcome, the sign-in pages, the 404) and the
// public site (the (site) route group: Home, How it works, Examples, the case pages, About) keep their own boxes on purpose.
const ROOT = join(__dirname);
const SKIP_DIRS = new Set(["(site)", "welcome", "sign-in", "sign-up", "join"]);
const SKIP_FILES = new Set(["not-found.tsx"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) && !SKIP_FILES.has(name) ? [path] : [];
  });
}

describe("no page-level width cap in the app", () => {
  it("has no max-w-6xl or max-w-2xl in any page file", () => {
    const offenders = sources(ROOT).filter((file) => /max-w-(6xl|2xl)\b/.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});

// The flat restyle (superseding A2's 15/24): the chat is 16/26, set once as --text-chat and --lh-chat. The chat files take their size
// from those tokens, never a fixed size of their own, so the two lines in globals.css are the one place to change it.
describe("the chat type comes from its tokens", () => {
  it("thread.tsx and message-box.tsx size chat text with --text-chat, and name no fixed chat size", () => {
    for (const file of ["thread.tsx", "message-box.tsx"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source, file).toContain("text-[length:var(--text-chat)]");
      expect(source, file).toContain("leading-[var(--lh-chat)]");
      expect(source, file).not.toMatch(/\btext-base\b|text-\[1[56]px\]/);
    }
  });

  it("globals.css sets the chat to 16/26", () => {
    const css = readFileSync(join(ROOT, "globals.css"), "utf8");
    expect(css).toMatch(/--text-chat:\s*16px;/);
    expect(css).toMatch(/--lh-chat:\s*26px;/);
  });
});
