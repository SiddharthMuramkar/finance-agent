import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENT_FAMILIES, accentFamiliesPainted, familyMisuses, familyOf, over, paintsOf, parseColors, visibleBoxes, type AccentTokens, type Box, type LaidOutNode, type MisuseNode, type Paint, type PaintKind } from "./accent-families";

/**
 * The Widget accent families, until #32 lands (ADR 0015 maps them to the Signal colours): they belong to Widgets; the app's chrome paints none of them. The token tables
 * are read from src/app/globals.css, Light (`:root`) and Dark (`:root.dark`), the way the page resolves them at runtime:
 * every --mint*, --coral*, --sun*, --violet* variant, and every other hex token (the chrome's surfaces, text, lines,
 * accent, status and ring colours) as a neutral that must never count as a Widget accent.
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
// --you* and --src* are Widget names whose values ARE accent variants; painting them paints the accent. --danger is
// a status colour of its own, so it is a neutral: no chrome token may count as a Widget accent.
const ALIASES = /^--(you|src)\b/;
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
      expect(t["--paper"], name).toMatch(/^#/);
      expect(t["--raised"], name).toMatch(/^#/);
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

    it(`${theme}: every variant of a family counts as that family, on --paper and on --raised`, () => {
      for (const [name, value] of Object.entries(tokens)) {
        const f = familyOf(name);
        for (const surface of ["--paper", "--raised"]) {
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
        expect(count(tokens, [paint(served, t["--paper"])]), `${theme} --${f}-tint as ${served}`).toEqual([f]);
      }
    });

    it(`${theme}: the Widget names (--you*, --src*) count as the accent they are, and the status --danger counts as none`, () => {
      const families = (k: string) => count(tokens, [paint(t[k], t["--raised"], "text")]);
      expect(families("--you")).toEqual(["mint"]);
      expect(families("--src-tint")).toEqual(["sun"]);
      expect(families("--danger")).toEqual([]);
    });

    it(`${theme}: no neutral token counts as an accent, painted any way on any surface`, () => {
      const neutrals = neutralsOf(t);
      expect(neutrals.length).toBeGreaterThan(15);
      const paints = neutrals.flatMap(([, v]) => ["--paper", "--raised", "--wash"].flatMap((s) => (["background", "text", "border"] as const).map((k) => paint(v, t[s], k))));
      expect(count(tokens, paints)).toEqual([]);
    });

    it(`${theme}: a fully transparent or invisible-on-its-backdrop accent does not count`, () => {
      const [r, g, b] = rgb(t["--mint"]);
      expect(count(tokens, [paint(`rgba(${r}, ${g}, ${b}, 0)`, t["--paper"])])).toEqual([]);
      expect(count(tokens, [paint("transparent", t["--paper"])])).toEqual([]);
      // The tint painted on itself: what is painted equals what was there, so nothing is seen.
      const tintOnBg = over(rgb(t["--mint-tint"]), rgb(t["--paper"]));
      expect(count(tokens, [{ color: t["--mint-tint"], backdrop: tintOnBg, kind: "background" }])).toEqual(theme === "dark" ? ["mint"] : []);
      expect(count(tokens, [{ color: `rgba(${r}, ${g}, ${b}, 0.004)`, backdrop: rgb(t["--paper"]), kind: "background" }])).toEqual([]);
    });
  }

  // The finding "Light 0, Dark 1": the same panel (ink text, a tint card, a tag pill, an ink label) must score the same
  // in both themes, because it paints the same four families.
  it("one panel scores the same in Light and Dark", () => {
    const panel = (theme: "light" | "dark") => {
      const t = THEMES[theme];
      return accentFamiliesPainted(accentsOf(t), [
        paint(t["--mint-ink"], t["--raised"], "text"),
        paint(t["--coral-tint"], t["--raised"]),
        paint(t["--sun-tag"], t["--raised"]),
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
      { parent: -1, visible: true, background: t["--paper"], gradients: [], on: [] },
      { parent: 0, visible: true, background: t["--coral-tint"], gradients: [], on: [{ color: t["--ink"], kind: "text" as const }] },
      { parent: 1, visible: true, background: "rgba(0, 0, 0, 0)", gradients: [], on: [{ color: t["--violet"], kind: "border" as const }] },
      { parent: 0, visible: false, background: t["--sun-tag"], gradients: [], on: [{ color: t["--mint"], kind: "text" as const }] },
      { parent: 0, visible: true, background: "rgba(0, 0, 0, 0)", gradients: [`linear-gradient(${t["--raised"]}, ${t["--raised"]})`], on: [] },
    ];
    const paints = paintsOf(nodes);
    const tinted = over(rgb(t["--coral-tint"]), rgb(t["--paper"]));
    expect(paints).toContainEqual({ color: t["--coral-tint"], backdrop: rgb(t["--paper"]), kind: "background" });
    expect(paints).toContainEqual({ color: t["--ink"], backdrop: tinted, kind: "text" });
    expect(paints).toContainEqual({ color: t["--violet"], backdrop: tinted, kind: "border" });
    expect(paints).toContainEqual({ color: `linear-gradient(${t["--raised"]}, ${t["--raised"]})`, backdrop: rgb(t["--paper"]), kind: "gradient" });
    expect(paints.some((p) => p.color === t["--sun-tag"] || p.color === t["--mint"])).toBe(false);
    expect(accentFamiliesPainted(accentsOf(t), paints).families).toEqual(["coral", "violet"]);
  });

  it("an empty page counts nothing", () => {
    expect(accentFamiliesPainted(accentsOf(THEMES.light), []).families).toEqual([]);
    expect(accentFamiliesPainted({}, [paint(THEMES.light["--mint"], THEMES.light["--paper"])]).families).toEqual([]);
  });
});

/**
 * Seen means on the screenshot: a box of some size that survives every overflow-clipping ancestor (a collapsed
 * overflow-hidden box, a scroller scrolled away from it, /study's h-dvh overflow-hidden frame) and the page itself
 * (a fixed box: the viewport). Clipping follows CSS: an absolute box escapes clipping ancestors below its containing
 * block (the nearest positioned or transformed ancestor), a fixed box escapes all but a transformed one.
 */
