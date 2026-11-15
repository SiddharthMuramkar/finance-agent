// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR 0013 and ADR 0014: one flat set of control rules for the app and for Widgets. Block 2 is gone.
// No file in src/app or src/widgets draws the old raised look by hand, except the KNOWN list, which may only shrink.

const css = readFileSync("src/app/globals.css", "utf8");
const LAYER_AT = css.indexOf("@layer components {");
const LAYER_END = css.indexOf("\n}\n", LAYER_AT);
const layer = css.slice(LAYER_AT, LAYER_END);
const BLOCK1_AT = css.indexOf("/* ---- Block 1: app controls (ADR 0013)");
const block1 = css.slice(BLOCK1_AT, LAYER_END);

/** The body of the first rule at or after `from` (in `text`) whose selector contains `selector`, found by brace matching. */
function rule(selector: string, text = css, from = 0): string {
  const at = text.indexOf(selector, from);
  expect(at, `${selector} is in the stylesheet`).toBeGreaterThan(-1);
  const open = text.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

describe("Block 2 is gone, and the one control set is flat (ADR 0014)", () => {
  it("has no Block 2, and the components layer holds no Widget fence or raised look", () => {
    expect(css).not.toContain("/* ---- Block 2");
    expect(BLOCK1_AT).toBeGreaterThan(LAYER_AT);
    for (const banned of [":where(.genui", ":not(:where(.genui *))", "--lip", "linear-gradient(180deg", "var(--shadow)", "999px", "translateY(", "scale("]) {
      expect(layer, banned).not.toContain(banned);
    }
  });

  it("holds no lip, no lift, no pill and no drop shadow", () => {
    for (const banned of ["--lip", "translateY(", "999px", "linear-gradient(180deg", "var(--shadow)", "scale("]) expect(block1, banned).not.toContain(banned);
  });

  it("draws a control as a face, a 1px rim and a label, with 8px corners, weight 500, and colour-only transitions", () => {
    const base = rule(".btn,\n  .chip {", block1);
    expect(base).toContain("--face: var(--paper);");
    expect(base).toContain("--rim: var(--line);");
    expect(base).toContain("--label: var(--ink);");
    expect(base).toContain("border: 1px solid var(--rim);");
    expect(base).toContain("border-radius: 8px;");
    expect(base).toContain("background-color: var(--face);");
    expect(base).toContain("font-weight: 500;");
    expect(base).not.toMatch(/transform|box-shadow:/);
    expect(base).toMatch(/transition:[^;]*background-color var\(--dur-ui\)/);
  });

  it("sizes: md 36, xs 28, sm 32, lg 44, chip 28, and a 32px square ghost icon with 16px icons at stroke 1.75", () => {
    expect(rule(".btn {", block1)).toContain("min-height: 36px;");
    expect(rule(".btn-xs {", block1)).toContain("min-height: 28px;");
    expect(rule(".btn-sm {", block1)).toContain("min-height: 32px;");
    expect(rule(".btn-lg {", block1)).toContain("min-height: 44px;");
    expect(rule("}\n  .chip {", block1)).toContain("min-height: 28px;");
    const icon = rule(".btn-icon {", block1);
    for (const line of ["--face: transparent;", "--rim: transparent;", "--label: var(--ink-2);", "width: 32px;", "height: 32px;"]) expect(icon).toContain(line);
    const svg = rule(".btn-icon svg,\n  .btn-tertiary svg {", block1);
    for (const line of ["width: 16px;", "height: 16px;", "stroke-width: 1.75;"]) expect(svg).toContain(line);
  });

  it("tiers: the primary is the fill, the tertiary text only in muted, danger red with its own label colour", () => {
    expect(rule(".btn-primary {", block1)).toMatch(/--face: var\(--fill\);\s*--rim: var\(--fill\);\s*--label: var\(--on-fill\);/);
    expect(rule(".btn-tertiary {", block1)).toMatch(/--face: transparent;\s*--rim: transparent;\s*--label: var\(--muted\);/);
    expect(rule(".btn-danger {", block1)).toMatch(/--face: var\(--danger\);\s*--rim: var\(--danger\);\s*--label: var\(--on-danger\);/);
  });

  it("hover and press are colour steps: the primary goes --fill → --fill-hover → --fill-active, and nothing moves", () => {
    expect(rule(".btn-primary:hover:not(:disabled)", block1)).toContain("background-color: var(--fill-hover);");
    expect(rule(".btn-secondary:hover:not(:disabled)", block1)).toContain("border-color: var(--ink-2);");
    const press = rule(".btn:active:not(:disabled)", block1);
    expect(press).toContain("transition-duration: var(--dur-press);");
    expect(press).toContain("color-mix(in srgb, var(--face) 92%, var(--ink))");
    expect(rule(".btn-primary:active:not(:disabled)", block1)).toContain("background-color: var(--fill-active);");
    expect(block1).not.toMatch(/transform/);
  });

  it("focus is a 2px ring at a 2px offset", () => {
    expect(rule(".btn:focus-visible,\n  .chip:focus-visible {", block1)).toMatch(/outline: 2px solid var\(--ring\);\s*outline-offset: 2px;/);
    expect(rule(".link:focus-visible", block1)).toMatch(/outline: 2px solid var\(--ring\);\s*outline-offset: 2px;/);
    expect(rule(':where(a[href], summary, [tabindex]:not([tabindex="-1"])):focus-visible', block1)).toMatch(/outline: 2px solid var\(--ring\);\s*outline-offset: 2px;/);
  });

  it("selected is an accent tint, an accent rim and an inner accent line, and no marker grows", () => {
    const at = block1.indexOf('.btn[aria-pressed="true"],');
    const open = block1.indexOf("{", at);
    const selector = block1.slice(at, open);
    expect(selector).not.toContain("story-toggle");
    const selected = rule('.btn[aria-pressed="true"],', block1);
    expect(selected).toContain("--face: var(--accent-tint);");
    expect(selected).toContain("--rim: var(--accent);");
    expect(selected).toContain("box-shadow: inset 0 0 0 1px var(--rim);");
    expect(css).not.toMatch(/\.timeline-marker\b/);
    expect(block1).not.toContain('.btn[aria-current="true"]');
  });

  it("disabled is see-through with a hairline rim and a faint label; a disabled fill is the dim fill", () => {
    const disabled = rule('.btn:disabled:not([aria-busy="true"]),', block1);
    for (const line of ["--face: transparent;", "--rim: var(--rule);", "--label: var(--faint);", "box-shadow: none;", "cursor: not-allowed;"]) expect(disabled).toContain(line);
    expect(rule('.btn-primary:disabled:not([aria-busy="true"]),', block1)).toMatch(/--face: var\(--dim\);\s*--rim: var\(--dim\);\s*--label: var\(--on-dim\);/);
  });

  it("fields: a strong edge, and on focus the accent edge with a 3px halo (.field-shell around a .field-bare too)", () => {
    expect(rule(".field,\n  .field-shell {", block1)).toContain("border: 1px solid var(--line-strong);");
    expect(rule("}\n  .field-shell {", block1)).toContain("border-radius: 10px;");
    const focus = rule(".field:focus,", block1);
    expect(focus).toContain("border-color: var(--accent);");
    expect(focus).toContain("box-shadow: 0 0 0 3px var(--accent-halo);");
    expect(block1).toContain(".field-shell:has(.field-bare:focus)");
  });

  it("menu rows are flat 32px rows; every floating layer is a .popover with the pop shadow", () => {
    const row = rule(".menu-item {", block1);
    expect(row).toContain("min-height: 32px;");
    expect(row).toContain("background-color: transparent;");
    expect(row).not.toMatch(/box-shadow|border: 1px/);
    const popover = rule(".popover {", block1);
    expect(popover).toContain("border-radius: 12px;");
    expect(popover).toContain("box-shadow: var(--shadow-pop);");
  });

  it("a family tag tone sets only its dot", () => {
    for (const family of ["you", "src", "mint", "coral", "sun", "violet"]) {
      const tone = rule(`.tag[data-tone="${family}"]`);
      expect(tone).toContain(`--tag-dot: var(--${family});`);
      expect(tone).not.toContain("--tag-bg");
      expect(tone).not.toContain("--tag-ink");
    }
  });

  it("tags gain the status tones, each from its status token and tint", () => {
    for (const tone of ["success", "warning", "danger"]) {
      expect(rule(`.tag[data-tone="${tone}"] {`, block1)).toMatch(new RegExp(`--tag-bg: var\\(--${tone}-tint\\);\\s*--tag-ink: var\\(--${tone}\\);\\s*--tag-dot: var\\(--${tone}\\);`));
    }
  });

  it("turns transitions off for reduced motion", () => {
    const reduced = block1.indexOf("@media (prefers-reduced-motion: reduce) {");
    expect(reduced).toBeGreaterThan(-1);
    expect(rule(".btn,", block1, reduced)).toContain("transition: none");
  });

  it("no decorative entrance or pulse is left", () => {
    for (const name of ["ring-pulse", "fade-rise", "widget-stage-in", "animate-ring-pulse", "animate-fade-rise", "animate-widget-stage-in", "tab-underline"]) {
      expect(css).not.toContain(name);
    }
  });

  it("the kit's More settings trigger is flat", () => {
    const trigger = rule(".genui .openui-accordion-trigger {");
    expect(trigger).toContain("border: 1px solid var(--line);");
    expect(trigger).toContain("border-radius: 8px;");
    expect(trigger).toContain("box-shadow: none;");
    const focus = rule(".genui .openui-accordion-trigger:focus-visible");
    expect(focus).toContain("outline: 2px solid var(--ring);");
    expect(focus).toContain("outline-offset: 2px;");
  });
});

/**
 * The old raised look drawn by hand in an app file, outside the stylesheet's blocks. Each rule names what is wrong.
 * KNOWN lists today's offenders and the rules each breaks. It may only shrink: a Phase B package removes its own entries
 * when it restyles the file, and an entry whose file no longer offends fails until it is deleted (Phase C empties it).
 */
const RULES: Record<string, RegExp> = {
  lip: /shadow-\[0_\d+px_0|--lip\b|--lip-colour/,
  move: /(?:hover|active|focus|focus-visible):-?translate-y|(?:hover|active):-?scale-/,
  pressable: /(?<=["'` ])pressable(?=["'` ])/,
  pill: /rounded-(?:2xl|3xl)\b/,
  dropShadow: /\bshadow-(?:sm|md|lg|xl|2xl)\b/,
  widgetShadow: /var\(--shadow\)/,
  focusRing: /(?:focus|focus-visible):ring-/,
  currentButton: /<Button\b[^>]*\baria-current=/,
};
const WHY: Record<keyof typeof RULES, string> = {
  lip: "a hand-drawn lip (shadow-[0_Npx_0 …] or --lip)",
  move: "a hover or press that moves the control",
  pressable: "the pressable utility, which moves on press",
  pill: "a pill: rounded-2xl or rounder on a control (12px at most)",
  dropShadow: "a utility drop shadow (floating layers use .popover)",
  widgetShadow: "the Widgets' old soft drop shadow (var(--shadow); floating layers use --shadow-pop)",
  focusRing: "an ad-hoc focus ring (the 2px outline, or .field-shell for a text field)",
  currentButton: "a Button with aria-current, whose look was the retired .btn[aria-current] rule (C5)",
};
/** Today's offenders, each cleared by a later ticket. The list may only shrink. */
const KNOWN: Record<string, (keyof typeof RULES)[]> = {};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("no app or Widget file draws the old raised look by hand (ADR 0013, ADR 0014)", () => {
  it("each rule catches what it names, and nothing near it", () => {
    expect(RULES.lip.test('className="shadow-[0_2px_0_var(--edge)]"')).toBe(true);
    expect(RULES.lip.test('className="[--lip-colour:var(--brand-deep)]"')).toBe(true);
    expect(RULES.move.test('className="active:translate-y-px"')).toBe(true);
    expect(RULES.move.test('className="-translate-y-1/2"')).toBe(false);
    expect(RULES.pressable.test('className="chip pressable min-h-11"')).toBe(true);
    expect(RULES.pressable.test("// A Tag: it is not pressable.")).toBe(false);
    expect(RULES.pill.test('className="!rounded-2xl"')).toBe(true);
    expect(RULES.pill.test('className="rounded-xl"')).toBe(false);
    expect(RULES.dropShadow.test('className="shadow-lg"')).toBe(true);
    expect(RULES.dropShadow.test('className="shadow-[var(--shadow-pop)]"')).toBe(false);
    expect(RULES.widgetShadow.test('className="shadow-[0_6px_16px_-8px_var(--shadow)]"')).toBe(true);
    expect(RULES.widgetShadow.test('className="shadow-[var(--shadow-pop)]"')).toBe(false);
    expect(RULES.focusRing.test('className="focus:ring-1"')).toBe(true);
    expect(RULES.currentButton.test("<Button\n  key={k}\n  aria-current={selected || undefined}")).toBe(true);
    expect(RULES.currentButton.test('<Link aria-current="page">')).toBe(false);
  });

  it("only the KNOWN files (shrinking) break a rule, and each still breaks exactly the rules listed", () => {
    const found: Record<string, string[]> = {};
    for (const file of [...sources("src/app"), ...sources("src/widgets")]) {
      const text = readFileSync(file, "utf8");
      const broken = Object.keys(RULES).filter((name) => RULES[name].test(text));
      if (broken.length) found[file] = broken;
    }
    const explain = Object.entries(found)
      .filter(([file]) => !(file in KNOWN))
      .map(([file, broken]) => `${file}: ${broken.map((b) => WHY[b]).join("; ")}`);
    expect(explain, "new raised-look code: use the primitives and tokens instead (ADR 0013)").toEqual([]);
    expect(found, "KNOWN may only shrink: delete an entry (or a rule) once its file is restyled").toEqual(KNOWN);
  });
});
