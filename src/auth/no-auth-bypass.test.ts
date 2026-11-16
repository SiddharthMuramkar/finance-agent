import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `learnerForClerkUser` hands out the Learner of whatever Clerk user id it is given, without asking whether anyone signed
 * in as them (issue #33). Only `currentSignIn` (src/auth/session.ts) may call it, with the identity Clerk verified (or,
 * in the browser test bed, its signed stand-in), plus the test bed's route, which signs its test people in the same way.
 * Anything else calling it could open another person's Learner, so this scan fails on any other value import of it.
 */
const ALLOWED = new Set(["src/auth/session.ts", "src/app/api/dev-e2e/route.ts"]);
const root = join(import.meta.dirname, "..", "..");

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield path;
  }
}

/** Every import or re-export of clerk-learner in this source, as written. */
const fromClerkLearner = (text: string) => [...text.matchAll(/\b(?:import|export)\b[^;]*?from\s*["'][^"']*clerk-learner(?:\.ts)?["']/g)].map((m) => m[0]);
const dynamicImport = (text: string) => /import\(\s*["'][^"']*clerk-learner(?:\.ts)?["']\s*\)/.test(text);

/** True when the statement brings in learnerForClerkUser as a value (a type-only import never can). */
function bringsInLearnerForClerkUser(statement: string): boolean {
  if (/^import\s+type\b/.test(statement)) return false;
  if (/\*\s+as\b/.test(statement) || /^export\s*\*/.test(statement)) return true;
  return /(?<!type\s)\blearnerForClerkUser\b/.test(statement);
}

describe("no way to a Learner around the sign-in", () => {
  it("only session.ts and the test bed's route import learnerForClerkUser", () => {
    const offenders: string[] = [];
    for (const path of sources(join(root, "src"))) {
      const file = relative(root, path);
      if (file === "src/auth/clerk-learner.ts" || ALLOWED.has(file)) continue;
      const text = readFileSync(path, "utf8");
      if (fromClerkLearner(text).some(bringsInLearnerForClerkUser) || dynamicImport(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("session.ts does import it, so the scan above is looking at the right name", () => {
    const text = readFileSync(join(root, "src/auth/session.ts"), "utf8");
    expect(fromClerkLearner(text).some(bringsInLearnerForClerkUser)).toBe(true);
    expect(bringsInLearnerForClerkUser('import { type AccountLink } from "./clerk-learner"')).toBe(false);
    expect(bringsInLearnerForClerkUser('import type { AccountLink } from "./clerk-learner"')).toBe(false);
    expect(bringsInLearnerForClerkUser('import * as c from "./clerk-learner"')).toBe(true);
    expect(bringsInLearnerForClerkUser('import { learnerForClerkUser as l } from "./clerk-learner"')).toBe(true);
  });
});
