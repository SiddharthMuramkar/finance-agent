import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The browser test bed's people (src/dev/e2e-identity.ts, issue #33) stand in for Clerk sessions, so they must never
 * reach a production build: a signed `fa_e2e_person` cookie would then sign anyone in as the admin. Every way in is a
 * dynamic import behind a `process.env.NODE_ENV` test, which the build replaces, so the bundler drops the import; no
 * file imports it as a value at the top. This scan pins that shape; `scripts/check-no-e2e-in-build.mjs` checks the
 * build itself (the file sets `globalThis.__faE2ePeople` when it loads, and no server file of a build may).
 */
const ALLOWED = new Set(["src/auth/identity.ts", "src/proxy.ts", "src/auth/clerk-directory.ts", "src/app/api/dev-e2e/route.ts", "src/app/api/logout/route.ts"]);
const root = join(import.meta.dirname, "..", "..");
const SELF = "src/dev/e2e-identity.ts";

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield path;
  }
}

const SOURCE = `["'][^"']*e2e-identity(?:\\.ts)?["']`;
/** Static imports and re-exports of e2e-identity that bring in a value (a type-only import is erased). */
const staticValueImports = (text: string) =>
  [...text.matchAll(new RegExp(String.raw`\b(?:import|export)\b[^;]*?from\s*${SOURCE}`, "g"))].map((m) => m[0]).filter((s) => !/^import\s+type\b/.test(s));
/** Where each dynamic import of e2e-identity starts. */
const dynamicImports = (text: string) => [...text.matchAll(new RegExp(String.raw`import\(\s*${SOURCE}\s*\)`, "g"))].map((m) => m.index);

/**
 * True when a `process.env.NODE_ENV` test comes before the import inside the same function: no function or arrow starts
 * between the last such test and the import.
 */
function guarded(text: string, at: number): boolean {
  const before = text.slice(0, at);
  const guard = before.lastIndexOf("process.env.NODE_ENV");
  if (guard < 0) return false;
  const between = before.slice(guard);
  return !/\bfunction\b|=>/.test(between);
}

describe("the test people never ship", () => {
  it("no file imports e2e-identity as a value at the top", () => {
    const offenders: string[] = [];
    for (const path of sources(join(root, "src"))) {
      const file = relative(root, path);
      if (file !== SELF && staticValueImports(readFileSync(path, "utf8")).length > 0) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("only the allowed files load it, each behind a NODE_ENV test in the same function", () => {
    const loaders: string[] = [];
    const unguarded: string[] = [];
    for (const path of sources(join(root, "src"))) {
      const file = relative(root, path);
      const text = readFileSync(path, "utf8");
      const at = dynamicImports(text);
      if (at.length === 0) continue;
      loaders.push(file);
      for (const i of at) if (!guarded(text, i)) unguarded.push(file);
    }
    expect(loaders.filter((f) => !ALLOWED.has(f))).toEqual([]);
    expect(unguarded).toEqual([]);
    // Every allowed file still loads it, so the scan is looking at the right name.
    expect(loaders.sort()).toEqual([...ALLOWED].sort());
  });

  it("e2e-identity.ts sets __faE2ePeople when it loads, the mark the build check looks for", () => {
    expect(readFileSync(join(root, SELF), "utf8")).toMatch(/^globalThis\.__faE2ePeople\s*=(?!=)/m);
    const check = (text: string) => guarded(text, text.indexOf('import("'));
    expect(check('async function f() {\n  if (process.env.NODE_ENV === "production") return;\n  await import("@/dev/e2e-identity");\n}')).toBe(true);
    expect(check('if (process.env.NODE_ENV !== "production") {}\nconst f = async () => import("@/dev/e2e-identity");')).toBe(false);
    expect(check('const f = async () => import("@/dev/e2e-identity");')).toBe(false);
  });
});
