import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `learnerForAuthUser` hands out a Learner without asking whether the owner denied the account. Only
 * `accessFor` (src/auth/access.ts) may call it, checking the denial first, plus the test bed's route,
 * which seeds fixtures it then signs in through the real checks. Anything else calling it directly
 * would let a denied person in (ADR 0014), so this scan fails on any other value import of it.
 */
const ALLOWED = new Set(["src/auth/access.ts", "src/app/api/dev-e2e/route.ts"]);
const root = join(import.meta.dirname, "..", "..");

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield path;
  }
}

/** Every import or re-export of google-learner in this source, as written. */
const fromGoogleLearner = (text: string) => [...text.matchAll(/\b(?:import|export)\b[^;]*?from\s*["'][^"']*google-learner(?:\.ts)?["']/g)].map((m) => m[0]);
const dynamicImport = (text: string) => /import\(\s*["'][^"']*google-learner(?:\.ts)?["']\s*\)/.test(text);

/** True when the statement brings in learnerForAuthUser as a value (a type-only import never can). */
function bringsInLearnerForAuthUser(statement: string): boolean {
  if (/^import\s+type\b/.test(statement)) return false;
  if (/\*\s+as\b/.test(statement) || /^export\s*\*/.test(statement)) return true;
  return /(?<!type\s)\blearnerForAuthUser\b/.test(statement);
}

describe("no way around the denial check", () => {
  it("only access.ts and the test bed's route import learnerForAuthUser", () => {
    const offenders: string[] = [];
    for (const path of sources(join(root, "src"))) {
      const file = relative(root, path);
      if (file === "src/auth/google-learner.ts" || ALLOWED.has(file)) continue;
      const text = readFileSync(path, "utf8");
      if (fromGoogleLearner(text).some(bringsInLearnerForAuthUser) || dynamicImport(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("access.ts does import it, so the scan above is looking at the right name", () => {
    const text = readFileSync(join(root, "src/auth/access.ts"), "utf8");
    expect(fromGoogleLearner(text).some(bringsInLearnerForAuthUser)).toBe(true);
    expect(bringsInLearnerForAuthUser('import { type AuthUser } from "./google-learner"')).toBe(false);
    expect(bringsInLearnerForAuthUser('import type { AuthUser } from "./google-learner"')).toBe(false);
    expect(bringsInLearnerForAuthUser('import * as g from "./google-learner"')).toBe(true);
  });
});
