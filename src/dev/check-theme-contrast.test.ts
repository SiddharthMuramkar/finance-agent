import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The contrast guard guards (ADR 0019; spec §2.4, §3.1): the real stylesheet passes, and deliberate breakages each
// fail on the rule that should catch them.

const REAL = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const SCRIPT = join(process.cwd(), "scripts/check-theme-contrast.mjs");

/** Runs the script on `css`; `colourOnly` replaces its list of fills that carry meaning by colour alone. */
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

const OPEN = ":root {\n  color-scheme: light;";

/** Replaces one token's whole value inside the :root block. */
function change(css: string, token: string, value: string) {
  const start = css.indexOf(OPEN);
  if (start < 0) throw new Error("no :root block");
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end).replace(new RegExp(`(\\n  --${token}:\\s*)[^;]+;`), `$1${value};`);
  return css.slice(0, start) + block + css.slice(end);
}

/** Adds one declaration at the top of the :root block. */
const add = (css: string, declaration: string) => css.replace(OPEN, `${OPEN}\n  ${declaration}`);

/** The Light block's declarations, copied whole: a Dark block that sets every colour (to the Light values). */
const DARK_COPY = REAL.slice(REAL.indexOf(OPEN) + OPEN.length, REAL.indexOf("\n}", REAL.indexOf(OPEN))).replace(/\/\*[\s\S]*?\*\//g, "");

/** The real stylesheet with its Dark block taken out: Light only. */
const LIGHT = REAL.replace(/\n:root\[data-theme="dark"\] \{[^}]*\}\n/, "\n");

/** The Light-only stylesheet with a Dark block (ADR 0019) holding `declarations`. */
const dark = (declarations: string) => `${LIGHT}\n:root[data-theme="dark"] {\n  color-scheme: dark;\n${declarations}\n}\n`;

