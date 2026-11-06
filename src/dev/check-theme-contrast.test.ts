import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The contrast guard guards (spec 2026-11-05 ticket A4, test 3, seam S7): the real stylesheet passes, and three
// deliberate breakages each fail on the rule that should catch them.

const REAL = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const SCRIPT = join(process.cwd(), "scripts/check-theme-contrast.mjs");

/** Runs the script on `css`; `colourOnly` replaces its list of accent fills that carry meaning by colour alone. */
function run(css: string, colourOnly?: [string, string][]) {
  const dir = mkdtempSync(join(tmpdir(), "contrast-"));
  const file = join(dir, "globals.css");
  writeFileSync(file, css);
  const args = [SCRIPT, file];
  if (colourOnly) {
    const list = join(dir, "colour-only.json");
    writeFileSync(list, JSON.stringify(colourOnly));
    args.push(list);
  }
  const done = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: done.status, output: `${done.stdout}${done.stderr}` };
}

/** Changes one token inside the Light block (the first `:root {` that holds --bg) or the Dark block (`:root.dark {`). */
function change(css: string, theme: "light" | "dark", token: string, value: string) {
  const open = theme === "light" ? ":root {\n  color-scheme: light;" : ":root.dark {\n    color-scheme: dark;";
  const start = css.indexOf(open);
  if (start < 0) throw new Error(`no ${theme} block`);
  const end = css.indexOf("}", start);
  const block = css.slice(start, end).replace(new RegExp(`(--${token}:\\s*)#[0-9a-f]+`, "i"), `$1${value}`);
  return css.slice(0, start) + block + css.slice(end);
}

describe("the contrast guard", () => {
  it("the guard guards", () => {
    const real = run(REAL);
    expect(real.output).toContain("All themes pass.");
    expect(real.status).toBe(0);

    const ink = run(change(REAL, "light", "ink", "#333333"));
    expect(ink.status).toBe(1);
    expect(ink.output).toContain("light: --ink is unchanged");

    const neon = run(change(REAL, "dark", "mint-ink", "#00e0a0"));
    expect(neon.status).toBe(1);
    expect(neon.output).toMatch(/dark: --mint-ink chroma/);

    const edge = run(change(REAL, "light", "edge", "#cccccc"));
    expect(edge.status).toBe(1);
    expect(edge.output).toContain("--edge on --bg");
  });

  it("checks every pair of the spec's table in both themes", () => {
    const { output } = run(REAL);
    for (const theme of ["light", "dark"]) {
      for (const pair of ["--ink on --bg", "--muted on --field", "--brand on --brand-tint", "--brand-ink on --coral-fill", "--violet-ink on --violet-tint", "--edge on --field", "--ring on --bg", "--brand-main on --bg"]) {
        expect(output, `${theme}: ${pair}`).toContain(`${theme}: ${pair} `);
      }
    }
  });

  // Issue #457, WCAG 2.2 SC 1.4.11: an accent fill needs 3:1 against its surface only when colour alone carries its meaning.
  // Every use today is paired with a text label or an icon, so the list is empty; Light sunflower on the page is 1.5:1
  // (issue #457, ADR 0012) and Dark sunflower equals Dark --sun-ink, 9.8:1 on the page (Appendix A.2).
  it("checks an accent fill at 3:1 only when it is listed as carrying meaning by colour alone", () => {
    const real = run(REAL);
    expect(real.status).toBe(0);
    expect(real.output).toContain("Accent fills that carry meaning by colour alone: none");
    expect(real.output).not.toContain("--sun on --bg");

    const listed = run(REAL, [["sun", "bg"]]);
    expect(listed.status).toBe(1);
    expect(listed.output).toMatch(/FAIL light: --sun on --bg 1\.5\d:1 \(min 3, colour alone carries the meaning\)/);
    expect(listed.output).toMatch(/ok +dark: --sun on --bg 9\.\d\d:1 \(min 3, colour alone carries the meaning\)/);
  });
});