describe("accent families: only what the screenshot shows counts [S1]", () => {
  const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });
  const PAGE = box(0, 0, 1512, 982);
  const node = (parent: number, rect: Box, more: Partial<LaidOutNode> = {}): LaidOutNode =>
    ({ parent, rect, shown: true, position: "flow", positioned: false, containsFixed: false, clipX: null, clipY: null, ...more });
  const clips = (r: Box) => ({ clipX: [r.left, r.right] as [number, number], clipY: [r.top, r.bottom] as [number, number] });
  const seen = (nodes: LaidOutNode[], page = PAGE, viewport = PAGE) => visibleBoxes(nodes, page, viewport);

  it("a box inside a collapsed overflow-hidden box is not seen; one outside it is", () => {
    const collapsed = box(16, 100, 400, 100);
    expect(seen([node(-1, PAGE), node(0, collapsed, clips(collapsed)), node(1, box(16, 100, 400, 140)), node(0, box(16, 200, 400, 240))]))
      .toEqual([true, false, false, true]);
  });

  it("a box scrolled out of a scroller is not seen; its sibling in view is, even half in view", () => {
    const chat = box(16, 60, 700, 900);
    expect(seen([node(-1, PAGE), node(0, chat, clips(chat)), node(1, box(16, 1200, 700, 1300)), node(1, box(16, -400, 700, -300)), node(1, box(16, 880, 700, 940))]))
      .toEqual([true, true, false, false, true]);
  });

  it("only one axis clips when only overflow-x or overflow-y does", () => {
    const strip = box(0, 100, 300, 140);
    expect(seen([node(-1, PAGE), node(0, strip, { clipX: [0, 300] }), node(1, box(320, 100, 400, 140)), node(1, box(100, 160, 200, 200))]))
      .toEqual([true, true, false, true]);
  });

  it("/study's h-dvh overflow-hidden frame hides what overflows below the fold, and the page hides what is off it", () => {
    const frame = box(0, 0, 1512, 982);
    expect(seen([node(-1, PAGE), node(0, frame, clips(frame)), node(1, box(0, 990, 400, 1100)), node(0, box(-500, 10, -400, 40)), node(0, box(10, 1000, 100, 1040))]))
      .toEqual([true, true, false, false, false]);
  });

  it("a full-page screenshot shows a box below the viewport when the page itself is that tall", () => {
    expect(seen([node(-1, box(0, 0, 1512, 2000)), node(0, box(0, 1500, 400, 1600))], box(0, 0, 1512, 2000))).toEqual([true, true]);
  });

  it("an absolute box escapes clipping ancestors below its containing block, not its containing block", () => {
    const hidden = box(16, 100, 400, 100);
    const nodes = [
      node(-1, PAGE),
      node(0, box(0, 0, 1512, 600), { positioned: true }),
      node(1, hidden, clips(hidden)),
      node(2, box(16, 100, 200, 140), { position: "absolute" }),
      node(0, box(0, 0, 1512, 100), { positioned: true, ...clips(box(0, 0, 1512, 100)) }),
      node(4, box(16, 100, 200, 140), { position: "absolute" }),
    ];
    expect(seen(nodes)).toEqual([true, true, false, true, true, false]);
  });

  it("a fixed box escapes every clipping ancestor but a transformed one, and is clipped to the viewport, not the page", () => {
    const hidden = box(16, 100, 400, 100);
    const page = box(0, 0, 1512, 3000), viewport = box(0, 0, 1512, 982);
    const nodes = [
      node(-1, page),
      node(0, hidden, { positioned: true, ...clips(hidden) }),
      node(1, box(16, 900, 200, 940), { position: "fixed" }),
      node(1, box(16, 1500, 200, 1540), { position: "fixed" }),
      node(0, hidden, { containsFixed: true, positioned: true, ...clips(hidden) }),
      node(4, box(16, 900, 200, 940), { position: "fixed" }),
    ];
    expect(seen(nodes, page, viewport)).toEqual([true, false, true, false, false, false]);
  });

  it("a hidden box or a 0x0 box is not seen", () => {
    expect(seen([node(-1, PAGE), node(0, box(0, 0, 100, 100), { shown: false }), node(0, box(10, 10, 10, 10))])).toEqual([true, false, false]);
  });

  it("an accent clipped away does not count: Light and Dark, the matcher sees only the seen nodes", () => {
    for (const t of [THEMES.light, THEMES.dark]) {
      const chat = box(16, 60, 700, 900);
      const laid = [node(-1, PAGE), node(0, chat, clips(chat)), node(1, box(16, 1200, 700, 1300)), node(1, box(16, 100, 700, 140))];
      const visible = seen(laid);
      const painted = [
        { parent: -1, visible: visible[0], background: t["--paper"], gradients: [], on: [] },
        { parent: 0, visible: visible[1], background: t["--raised"], gradients: [], on: [] },
        { parent: 1, visible: visible[2], background: t["--coral-tint"], gradients: [], on: [{ color: t["--violet-ink"] ?? t["--violet"], kind: "text" as const }] },
        { parent: 1, visible: visible[3], background: t["--sun-tag"], gradients: [], on: [] },
      ];
      expect(accentFamiliesPainted(accentsOf(t), paintsOf(painted)).families).toEqual(["sun"]);
    }
  });
});

