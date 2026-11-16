import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENT_FAMILIES, accentFamiliesPainted, familyMisuses, familyOf, over, paintsOf, parseColors, visibleBoxes, type AccentTokens, type Box, type LaidOutNode, type MisuseNode, type Paint, type PaintKind } from "./accent-families";

/**
 * The signal families (spec §2.1; decision #17): gain, loss and wait. The token table is read from src/app/globals.css's
 * one :root block, with every var(--other) followed to its literal, the way the page resolves it at runtime: every
 * --gain*, --loss*, --wait* step, and every other colour token (the surfaces, text, lines, blue, and the older names) as
 * a neutral, or as the family it points at.
 */
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const BLOCK = CSS.split(":root {").slice(1).map((rest) => rest.slice(0, rest.indexOf("}"))).find((b) => b.includes("--paper:")) ?? "";
const RAW = Object.fromEntries([...BLOCK.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim().toLowerCase()]));
/** A name and every name it points at, in order: --mint, --gain. */
const chain = (name: string, depth = 0): string[] => {
  const next = RAW[name]?.match(/^var\((--[\w-]+)\)$/)?.[1];
  return next && depth < 8 ? [name, ...chain(next, depth + 1)] : [name];
};
const resolve = (name: string) => RAW[chain(name).at(-1)!];
/** The family a name paints: its own, or the one it points at (--mint is gain); null for a neutral. */
const familyBehind = (name: string) => chain(name).map(familyOf).find(Boolean) ?? null;
/** Every colour token, resolved to its literal hex. */
const T: Record<string, string> = Object.fromEntries(
  Object.keys(RAW)
    .map((k) => [k, resolve(k)] as const)
    .filter((e): e is readonly [string, string] => !!e[1] && /^#[0-9a-f]{3,8}$/.test(e[1])),
);
const tokens: AccentTokens = Object.fromEntries(Object.entries(T).filter(([k]) => familyOf(k)));
/** The older names that point at a family paint that family (decision #17). */
const ALIASES: Record<string, string> = { "--mint": "gain", "--mint-ink": "gain", "--coral": "loss", "--coral-ink": "loss", "--success": "gain", "--warning": "wait", "--danger": "loss" };
const neutrals = Object.entries(T).filter(([k]) => !familyBehind(k));
const rgb = (hex: string) => parseColors(hex)[0];
const paint = (color: string, backdrop: string, kind: PaintKind = "background"): Paint => ({ color, backdrop: rgb(backdrop), kind });
const count = (paints: Paint[]) => accentFamiliesPainted(tokens, paints).families;

describe("signal families [S1]", () => {
  it("reads the one token table from globals.css: every family's steps, and the surfaces", () => {
    expect(ACCENT_FAMILIES).toEqual(["gain", "loss", "wait"]);
    for (const f of ACCENT_FAMILIES) for (const v of ["", "-ink", "-tint", "-line"]) expect(T[`--${f}${v}`], `--${f}${v}`).toMatch(/^#/);
    expect(T["--gain-deep"]).toBe("#087f5b");
    expect(T["--paper"]).toBe("#ffffff");
    expect(T["--raised"]).toBe("#ffffff");
    expect(CSS).not.toMatch(/\.dark\b/);
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

  it("every step of a family counts as that family, on --paper and on --raised", () => {
    for (const [name, value] of Object.entries(tokens)) {
      const f = familyOf(name);
      for (const surface of ["--paper", "--raised"]) {
        for (const kind of ["background", "text", "border"] as const) {
          expect(count([paint(value, T[surface], kind)]), `${name} as ${kind} on ${surface}`).toEqual([f]);
        }
      }
    }
  });

  it("the older names count as the family they point at (--mint is gain, --coral is loss, --danger is loss), blue and ink as none", () => {
    const families = (k: string) => count([paint(T[k], T["--raised"], "text")]);
    for (const [name, family] of Object.entries(ALIASES)) {
      expect(familyBehind(name), name).toBe(family);
      expect(families(name), name).toEqual([family]);
    }
    expect(families("--you")).toEqual([]);
    expect(families("--src")).toEqual([]);
    expect(families("--sun")).toEqual([]);
    expect(families("--violet")).toEqual([]);
    expect(families("--accent")).toEqual([]);
  });

  it("no neutral token counts as a family, painted any way on any surface", () => {
    expect(neutrals.length).toBeGreaterThan(15);
    const paints = neutrals.flatMap(([, v]) => ["--paper", "--raised", "--wash"].flatMap((s) => (["background", "text", "border"] as const).map((k) => paint(v, T[s], k))));
    expect(count(paints)).toEqual([]);
  });

  it("a fully transparent or invisible-on-its-backdrop step does not count", () => {
    const [r, g, b] = rgb(T["--gain"]);
    expect(count([paint(`rgba(${r}, ${g}, ${b}, 0)`, T["--paper"])])).toEqual([]);
    expect(count([paint("transparent", T["--paper"])])).toEqual([]);
    // The tint painted on itself: what is painted equals what was there, so nothing is seen.
    expect(count([paint(T["--gain-tint"], T["--gain-tint"])])).toEqual([]);
    expect(count([{ color: `rgba(${r}, ${g}, ${b}, 0.004)`, backdrop: rgb(T["--paper"]), kind: "background" }])).toEqual([]);
  });

  it("one panel: ink text, a loss pill, a careful chip and a gain mark score all three families", () => {
    const panel = accentFamiliesPainted(tokens, [
      paint(T["--ink"], T["--raised"], "text"),
      paint(T["--loss-tint"], T["--raised"]),
      paint(T["--wait-ink"], T["--wait-tint"], "text"),
      paint(T["--gain"], T["--raised"], "border"),
    ]);
    expect(panel.families).toEqual(["gain", "loss", "wait"]);
    expect(panel.via.loss).toBe("--loss-tint as background");
  });

  it("paintsOf: backdrops are the composited backgrounds of the ancestors, and hidden nodes paint nothing", () => {
    const nodes = [
      { parent: -1, visible: true, background: T["--paper"], gradients: [], on: [] },
      { parent: 0, visible: true, background: T["--loss-tint"], gradients: [], on: [{ color: T["--ink"], kind: "text" as const }] },
      { parent: 1, visible: true, background: "rgba(0, 0, 0, 0)", gradients: [], on: [{ color: T["--wait"], kind: "border" as const }] },
      { parent: 0, visible: false, background: T["--gain-tint"], gradients: [], on: [{ color: T["--gain"], kind: "text" as const }] },
      { parent: 0, visible: true, background: "rgba(0, 0, 0, 0)", gradients: [`linear-gradient(${T["--raised"]}, ${T["--raised"]})`], on: [] },
    ];
    const paints = paintsOf(nodes);
    expect(paints).toContainEqual({ color: T["--loss-tint"], backdrop: rgb(T["--paper"]), kind: "background" });
    expect(paints).toContainEqual({ color: T["--ink"], backdrop: rgb(T["--loss-tint"]), kind: "text" });
    expect(paints).toContainEqual({ color: T["--wait"], backdrop: rgb(T["--loss-tint"]), kind: "border" });
    expect(paints).toContainEqual({ color: `linear-gradient(${T["--raised"]}, ${T["--raised"]})`, backdrop: rgb(T["--paper"]), kind: "gradient" });
    expect(paints.some((p) => p.color === T["--gain-tint"] || p.color === T["--gain"])).toBe(false);
    expect(accentFamiliesPainted(tokens, paints).families).toEqual(["loss", "wait"]);
  });

  it("an empty page counts nothing", () => {
    expect(accentFamiliesPainted(tokens, []).families).toEqual([]);
    expect(accentFamiliesPainted({}, [paint(T["--gain"], T["--paper"])]).families).toEqual([]);
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

  it("a family clipped away does not count: the matcher sees only the seen nodes", () => {
    const chat = box(16, 60, 700, 900);
    const laid = [node(-1, PAGE), node(0, chat, clips(chat)), node(1, box(16, 1200, 700, 1300)), node(1, box(16, 100, 700, 140))];
    const visible = seen(laid);
    const painted = [
      { parent: -1, visible: visible[0], background: T["--paper"], gradients: [], on: [] },
      { parent: 0, visible: visible[1], background: T["--raised"], gradients: [], on: [] },
      { parent: 1, visible: visible[2], background: T["--loss-tint"], gradients: [], on: [{ color: T["--gain-ink"], kind: "text" as const }] },
      { parent: 1, visible: visible[3], background: T["--wait-tint"], gradients: [], on: [] },
    ];
    expect(accentFamiliesPainted(tokens, paintsOf(painted)).families).toEqual(["wait"]);
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
  it("a wide tinted card is a fill; a rule, a dot and a marker are not", () => {
    const wide = familyMisuses(tokens, [
      misuse({ rect: rect(400, 200), background: T["--raised"], label: "surface" }),
      misuse({ parent: 0, rect: rect(300, 80), background: T["--wait-tint"], label: "card" }),
    ]);
    expect(wide.fills).toHaveLength(1);
    expect(wide.fills[0]).toContain("--wait-tint");
    expect(wide.text).toEqual([]);
    const marks = familyMisuses(tokens, [
      misuse({ rect: rect(300, 2), background: T["--loss"], label: "rule" }),
      misuse({ rect: rect(8, 8), background: T["--gain"], label: "dot" }),
      misuse({ rect: rect(14, 14), background: T["--gain-deep"], label: "marker" }),
    ]);
    expect(marks.fills).toEqual([]);
  });

  it("family text counts, ink and blue text do not, and a border, a stroke, a chart fill and a hidden node do not", () => {
    const text = familyMisuses(tokens, [
      misuse({ rect: rect(200, 40), label: "words", on: [{ color: T["--loss-ink"], kind: "text" }] }),
      misuse({ rect: rect(80, 20), label: "svg", on: [{ color: T["--wait-ink"], kind: "text" }] }),
      misuse({ rect: rect(200, 40), label: "ok", on: [{ color: T["--blue"], kind: "text" }, { color: T["--ink"], kind: "text" }] }),
    ]);
    expect(text.text).toHaveLength(2);
    const ignored = familyMisuses(tokens, [
      misuse({ rect: rect(200, 40), label: "edge", on: [{ color: T["--loss"], kind: "border" }] }),
      misuse({ rect: rect(80, 40), label: "stroke", on: [{ color: T["--gain-ink"], kind: "stroke" }] }),
      misuse({ rect: rect(80, 40), label: "series", on: [{ color: T["--wait"], kind: "fill" }] }),
      misuse({ rect: rect(300, 80), visible: false, background: T["--loss"], label: "hidden" }),
    ]);
    expect(ignored).toEqual({ fills: [], text: [] });
  });
});
