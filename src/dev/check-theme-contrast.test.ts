import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The contrast guard guards (spec 2026-11-05 ticket A4, test 3, seam S7): the real stylesheet
// passes, and deliberate breakages each fail on the rule that should catch them.

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

const OPEN = { light: ":root {\n  color-scheme: light;", dark: ":root.dark {\n    color-scheme: dark;" } as const;

/** Changes one token inside the Light block (`:root {` with its color-scheme line) or the Dark block (`:root.dark {`). */
function change(css: string, theme: "light" | "dark", token: string, value: string) {
  const start = css.indexOf(OPEN[theme]);
  if (start < 0) throw new Error(`no ${theme} block`);
  const end = css.indexOf("}", start);
  const block = css.slice(start, end).replace(new RegExp(`(--${token}:\\s*)#[0-9a-f]+`, "i"), `$1${value}`);
  return css.slice(0, start) + block + css.slice(end);
}

/** Adds one declaration at the top of the Light or Dark block. */
function add(css: string, theme: "light" | "dark", declaration: string) {
  const at = css.indexOf(OPEN[theme]);
  if (at < 0) throw new Error(`no ${theme} block`);
  const after = at + OPEN[theme].length;
  return `${css.slice(0, after)}\n${theme === "light" ? "  " : "    "}${declaration}${css.slice(after)}`;
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

    const edge = run(change(REAL, "light", "line-strong", "#cccccc"));
    expect(edge.status).toBe(1);
    expect(edge.output).toContain("--line-strong on --paper");
  });

  // Until #17 lands, an old name (--bg, --brand ...) is declared once, in Light, as var(--new), so it follows its new name in
  // both themes; one declared again in Dark would split the two names, so it fails by name.
  it("old names follow their new names from Light, and Dark may not declare them", () => {
    const real = run(REAL);
    expect(real.output).toContain("ok   light: --bg follows --paper");
    expect(real.output).toContain("ok   light: --brand-deep follows --accent-deep");
    expect(real.output).toContain("ok   light: --royal is unchanged (#1f3fae)");

    const navy = run(add(REAL, "dark", "--bg: #141a33;"));
    expect(navy.status).toBe(1);
    expect(navy.output).toContain("dark: --bg is an old or theme-independent name: declare it once in Light");

    const pinned = run(change(REAL, "light", "royal", "#2f5bea"));
    expect(pinned.status).toBe(1);
    expect(pinned.output).toContain("FAIL light: --royal is unchanged (#1f3fae)");
  });

  // Spec F1, F5 and Appendix C: a Band is the same royal blue in both themes, with white on it. Every pair is measured in
  // both themes and, where Appendix C gives a figure, held to it; the expected figures below are copied from Appendix C.
  describe("Bands and the key-number colour (Appendix C)", () => {
    const real = run(REAL);

    it("passes every Appendix C pair, in both themes, at Appendix C's ratio", () => {
      expect(real.status).toBe(0);
      const both: [string, string, string][] = [
        ["--on-band on --band", "8.82", "min 4.5, Appendix C 8.82"],
        ["--on-band-2 on --band", "5.36", "min 4.5, Appendix C 5.36"],
        ["--on-band-button-ink on --on-band", "19.43", "min 4.5, Appendix C 19.43"],
        ["--band-rule on --band", "1.58", "decorative, no minimum, Appendix C 1.58"],
      ];
      for (const theme of ["light", "dark"]) for (const [pair, ratio, rule] of both) expect(real.output).toContain(`ok   ${theme}: ${pair} ${ratio}:1 (${rule})`);
      for (const [pair, ratio, rule] of [
        ["--key-number on --paper", "8.82", "min 4.5, Appendix C 8.82"],
        ["--key-number on --wash", "8.23", "min 4.5, Appendix C 8.23"],
        ["--key-number on --accent-tint", "7.87", "min 4.5, Appendix C 7.87"],
        ["--sun on --band", "5.47", "min 4.5, Appendix C 5.47"],
        ["--mint on --band", "3.46", "min 3, Appendix C 3.46"],
      ]) expect(real.output).toContain(`ok   light: ${pair} ${ratio}:1 (${rule})`);
      for (const [pair, ratio] of [
        ["--key-number on --paper", "7.64"],
        ["--key-number on --frame", "7.44"],
        ["--key-number on --raised", "6.55"],
        ["--key-number on --accent-tint", "6.74"],
      ]) expect(real.output).toContain(`ok   dark: ${pair} ${ratio}:1 (min 4.5, Appendix C ${ratio})`);
    });

    // White at 72% is laid over the Band before it is measured: read as solid white it would pass at 8.82:1 whatever its alpha.
    it("lays a translucent colour over the Band before measuring it", () => {
      const half = run(REAL.replace("--on-band-2: rgb(255 255 255 / 0.72);", "--on-band-2: rgb(255 255 255 / 0.5);"));
      expect(half.status).toBe(1);
      expect(half.output).toContain("FAIL light: --on-band-2 on --band 3.41:1 (min 4.5, Appendix C 5.36)");
      expect(half.output).toContain("FAIL light: --on-band-2 is unchanged (rgb(255 255 255 / 0.72))");
    });

    it("keeps the Band out of Dark: it is declared once in Light, and --band follows --royal", () => {
      expect(real.output).toContain("ok   light: --band follows --royal");
      expect(real.output).toContain("ok   light: --on-band is unchanged (#ffffff)");

      const split = run(add(REAL, "dark", "--on-band: #f5f5f7;"));
      expect(split.status).toBe(1);
      expect(split.output).toContain("dark: --on-band is an old or theme-independent name: declare it once in Light");

      const own = run(REAL.replace("--band: var(--royal);", "--band: #2f5bea;"));
      expect(own.status).toBe(1);
      expect(own.output).toContain("FAIL light: --band follows --royal");
      expect(own.output).toMatch(/FAIL light: --on-band on --band \d+\.\d\d:1 \(min 4\.5, Appendix C 8\.82\)/);
    });

    // F5: #1F3FAE and #6AA1FF do not change, and the key-number colour is the Theme's accent in both themes.
    it("makes --key-number the Theme's accent and freezes the Dark accent", () => {
      expect(real.output).toContain("ok   light: --key-number follows --accent");
      expect(real.output).toContain("ok   dark: --accent is unchanged (#6aa1ff)");

      const pinned = run(add(REAL, "dark", "--key-number: #6aa1ff;"));
      expect(pinned.status).toBe(1);
      expect(pinned.output).toContain("FAIL dark: --key-number follows --accent from Light: declare it there only");

      const lighter = run(change(REAL, "dark", "accent", "#8ab5ff"));
      expect(lighter.status).toBe(1);
      expect(lighter.output).toContain("FAIL dark: --accent is unchanged (#6aa1ff)");
      expect(lighter.output).toMatch(/FAIL dark: --key-number on --paper \d+\.\d\d:1 \(min 4\.5, Appendix C 7\.64\)/);
    });

    it("makes a card on a Band white in Light and the Theme's frame in Dark", () => {
      expect(real.output).toContain("ok   light: --band-card is #ffffff (a card on a Band)");
      expect(real.output).toContain("ok   dark: --band-card is var(--frame) (a card on a Band)");
      expect(real.output).toContain("ok   dark: --key-number on --band-card 7.44:1 (min 4.5, Appendix C 7.44)");

      const white = run(REAL.replace("--band-card: var(--frame);", "--band-card: #ffffff;"));
      expect(white.status).toBe(1);
      expect(white.output).toContain("FAIL dark: --band-card is var(--frame) (a card on a Band)");
    });
  });

  // Enjoy's Dark: near-black, never pure black, and neutral greys with no navy cast.
  it("Dark paper is near-black and neutral", () => {
    const black = run(change(REAL, "dark", "paper", "#000000"));
    expect(black.status).toBe(1);
    expect(black.output).toMatch(/FAIL dark: --paper OKLCH lightness 0\.000 is within 0\.12–0\.20/);

    const navy = run(change(REAL, "dark", "paper", "#141a33"));
    expect(navy.status).toBe(1);
    expect(navy.output).toMatch(/FAIL dark: --paper chroma 0\.049 \(max 0\.010, neutral greys, no navy\)/);
  });

  // --brand-deep (= --accent-deep) is frozen and no longer drawn as a lip (ADR 0018); it must still stay darker than its face.
  it("keeps --accent-deep darker than --accent-fill in both themes", () => {
    const real = run(REAL);
    for (const theme of ["light", "dark"]) expect(real.output).toContain(`ok   ${theme}: --accent-deep is darker than --accent-fill`);
    const inverted = run(change(REAL, "dark", "accent-deep", "#93bbff"));
    expect(inverted.status).toBe(1);
    expect(inverted.output).toContain("FAIL dark: --accent-deep is darker than --accent-fill");
  });

  it("checks every pair of the spec's table in both themes", () => {
    const { output } = run(REAL);
    for (const theme of ["light", "dark"]) {
      for (const pair of [
        "--ink on --paper",
        "--muted on --raised",
        "--accent on --accent-tint",
        "--on-accent on --accent-fill",
        "--on-fill on --fill",
        "--on-danger on --danger",
        "--violet-ink on --violet-tint",
        "--line-strong on --raised",
        "--ring on --paper",
        "--accent-fill on --paper",
      ]) {
        expect(output, `${theme}: ${pair}`).toContain(`${theme}: ${pair} `);
      }
    }
  });

  // Issue #457, WCAG 2.2 SC 1.4.11: a fill needs 3:1 against its surface only when colour alone carries its meaning. The
  // Widget accent fills are all paired with a text label or an icon, so none is listed; Light sunflower on the page is
  // 1.6:1 and Dark sunflower equals Dark --sun-ink, 11:1 on the near-black page. The kit's chart series are colour-only
  // (review C1), so each series token is listed on each chart surface.
  it("checks a fill at 3:1 only when it is listed as carrying meaning by colour alone: today the chart series", () => {
    const real = run(REAL);
    expect(real.status).toBe(0);
    expect(real.output).toContain(
      "Fills that carry meaning by colour alone: --ink-2 on --paper, --ink-2 on --raised, --ink-2 on --wash, --ink-2 on --frame, --mint-ink on --paper",
    );
    for (const theme of ["light", "dark"]) {
      for (const series of ["ink-2", "mint-ink", "sun-ink", "violet", "coral-ink", "line-strong"]) {
        for (const surface of ["paper", "raised", "wash", "frame"]) expect(real.output).toMatch(new RegExp(`ok +${theme}: --${series} on --${surface} \\d+\\.\\d\\d:1 \\(min 3, colour alone carries the meaning\\)`));
      }
    }
    expect(real.output).not.toContain("--sun on --paper");

    const listed = run(REAL, [["sun", "paper"]]);
    expect(listed.status).toBe(1);
    expect(listed.output).toMatch(/FAIL light: --sun on --paper 1\.6\d:1 \(min 3, colour alone carries the meaning\)/);
    expect(listed.output).toMatch(/ok +dark: --sun on --paper 11\.\d\d:1 \(min 3, colour alone carries the meaning\)/);

    // A chart series too faint for its card fails: Dark violet dimmed on --raised.
    const faint = run(change(REAL, "dark", "violet", "#5a4f8a"));
    expect(faint.status).toBe(1);
    expect(faint.output).toMatch(/FAIL dark: --violet on --raised \d\.\d\d:1 \(min 3, colour alone carries the meaning\)/);
  });
});