const misuse = (over: Partial<MisuseNode> & Pick<MisuseNode, "rect">): MisuseNode => ({
  parent: -1,
  visible: true,
  background: "transparent",
  gradients: [],
  on: [],
  label: "card",
  ...over,
});
const rect = (w: number, h: number): Box => ({ left: 0, top: 0, right: w, bottom: h });

describe("familyMisuses tells a fill from a mark (A7a)", () => {
  for (const theme of ["light", "dark"] as const) {
    const t = THEMES[theme];
    const tokens = accentsOf(t);

    it(`${theme}: a wide tinted card is a fill; a rule, a dot and a marker are not`, () => {
      const wide = familyMisuses(tokens, [
        misuse({ rect: rect(400, 200), background: t["--raised"], label: "surface" }),
        misuse({ parent: 0, rect: rect(300, 80), background: t["--violet-tint"], label: "card" }),
      ]);
      expect(wide.fills).toHaveLength(1);
      expect(wide.fills[0]).toContain("--violet-tint");
      expect(wide.text).toEqual([]);
      const marks = familyMisuses(tokens, [
        misuse({ rect: rect(300, 2), background: t["--sun"], label: "rule" }),
        misuse({ rect: rect(8, 8), background: t["--mint"], label: "dot" }),
        misuse({ rect: rect(14, 14), background: t["--you"] ?? t["--mint"], label: "marker" }),
      ]);
      expect(marks.fills).toEqual([]);
    });

    it(`${theme}: family text counts, and a border, a stroke, a chart fill and a hidden node do not`, () => {
      const text = familyMisuses(tokens, [
        misuse({ rect: rect(200, 40), label: "words", on: [{ color: t["--sun-ink"], kind: "text" }] }),
        misuse({ rect: rect(80, 20), label: "svg", on: [{ color: t["--violet-ink"], kind: "text" }] }),
        misuse({ rect: rect(200, 40), label: "ok", on: [{ color: t["--success"] ?? t["--ink"], kind: "text" }, { color: t["--ink"], kind: "text" }] }),
      ]);
      expect(text.text).toHaveLength(2);
      const ignored = familyMisuses(tokens, [
        misuse({ rect: rect(200, 40), label: "edge", on: [{ color: t["--coral"], kind: "border" }] }),
        misuse({ rect: rect(80, 40), label: "stroke", on: [{ color: t["--mint-ink"], kind: "stroke" }] }),
        misuse({ rect: rect(80, 40), label: "series", on: [{ color: t["--violet"], kind: "fill" }] }),
        misuse({ rect: rect(300, 80), visible: false, background: t["--coral"], label: "hidden" }),
      ]);
      expect(ignored).toEqual({ fills: [], text: [] });
    });
  }
});
