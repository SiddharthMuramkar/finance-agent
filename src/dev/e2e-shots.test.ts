import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Screenshots are written only when `SHOTS=<ID>` is set (spec 2026-11-11, line 512; ticket Z1): CI and ordinary
 * `ui:test` runs never rewrite a committed PNG. Every `screenshot({ … path … })` in a browser test must sit in a test
 * whose body, before the write, reads `process.env.SHOTS`. The Spine critics' shots (docs/critics/README.md) are the one
 * other switch: a write after an `if` on `CRITICS_DIR` (a helper's `if (!CRITICS_DIR) return;`), the folder the critics
 * run names, which is unset on CI.
 */

/** Files that write screenshots on another switch, into a git-ignored folder, never into docs/. */
const OTHER_SWITCH: Record<string, string> = {
  "e2e/matrix.spec.ts": "the preview matrix runs only with UI_MATRIX=1 and writes to the git-ignored evidence/ folder",
  "e2e/spine-02-03.spec.ts": "the Spine critics' screenshots are written only with SPINE_CRITICS_OUT set, into that folder outside the repo",
  "e2e/spine-01.spec.ts": "the Spine critics' screenshots go to CRITICS_OUT, else the git-ignored test-results/spine-01 folder, never into docs/ (#88)",
  "e2e/spine-annual-report.spec.ts": "the Spine critics' screenshots go to CRITICS_OUT, else the test's own git-ignored output folder, never into docs/ (#93)",
  "e2e/spine-statements.spec.ts": "the Spine critics' screenshots are written only with SPINE_CRITICS_OUT set, into that folder outside the repo",
  "e2e/workspace-theme.spec.ts": "the Dark critics' screenshots are written only with DARK_SHOTS set, into that folder, on mbp14-dark (#80)",
  "e2e/spine-04-09.spec.ts": "the Spine critics' screenshots are written only with SPINE_CRITICS_OUT set, into that folder outside the repo",
  "e2e/spine-rate-split.spec.ts": "the Spine critics' screenshots go to CRITICS_OUT outside the repo, or else the git-ignored test-results/ folder, never docs/",
};

function specs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) specs(path, acc);
    else if (name.endsWith(".spec.ts")) acc.push(path);
  }
  return acc;
}

/** A check that turns screenshot writes on: SHOTS, or an `if` on CRITICS_DIR (the Spine critics' shots). */
const SWITCH = /process\.env\.SHOTS|\bif\s*\(\s*!?\s*(process\.env\.)?CRITICS_DIR\b/;

/** `file:line` of every screenshot write with no switch check between the start of its test (or file, for a helper above every test) and the write. */
function unguardedShots(file: string, text: string): string[] {
  const lines = text.split("\n");
  const found: string[] = [];
  lines.forEach((line, i) => {
    if (!/\.screenshot\(\{[^)]*\bpath\s*:/.test(line)) return;
    let start = i;
    while (start > 0 && !/^\s*test\(/.test(lines[start])) start--;
    if (!lines.slice(start, i + 1).some((l) => SWITCH.test(l))) found.push(`${file}:${i + 1}`);
  });
  return found;
}

describe("browser tests write screenshots only under SHOTS (Z1)", () => {
  it("flags a write with no SHOTS check in its test, and passes a guarded one", () => {
    const bare = ['test("a", async ({ page }) => {', '  await page.screenshot({ path: "x.png" });', "});"].join("\n");
    const guarded = ['test("a", async ({ page }) => {', '  if (process.env.SHOTS === "Z1") {', '    await page.screenshot({ path: "x.png" });', "  }", "});"].join("\n");
    expect(unguardedShots("bare.spec.ts", bare)).toEqual(["bare.spec.ts:2"]);
    expect(unguardedShots("guarded.spec.ts", guarded)).toEqual([]);
  });

  it("passes a helper that returns unless CRITICS_DIR is set, and flags one that does not check it", () => {
    const helper = (check: string) =>
      ["const CRITICS_DIR = process.env.CRITICS_DIR;", "async function shoot(page) {", check, '  await page.screenshot({ path: join(CRITICS_DIR, "x.png") });', "}"].join("\n");
    expect(unguardedShots("critics.spec.ts", helper("  if (!CRITICS_DIR) return;"))).toEqual([]);
    expect(unguardedShots("bare.spec.ts", helper("  mkdirSync(CRITICS_DIR);"))).toEqual(["bare.spec.ts:4"]);
  });

  it("every screenshot write in e2e/ is gated on SHOTS", () => {
    const files = specs("e2e").filter((file) => !(file in OTHER_SWITCH));
    expect(files.flatMap((file) => unguardedShots(file, readFileSync(file, "utf8")))).toEqual([]);
  });
});