describe("the contrast guard", () => {
  const real = run(REAL);

  it("passes the real stylesheet", () => {
    expect(real.output).toContain("All checks pass.");
    expect(real.status).toBe(0);
  });

  // ADR 0019 (#79): the real stylesheet has a whole Dark block, and every §2.4 contrast and colour-blind separation check
  // passes in Dark as well as in Light.
  it("measures the real stylesheet in both themes", () => {
    expect(REAL).toContain(':root[data-theme="dark"] {');
    expect(real.output).toContain("[Dark: spec §2.4 contrast]");
    expect(real.output).toContain("[Dark: spec §2.4 colour separation, OKLab x 100]");
    expect(real.output).toContain("ok   Dark: color-scheme is dark");
    expect(real.output).not.toContain("FAIL");
  });

  // ADR 0019: Light, and an optional Dark block in one selector shape. With Light only, nothing else is asked.
  it("passes with Light only, and keeps one selector shape for Dark: no .dark class, no reading the device in CSS", () => {
    expect(run(LIGHT).output).not.toContain("[Dark:");
    expect(run(LIGHT).status).toBe(0);

    const block = run(`${REAL}\n:root.dark { --paper: #0b0b0b; }\n`);
    expect(block.status).toBe(1);
    expect(block.output).toContain('FAIL no .dark selector (the Dark theme is :root[data-theme="dark"])');

    const media = run(`${REAL}\n@media (prefers-color-scheme: dark) { body { background: black; } }\n`);
    expect(media.status).toBe(1);
    expect(media.output).toContain("FAIL no prefers-color-scheme: dark (the theme script reads the device, so a chosen theme wins)");

    const scheme = run(REAL.replace(OPEN, ":root {\n  color-scheme: light dark;"));
    expect(scheme.status).toBe(1);
    expect(scheme.output).toContain("FAIL color-scheme is light");
  });

  it("measures a whole Dark block on its own: every contrast, Band and colour-only pair, by name", () => {
    const whole = run(dark(DARK_COPY));
    expect(whole.output).toContain("[Dark: spec §2.4 contrast]");
    expect(whole.output).toContain("ok   Dark: color-scheme is dark");
    expect(whole.output).toMatch(/ok {3}Dark: --ink-2 on --paper \d+\.\d\d:1 \(min 7\): body text/);
    expect(whole.output).toMatch(/ok {3}Dark: --gain and --loss \d+\.\d under deuteranopia \(target 8\)/);
    expect(whole.output).toMatch(/ok {3}Dark: --on-band-2 on --band \d+\.\d\d:1 \(min 4\.5\)/);
    expect(whole.output).toMatch(/ok {3}Dark: --blue on --frame \d+\.\d\d:1 \(min 3, colour alone carries the meaning\)/);
    expect(whole.output).toContain("ok   Dark: surfaces and lines order away from --paper");
    expect(whole.output).toContain("All checks pass.");
    expect(whole.status).toBe(0);

    // A faint that melts into the Dark paper fails in Dark, by name, while Light still passes.
    const faint = run(dark(DARK_COPY.replace(/--faint: [^;]+;/, "--faint: #f2f2f2;")));
    expect(faint.status).toBe(1);
    expect(faint.output).toMatch(/FAIL Dark: --faint on --paper 1\.\d\d:1 \(min 3\)/);
    expect(faint.output).toContain("ok   --faint on --paper 3.17:1");
  });

  it("fails a Dark block that is only half made, naming every colour with no dark value", () => {
    const half = run(dark("  --paper: #0b0d12;\n  --ink: #ffffff;"));
    expect(half.status).toBe(1);
    expect(half.output).toContain('FAIL Dark: --blue has no dark value in :root[data-theme="dark"] (ADR 0019: each colour is re-stepped for Dark)');
    expect(half.output).toContain("FAIL Dark: --on-band-2 has no dark value");
    expect(half.output).toContain("FAIL Dark: --band-todo has no dark value");
    expect(half.output).toContain("FAIL Dark: --check-tick has no dark value");
    expect(half.output).not.toContain("--paper has no dark value");
  });

  it("freezes the spec §3.1 values", () => {
    expect(real.output).toContain("ok   --blue is #1f3fae (spec §3.1)");
    expect(real.output).toContain("ok   --gain-deep is #087f5b (spec §3.1)");
    expect(real.output).toContain("ok   --wait is #f97316 (spec §3.1)");

    const ink = run(change(REAL, "ink", "#333333"));
    expect(ink.status).toBe(1);
    expect(ink.output).toContain("FAIL --ink is #0b0d12 (spec §3.1)");
  });

  // Token-first: a colour is a literal once, in the spec block; every other name points at its meaning.
  it("re-points the old names at their meanings and refuses any new literal colour", () => {
    for (const line of [
      "--you points at --blue",
      "--src points at --ink",
      "--mint points at --gain",
      "--coral points at --loss",
      "--success points at --gain-ink",
      "--warning points at --wait-ink",
      "--danger points at --loss",
      "--sun points at --ink",
      "--violet points at --muted",
      "--bg points at --paper",
      "--band points at --royal",
      "--key-number points at --accent",
    ])
      expect(real.output).toContain(`ok   ${line}`);

    const mint = run(change(REAL, "mint", "#12b886"));
    expect(mint.status).toBe(1);
    expect(mint.output).toContain("FAIL --mint points at --gain");
    expect(mint.output).toContain("FAIL --mint is a literal colour (#12b886) outside the spec block: point it at a spec token");

    const stray = run(add(REAL, "--teal: #00a0a0;"));
    expect(stray.status).toBe(1);
    expect(stray.output).toContain("FAIL --teal is a literal colour (#00a0a0) outside the spec block");
  });

  // Spec §2.4's contrast table, row by row, at the spec's ratio to two decimals.
  it("holds every contrast pair of spec §2.4 at the spec's ratio", () => {
    for (const [pair, rule] of [
      ["--ink-2 on --paper 12.30:1", "min 7, spec 12.30"],
      ["--ink on --paper 19.43:1", "min 7, spec 19.43"],
      ["--muted on --wash 5.46:1", "min 4.5, spec 5.46"],
      ["--faint on --paper 3.17:1", "min 3, spec 3.17"],
      ["--blue on --blue-tint 7.87:1", "min 4.5, spec 7.87"],
      ["--gain-ink on --gain-tint 4.81:1", "min 4.5, spec 4.81"],
      ["--loss-ink on --loss-tint 6.75:1", "min 4.5, spec 6.75"],
      ["--wait-ink on --wait-tint 5.16:1", "min 4.5, spec 5.16"],
      ["--on-blue on --loss 6.11:1", "min 4.5, spec 6.11"],
      ["--on-blue on --gain-deep 5.00:1", "min 4.5, spec 5.00"],
      ["--ink on --gain 6.53:1", "min 4.5, spec 6.53"],
      ["--gain on --wash 2.77:1", "below 3:1 by design, spec 2.77"],
      ["--wait on --wash 2.61:1", "below 3:1 by design, spec 2.61"],
      ["--loss on --wash 5.70:1", "min 3, spec 5.70"],
    ])
      expect(real.output).toContain(`ok   ${pair} (${rule})`);

    // A lighter wash moves the spec's ratios: the table fails until the spec changes with it.
    const wash = run(change(REAL, "wash", "#ffffff"));
    expect(wash.status).toBe(1);
    expect(wash.output).toMatch(/FAIL --muted on --wash 5\.86:1 \(min 4\.5, spec 5\.46\)/);
  });

  // Spec §2.4's separation table: OKLab x 100, under normal vision and Machado 2009 colour blindness at full severity.
  it("holds every colour-separation figure of spec §2.4, and allows a pair below target only with the spec's reason", () => {
    for (const line of [
      "--gain and --loss 34.1 under normal (target 15, spec 34.1)",
      "--gain and --loss 13.0 under deuteranopia (target 8, spec 13.0)",
      "--gain and --wait 10.6 under protanopia (target 8, spec 10.6)",
      "--loss and --wait 14.0 under tritanopia (target 8, spec 14.0)",
      "--blue and --wait 44.8 under normal (target 15, spec 44.8)",
    ])
      expect(real.output).toContain(`ok   ${line}`);
    expect(real.output).toContain("ok   --loss and --gain-deep 5.7 under deuteranopia (target 8, spec 5.7): below target, never adjacent data marks");

    // An orange that drifts toward the green fails the table.
    const orange = run(change(REAL, "wait", "#c9a227"));
    expect(orange.status).toBe(1);
    expect(orange.output).toMatch(/FAIL --gain and --wait \d+\.\d under normal \(target 15, spec 28\.1\)/);
  });

  it("measures the app's pairs: text minimums, control edges and the Band", () => {
    for (const pair of ["--ink on --paper", "--muted on --raised", "--accent on --accent-tint", "--on-accent on --accent-fill", "--on-fill on --fill", "--on-danger on --danger", "--violet-ink on --violet-tint", "--line-strong on --raised", "--ring on --paper", "--accent-fill on --paper"])
      expect(real.output, pair).toContain(`ok   ${pair} `);
    expect(real.output).toContain("ok   --on-band on --band 8.82:1 (min 4.5, spec 8.82)");
    expect(real.output).toContain("ok   --key-number on --wash 8.23:1 (min 4.5, spec 8.23)");
    expect(real.output).toContain("ok   --accent-deep is darker than --accent-fill");

    const edge = run(change(REAL, "line-strong", "#cccccc"));
    expect(edge.status).toBe(1);
    expect(edge.output).toContain("FAIL --line-strong on --paper");

    // White at 72% is laid over the Band before it is measured: read as solid white it would pass at 8.82:1.
    const half = run(change(REAL, "on-band-2", "rgb(255 255 255 / 0.5)"));
    expect(half.status).toBe(1);
    expect(half.output).toContain("FAIL --on-band-2 on --band 3.41:1 (min 4.5, spec 5.36)");
  });

  // WCAG 2.2 SC 1.4.11: a fill needs 3:1 against its surface only when colour alone carries its meaning. The kit's
  // chart series are colour-only, so each series token is listed on each chart surface.
  it("checks a fill at 3:1 only when it is listed as carrying meaning by colour alone: today the chart series", () => {
    expect(real.output).toContain("Fills that carry meaning by colour alone: --line-strong on --paper, --line-strong on --raised");
    for (const series of ["line-strong", "ink", "blue", "muted"]) {
      for (const surface of ["paper", "raised", "wash", "frame"]) expect(real.output).toMatch(new RegExp(`ok +--${series} on --${surface} \\d+\\.\\d\\d:1 \\(min 3, colour alone carries the meaning\\)`));
    }
    expect(real.output).not.toContain("--gain on --paper");

    const listed = run(REAL, [["gain", "wash"]]);
    expect(listed.status).toBe(1);
    expect(listed.output).toContain("FAIL --gain on --wash 2.77:1 (min 3, colour alone carries the meaning)");
  });
});
