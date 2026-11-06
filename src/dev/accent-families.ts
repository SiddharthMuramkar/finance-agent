/**
 * F1's accent count (spec 2026-11-05 §3 row 7: "≥ 3 distinct accent colours visible on /study with a Widget").
 * Pure, no browser: e2e/support/measure.ts (`accentFamilies`) gathers what the page paints, and this module decides
 * which accent FAMILIES it shows. A family is one of mint, coral, sun, violet with every variant globals.css defines
 * for it in the current theme (--mint, --mint-ink, --mint-tint, --mint-tag, --coral-fill, ...). Light gives each
 * variant its own hex and Dark makes -ink the base and -tint an 8 % alpha, so matching only the base token measures
 * how a theme spells its variants, not which accents are on screen. Here a translucent colour is composited over what
 * it sits on, and so is each variant, and a family counts when any visible paint lands on any of its variants.
 * Tested in src/dev/accent-families.test.ts with the real Light and Dark token tables.
 */

export const ACCENT_FAMILIES = ["mint", "coral", "sun", "violet"] as const;
export type AccentFamily = (typeof ACCENT_FAMILIES)[number];
/** Red, green, blue 0-255 and alpha 0-1. */
export type Rgba = [number, number, number, number];
/** Accent token name to its colour in the current theme, e.g. { "--mint": "#12b886", "--mint-tint": "rgba(...)" }. */
export type AccentTokens = Record<string, string>;
export type PaintKind = "background" | "gradient" | "border" | "fill" | "stroke" | "text";
/** One colour a visible element paints, and the opaque colour under it. */
export type Paint = { color: string; backdrop: Rgba; kind: PaintKind };
/**
 * One element as the page computed it, in document order. `parent` is the index of its parent element (-1 for the
 * root). `background` is its background-color, `gradients` the background-image layers, `on` what it paints over its
 * own background: borders, SVG fill and stroke, the colour of its own text.
 */
export type PaintedNode = { parent: number; visible: boolean; background: string; gradients: string[]; on: { color: string; kind: PaintKind }[] };
/** The families seen, in ACCENT_FAMILIES order, and for each the first variant that matched ("--sun-tag as background"). */
export type AccentCount = { families: AccentFamily[]; via: Partial<Record<AccentFamily, string>> };

/** A rectangle in viewport coordinates (CSS px), as getBoundingClientRect reports it. */
export type Box = { left: number; top: number; right: number; bottom: number };
/**
 * One element's layout as the page computed it, in document order (`parent` as in PaintedNode). `rect` is its border
 * box; `shown` is checkVisibility() with opacity and visibility. `position` is how it is placed: "fixed", "absolute",
 * or "flow" (static, relative, sticky). `positioned` (position not static) makes it the containing block of absolute
 * descendants; `containsFixed` (a transform, filter, perspective or paint containment) makes it the containing block of
 * fixed ones too. `clipX` / `clipY` are its padding box's left-right / top-bottom edges when its overflow-x / overflow-y
 * (or paint containment) clips its descendants, else null.
 */
export type LaidOutNode = {
  parent: number;
  rect: Box;
  shown: boolean;
  position: "flow" | "absolute" | "fixed";
  positioned: boolean;
  containsFixed: boolean;
  clipX: [number, number] | null;
  clipY: [number, number] | null;
};

/**
 * Which nodes the screenshot shows: a box that checkVisibility() passes and that keeps some width and height after
 * every clipping ancestor and the captured area cut it. `page` is the whole page's box (what a full-page shot
 * captures; on /study, h-dvh, it is the viewport), `viewport` the window's, which is where a fixed box is cut instead.
 * An ancestor clips a box only when CSS says it does: every ancestor clips an in-flow box; an absolute box skips
 * ancestors until its containing block (positioned or transformed), a fixed box until a transformed one, and from the
 * containing block up its own placement rules apply. A box scrolled out of a scroller, inside a collapsed
 * overflow-hidden box, or below /study's overflow-hidden frame is therefore not seen.
 */
export function visibleBoxes(nodes: LaidOutNode[], page: Box, viewport: Box): boolean[] {
  return nodes.map((n) => {
    if (!n.shown) return false;
    let { left, top, right, bottom } = n.rect;
    let mode = n.position;
    for (let a = n.parent, guard = 0; a >= 0 && a < nodes.length && guard < nodes.length; a = nodes[a].parent, guard++) {
      const an = nodes[a];
      const applies = mode === "flow" || (mode === "absolute" && (an.positioned || an.containsFixed)) || (mode === "fixed" && an.containsFixed);
      if (!applies) continue;
      if (an.clipX) { left = Math.max(left, an.clipX[0]); right = Math.min(right, an.clipX[1]); }
      if (an.clipY) { top = Math.max(top, an.clipY[0]); bottom = Math.min(bottom, an.clipY[1]); }
      mode = an.position;
    }
    const area = mode === "fixed" ? viewport : page;
    left = Math.max(left, area.left); right = Math.min(right, area.right);
    top = Math.max(top, area.top); bottom = Math.min(bottom, area.bottom);
    return right - left > 0 && bottom - top > 0;
  });
}

