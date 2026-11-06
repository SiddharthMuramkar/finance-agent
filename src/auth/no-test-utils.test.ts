import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Better Auth's `testUtils` plugin (the test bed's Google-linked fixture, C1b) must never ship in a
 * production auth instance: in `src/auth/better-auth.ts` its only use sits inside the branch guarded
 * by `e2eEnabled(`, which is false in production and on Vercel. The import line is the one allowed
 * mention outside that branch; importing alone mounts nothing.
 */
describe("testUtils never ships", () => {
  const text = readFileSync(new URL("./better-auth.ts", import.meta.url), "utf8");

  it("mounts testUtils only inside the e2eEnabled branch", () => {
    const withoutImports = text
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n");
    expect(withoutImports).toContain("e2eEnabled(");
    expect([...withoutImports.matchAll(/testUtils\(\)/g)]).toHaveLength(1);
    const guard = withoutImports.indexOf("e2eEnabled(");
    const use = withoutImports.indexOf("testUtils()");
    expect(use).toBeGreaterThan(guard);
    // The guarded expression is one plugins entry: the use sits between the guard and the next plugin.
    expect(withoutImports.slice(guard, use)).not.toContain("nextCookies");
  });
});
