import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENT_FAMILIES, accentFamiliesPainted, familyOf, over, paintsOf, parseColors, type AccentTokens, type Paint, type PaintKind } from "./accent-families";

/**
 * F1's accent count (spec 2026-11-05 §3 row 7: "≥ 3 distinct accent colours visible on /study with a Widget"). The token
 * tables are read from src/app/globals.css, Light (`:root`) and Dark (`:root.dark`), the way the page resolves them at
 * runtime: every --mint*, --coral*, --sun*, --violet* variant, and every other hex token as a neutral.
 */
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const DARK_AT = CSS.indexOf(":root.dark {\n    color-scheme: dark;");
function table(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gim)) out[m[1]] ??= m[2];
  return out;
}
const THEMES = {
  light: table(CSS.slice(CSS.indexOf(":root {"), DARK_AT)),
  dark: table(CSS.slice(DARK_AT, CSS.indexOf("\n  }\n", DARK_AT))),
} as const;
const accentsOf = (t: Record<string, string>): AccentTokens => Object.fromEntries(Object.entries(t).filter(([k]) => familyOf(k)));
// --you*, --src* and --danger are old names whose values ARE accent variants; painting them paints the accent.
const ALIASES = /^--(you|src|danger)\b/;
const neutralsOf = (t: Record<string, string>) => Object.entries(t).filter(([k]) => !familyOf(k) && !ALIASES.test(k));
const rgb = (hex: string) => parseColors(hex)[0];
const paint = (color: string, backdrop: string, kind: PaintKind = "background"): Paint => ({ color, backdrop: rgb(backdrop), kind });
const count = (tokens: AccentTokens, paints: Paint[]) => accentFamiliesPainted(tokens, paints).families;