/** Channel distance (0-255) under which two composited colours are the same paint, and over which a paint is seen. */
const SAME = 2;
const WHITE: Rgba = [255, 255, 255, 1];

/** Every colour in a computed value (rgb()/rgba(), color(srgb ...), #hex, transparent), in order. url(...) is skipped. */
export function parseColors(css: string): Rgba[] {
  const out: Rgba[] = [];
  const text = css.replace(/url\([^)]*\)/g, "");
  for (const m of text.matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)|#([0-9a-f]{3,8})\b|\btransparent\b/gi)) {
    if (m[1] !== undefined) {
      const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
      out.push([+r, +g, +b, a.endsWith("%") ? parseFloat(a) / 100 : +a]);
    } else if (m[2] !== undefined) {
      const [r, g, b, a = "1"] = m[2].split(/[\s/]+/).filter(Boolean);
      out.push([+r * 255, +g * 255, +b * 255, +a]);
    } else if (m[3] !== undefined) {
      let h = m[3];
      if (![3, 4, 6, 8].includes(h.length)) continue;
      if (h.length <= 4) h = [...h].map((c) => c + c).join("");
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
      out.push([n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]);
    } else out.push([0, 0, 0, 0]);
  }
  return out;
}

/** The accent family a token name belongs to: --mint and --mint-ink are mint; --mintx and --you are none. */
export function familyOf(token: string): AccentFamily | null {
  const m = /^--(mint|coral|sun|violet)(-[a-z0-9-]+)?$/.exec(token);
  return m ? (m[1] as AccentFamily) : null;
}

/** `top` painted over an opaque `under` (source-over); the result is opaque. */
export function over(top: Rgba, under: Rgba): Rgba {
  const a = Math.max(0, Math.min(1, top[3]));
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}

const distance = (x: Rgba, y: Rgba) => Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2]));
/** The first colour of a value, over `under` (a value with no colour is transparent). */
const flatten = (css: string, under: Rgba) => over(parseColors(css)[0] ?? [0, 0, 0, 0], under);

/**
 * Each visible node's paints with the opaque backdrop under them. A node's backdrop is its ancestors' background
 * colours composited from the root down over a white canvas; its own background sits on that, and its borders, text,
 * fill and stroke sit on its own composited background. Hidden nodes paint nothing (their backgrounds still pass to
 * their children's backdrops, which are hidden with them in practice).
 */
export function paintsOf(nodes: PaintedNode[]): Paint[] {
  const flat: Rgba[] = [];
  const paints: Paint[] = [];
  nodes.forEach((n, i) => {
    const under = n.parent >= 0 && n.parent < i ? flat[n.parent] : WHITE;
    const own = flatten(n.background, under);
    flat.push(own);
    if (!n.visible) return;
    paints.push({ color: n.background, backdrop: under, kind: "background" });
    for (const g of n.gradients) paints.push({ color: g, backdrop: own, kind: "gradient" });
    for (const o of n.on) paints.push({ color: o.color, backdrop: own, kind: o.kind });
  });
  return paints;
}

/**
 * Which families the paints show. A paint shows a family when, composited over its backdrop, it is the same colour as
 * one of the family's variants composited over that same backdrop, and that colour differs from the backdrop (a
 * paint you cannot see shows nothing). Every colour in a paint's value counts (a gradient has several).
 */
export function accentFamiliesPainted(tokens: AccentTokens, paints: Paint[]): AccentCount {
  const variants = Object.entries(tokens)
    .map(([name, value]) => ({ name, family: familyOf(name), rgba: parseColors(value)[0] }))
    .filter((v): v is { name: string; family: AccentFamily; rgba: Rgba } => !!v.family && !!v.rgba);
  const via: Partial<Record<AccentFamily, string>> = {};
  for (const p of paints) {
    for (const c of parseColors(p.color)) {
      const seen = over(c, p.backdrop);
      if (distance(seen, p.backdrop) <= SAME) continue;
      for (const v of variants) {
        if (via[v.family]) continue;
        if (distance(seen, over(v.rgba, p.backdrop)) <= SAME) via[v.family] = `${v.name} as ${p.kind}`;
      }
    }
  }
  return { families: ACCENT_FAMILIES.filter((f) => via[f]), via };
}
