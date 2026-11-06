import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S7 (spec 2026-11-05, A1): the app's pages fill the window. Single-task forms (Welcome, Login, the 404) and the
// marketing Home page keep their own narrow boxes on purpose.
const ROOT = join(__dirname);
const SKIP_DIRS = new Set(["_landing", "welcome", "login"]);
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

// A2: the chat is 15/24 (--text-chat, --lh-chat); `text-base` is 16 px and has no place in the chat files.
describe("no text-base in chat files", () => {
  it("thread.tsx and message-box.tsx contain no text-base", () => {
    for (const file of ["thread.tsx", "message-box.tsx"]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/\btext-base\b/);
    }
  });
});