describe("accent families [S1]", () => {
  it("reads both themes' token tables from globals.css", () => {
    for (const [name, t] of Object.entries(THEMES)) {
      for (const f of ACCENT_FAMILIES) {
        for (const v of ["", "-ink", "-tint", "-tag"]) expect(t[`--${f}${v}`], `${name} --${f}${v}`).toMatch(/^#/);
      }
      expect(t["--bg"], name).toMatch(/^#/);
      expect(t["--field"], name).toMatch(/^#/);
    }
    expect(THEMES.dark["--mint-tint"]).toHaveLength(9); // #rrggbbaa: an 8 % tint
  });

  it("parses the colour forms getComputedStyle and the tokens use", () => {
    expect(parseColors("rgb(18, 184, 134)")).toEqual([[18, 184, 134, 1]]);
    expect(parseColors("rgba(102, 205, 170, 0.08)")).toEqual([[102, 205, 170, 0.08]]);
    expect(parseColors("rgb(102 205 170 / 0.5)")).toEqual([[102, 205, 170, 0.5]]);
    expect(parseColors("color(srgb 1 0 0.5 / 0.25)")).toEqual([[255, 0, 127.5, 0.25]]);
    expect(parseColors("#fff")).toEqual([[255, 255, 255, 1]]);
    expect(parseColors("#12b886")).toEqual([[18, 184, 134, 1]]);
    expect(parseColors("#66cdaa14")).toEqual([[102, 205, 170, 20 / 255]]);
    expect(parseColors("transparent")).toEqual([[0, 0, 0, 0]]);
    expect(parseColors("none")).toEqual([]);
    expect(parseColors('url("a.svg#x12"), linear-gradient(rgb(1, 2, 3), rgba(4, 5, 6, 0.5))')).toEqual([[1, 2, 3, 1], [4, 5, 6, 0.5]]);
  });

  it("composites a translucent colour over its backdrop", () => {
    expect(over([255, 0, 0, 0.5], [0, 0, 255, 1])).toEqual([127.5, 0, 127.5, 1]);
    expect(over([10, 20, 30, 1], [0, 0, 0, 1])).toEqual([10, 20, 30, 1]);
    expect(over([10, 20, 30, 0], [7, 8, 9, 1])).toEqual([7, 8, 9, 1]);
  });

  for (const theme of ["light", "dark"] as const) {
    const t = THEMES[theme], tokens = accentsOf(t);

    it(`${theme}: every variant of a family counts as that family, on --bg and on --field`, () => {
      for (const [name, value] of Object.entries(tokens)) {
        const f = familyOf(name);
        for (const surface of ["--bg", "--field"]) {
          for (const kind of ["background", "text", "border"] as const) {
            expect(count(tokens, [paint(value, t[surface], kind)]), `${theme} ${name} as ${kind} on ${surface}`).toEqual([f]);
          }
        }
      }
    });

    it(`${theme}: Chrome's serialised tint (alpha rounded) still matches its token`, () => {
      for (const f of ACCENT_FAMILIES) {
        const [r, g, b, a] = rgb(t[`--${f}-tint`]);
        const served = `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
        expect(count(tokens, [paint(served, t["--bg"])]), `${theme} --${f}-tint as ${served}`).toEqual([f]);
      }
    });

    it(`${theme}: the old names (--you*, --src*, --danger) count as the accent they are`, () => {
      const families = (k: string) => count(tokens, [paint(t[k], t["--field"], "text")]);
      expect(families("--you")).toEqual(["mint"]);
      expect(families("--src-tint")).toEqual(["sun"]);
      expect(families("--danger")).toEqual(["coral"]);
    });

    it(`${theme}: no neutral token counts as an accent, painted any way on any surface`, () => {
      const neutrals = neutralsOf(t);
      expect(neutrals.length).toBeGreaterThan(15);
      const paints = neutrals.flatMap(([, v]) => ["--bg", "--field", "--bubble"].flatMap((s) => (["background", "text", "border"] as const).map((k) => paint(v, t[s], k))));
      expect(count(tokens, paints)).toEqual([]);
    });

    it(`${theme}: a fully transparent or invisible-on-its-backdrop accent does not count`, () => {
      const [r, g, b] = rgb(t["--mint"]);
      expect(count(tokens, [paint(`rgba(${r}, ${g}, ${b}, 0)`, t["--bg"])])).toEqual([]);
      expect(count(tokens, [paint("transparent", t["--bg"])])).toEqual([]);
      // The tint painted on itself: what is painted equals what was there, so nothing is seen.
      const tintOnBg = over(rgb(t["--mint-tint"]), rgb(t["--bg"]));
      expect(count(tokens, [{ color: t["--mint-tint"], backdrop: tintOnBg, kind: "background" }])).toEqual(theme === "dark" ? ["mint"] : []);
      expect(count(tokens, [{ color: `rgba(${r}, ${g}, ${b}, 0.004)`, backdrop: rgb(t["--bg"]), kind: "background" }])).toEqual([]);
    });
  }

  // The finding "Light 0, Dark 1": the same panel (ink text, a tint card, a tag pill, an ink label) must score the same
  // in both themes, because it paints the same four families.
  it("one panel scores the same in Light and Dark", () => {
    const panel = (theme: "light" | "dark") => {
      const t = THEMES[theme];
      return accentFamiliesPainted(accentsOf(t), [
        paint(t["--mint-ink"], t["--field"], "text"),
        paint(t["--coral-tint"], t["--field"]),
        paint(t["--sun-tag"], t["--field"]),
        paint(t["--violet-ink"], t["--sun-tag"], "text"),
      ]);
    };
    expect(panel("light").families).toEqual(["mint", "coral", "sun", "violet"]);
    expect(panel("dark").families).toEqual(["mint", "coral", "sun", "violet"]);
    expect(panel("light").via.coral).toBe("--coral-tint as background");
  });

  it("paintsOf: backdrops are the composited backgrounds of the ancestors, and hidden nodes paint nothing", () => {
    const t = THEMES.dark;
    const nodes = [
      { parent: -1, visible: true, background: t["--bg"], gradients: [], on: [] },
      { parent: 0, visible: true, background: t["--coral-tint"], gradients: [], on: [{ color: t["--ink"], kind: "text" as const }] },
      { parent: 1, visible: true, background: "rgba(0, 0, 0, 0)", gradients: [], on: [{ color: t["--violet"], kind: "border" as const }] },
      { parent: 0, visible: false, background: t["--sun-tag"], gradients: [], on: [{ color: t["--mint"], kind: "text" as const }] },
      { parent: 0, visible: true, background: "rgba(0, 0, 0, 0)", gradients: [`linear-gradient(${t["--field"]}, ${t["--field"]})`], on: [] },
    ];
    const paints = paintsOf(nodes);
    const tinted = over(rgb(t["--coral-tint"]), rgb(t["--bg"]));
    expect(paints).toContainEqual({ color: t["--coral-tint"], backdrop: rgb(t["--bg"]), kind: "background" });
    expect(paints).toContainEqual({ color: t["--ink"], backdrop: tinted, kind: "text" });
    expect(paints).toContainEqual({ color: t["--violet"], backdrop: tinted, kind: "border" });
    expect(paints).toContainEqual({ color: `linear-gradient(${t["--field"]}, ${t["--field"]})`, backdrop: rgb(t["--bg"]), kind: "gradient" });
    expect(paints.some((p) => p.color === t["--sun-tag"] || p.color === t["--mint"])).toBe(false);
    expect(accentFamiliesPainted(accentsOf(t), paints).families).toEqual(["coral", "violet"]);
  });

  it("an empty page counts nothing", () => {
    expect(accentFamiliesPainted(accentsOf(THEMES.light), []).families).toEqual([]);
    expect(accentFamiliesPainted({}, [paint(THEMES.light["--mint"], THEMES.light["--bg"])]).families).toEqual([]);
  });
});
