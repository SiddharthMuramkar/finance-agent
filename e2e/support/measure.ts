import type { Page } from "@playwright/test";
import { accentFamiliesPainted, familyMisuses, paintsOf, visibleBoxes, type AccentCount, type AccentTokens, type LaidOutNode, type MisuseNode } from "../../src/dev/accent-families";

/**
 * The one measuring module of the browser test bed (spec 2026-11-05, Appendix C.2 and C.3, ticket T-00). Each function
 * runs the spec's console script in the page. No ticket writes a second measuring helper. Appendix C as amended by
 * ADR 0013 (flat controls); where they differ, ADR 0013 wins.
 */

/** What Widgets draw: inside GenuiTheme (.genui), or a Widget view the app renders outside it (marked data-widget-content). */
export const WIDGET_CONTENT = ".genui, [data-widget-content]";

export type Layout = {
  viewport: { width: number; height: number };
  gutterLeft: number | null;
  gutterRight: number | null;
  chatWidthPct: number | null;
  panelWidthPct: number | null;
  headerHeight: number | null;
  chatFontPx: number | null;
  charsPerLine: number | null;
  horizontalScroll: boolean;
  /** Only with `{ prose }`: how many of the matched elements had a full line to count (0 means nothing was measured). */
  proseMeasured?: number;
};

export type Affordances = {
  interactiveWithoutSignifier: string[];
  pointerOnStatic: string[];
  staticLooksPressable: string[];
  tooSmall: string[];
  /** ADR 0013 and ADR 0014: a control, in the app or in a Widget, with a drop or lip shadow, a transform, or corners over 12px. */
  notFlat: string[];
  /** `letOff`: how many controls sat inside the `letOff` selector, so were not judged for their signifier or flatness. */
  counts: { interactive?: number; tags?: number; letOff?: number };
};

/**
 * Controls the look rules let off: a CSS selector, and a control inside an element it matches is not judged for its
 * signifier or flatness (auditAffordances) or for F4's link and blue-word rules (pressLook). Every other rule still judges
 * it. For a page drawn to another spec's components while the owner decides which rule wins (affordance.spec.ts).
 */
export type LetOff = { letOff?: string };

/**
 * Appendix C.2: gutters, column shares, header height, chat font and line length of the page as it is now.
 * With no options, `charsPerLine` is Appendix C's: the longest Tutor paragraph. `{ prose }` (F1, reading pages) measures
 * every visible element the selector matches instead: the full lines (all but each element's last) of all of them, median,
 * and `proseMeasured` says how many elements had a full line. Not running prose, so skipped: an element that is itself a
 * flex or grid row, and one inside a card that sits beside others (an ancestor is a grid of 2+ columns or a flex row of
 * 2+ items). With `cardsAsColumns` (Settings: A1 says "Running paragraphs inside cards use `measure`"), each card of a
 * multi-column grid is its own column: the walk up stops at that grid, so a card's paragraphs are measured inside it,
 * and only a side-by-side row inside the card is skipped. Nothing else changes.
 */
export function measureLayout(page: Page, opts: { prose?: string; cardsAsColumns?: boolean } = {}): Promise<Layout> {
  return page.evaluate(([prose, cardsAsColumns]) => {
    const doc = document.documentElement;
    const vw = doc.clientWidth, vh = window.innerHeight;
    const box = (sel: string) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    const frame = box('[data-testid="workspace-frame"]') || box('[data-testid="reading-column"]');
    const chat = box('[data-testid="chat-column"]');
    const panel = box('[data-testid="widget-pane"]');
    const header = box("header");
    const pct = (r: DOMRect | null) => (r ? Math.round((r.width / vw) * 1000) / 10 : null);
    // The Tutor's reply text, not its "Tutor" label (also a <p>): the longest paragraph, so a short opener is not picked.
    const para = [...document.querySelectorAll('[data-testid="assistant-message"] p:not([data-testid="tutor-label"])')].sort((x, y) => (y.textContent || "").length - (x.textContent || "").length)[0] ?? null;
    const input = document.querySelector("textarea");
    const fontOf = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
    const linesOf = (el: Element) => {                               // characters on each line of an element, top to bottom
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), lines = new Map<number, number>();
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const range = document.createRange();
        for (let i = 0; i < n.length; i++) {
          range.setStart(n, i); range.setEnd(n, i + 1);
          const b = range.getBoundingClientRect();
          if (b.width) lines.set(Math.round(b.top), (lines.get(Math.round(b.top)) || 0) + 1);
        }
      }
      return [...lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    };
    const perLine = (el: Element | null) => {                       // median characters on the full lines of a paragraph (needs 3+ lines)
      if (!el) return null;
      const counts = linesOf(el);
      if (counts.length < 3) return null;
      counts.pop();                                  // the last line is short
      counts.sort((a, b) => a - b);
      return counts[Math.floor(counts.length / 2)];
    };
    // Does any ancestor lay its children side by side: a grid of 2+ column tracks, or a flex row of 2+ visible items?
    // With cardsAsColumns a multi-column grid ends the walk instead: the element's card is its own column.
    const besideOthers = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/grid/.test(s.display) && s.gridTemplateColumns.split(/\s+/).filter((t) => /^[\d.]+px$/.test(t)).length > 1) return !cardsAsColumns;
        if (/flex/.test(s.display) && s.flexDirection.startsWith("row")) {
          const items = [...a.children].filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          if (items.length > 1) return true;
        }
      }
      return false;
    };
    let proseLine: number | null = null, proseMeasured: number | undefined;
    if (prose) {                                    // F1: the running prose of a reading page, every matched element
      const full: number[] = [];
      proseMeasured = 0;
      for (const el of document.querySelectorAll(prose)) {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === "hidden" || s.display === "none") continue;
        if (/flex|grid/.test(s.display)) continue;  // a row of tags or links laid out side by side is not running prose
        if (besideOthers(el)) continue;              // a blurb in a card that sits beside other cards is a panel's text
        const counts = linesOf(el);
        if (counts.length < 2) continue;            // one line says nothing about the measure
        counts.pop();                                // the last line is short
        full.push(...counts);
        proseMeasured++;
      }
      full.sort((a, b) => a - b);
      proseLine = full.length ? full[Math.floor(full.length / 2)] : null;
    }
    return {
      viewport: { width: vw, height: vh },
      gutterLeft: frame ? Math.round(frame.left * 10) / 10 : null,
      gutterRight: frame ? Math.round((vw - frame.right) * 10) / 10 : null,
      chatWidthPct: pct(chat),                       // of the viewport width; target 42 to 44 at the default share
      panelWidthPct: pct(panel),                     // of the viewport width; 52 or more at the default
      headerHeight: header ? Math.round(header.height * 10) / 10 : null,   // target 56 or less
      chatFontPx: fontOf(para) ?? fontOf(input),     // target 15
      charsPerLine: prose ? proseLine : perLine(para), // target 60 to 75 from 1280 px up
      horizontalScroll: doc.scrollWidth > doc.clientWidth + 1,
      ...(prose ? { proseMeasured } : {}),
    };
  }, [opts.prose ?? null, opts.cardsAsColumns ?? false] as const);
}

/**
 * Appendix C.3 as ADR 0013 amends it: what can be pressed looks pressable, and what cannot does not. A clean page returns
 * five empty lists. A control (button, icon, chip, nav, option, step, a menu row) needs a name, a pointer (progress while
 * busy) and one signifier: a face that differs from what it sits on (1.05:1 or more), an edge (1.2:1 or more), a
 * background image, or, for a ghost (an icon, a nav link, a tertiary button, a menu row), a label of 4.5:1 or more on its
 * face (3:1 for an icon alone). Colours are read through a 1x1 canvas, so any CSS colour (color-mix, oklch) is judged,
 * composited over the nearest opaque ancestor and scored by the WCAG ratio. A menu row is judged as a ghost before its
 * kind. A radio or checkbox passes when checked or when its edge is 3:1 or more; a text field when its edge (or its
 * .field-shell's) is 3:1 or more. An option row also needs an edge and 44px; a step 24px. notFlat lists controls
 * anywhere, Widgets included, with a shadow that has an offset or blur, a transform, or corners over 12px (an icon
 * button may be round). Widgets are judged the same way as the app (ADR 0014): nothing inside one may lift, move or be
 * rounder than 12px. A range input, anywhere, is signified by a name and a pointer; every
 * other input keeps the 3:1 edge rule.
 */
export function auditAffordances(page: Page, opts: LetOff = {}): Promise<Affordances> {
  return page.evaluate((letOffSelector) => {
    const root = document;
    const INTERACTIVE = 'a[href], button, [role="button"], [role="menuitem"], [role="menuitemradio"], summary, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const visible = (el: Element) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`;
    const out = { interactiveWithoutSignifier: [] as string[], pointerOnStatic: [] as string[], staticLooksPressable: [] as string[], tooSmall: [] as string[], notFlat: [] as string[], counts: {} as { interactive?: number; tags?: number; letOff?: number } };
    const kindOf = (el: Element) => (el.closest("[data-affordance]") || el).getAttribute("data-affordance");
    const minSize: Record<string, number> = { button: 32, icon: 32, chip: 28, nav: 28, option: 44, step: 24, menuitem: 28, split: 16 };

    // Colours: any CSS colour through a 1x1 canvas, as [r, g, b, a] with a in 0-1.
    type Rgba = [number, number, number, number];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (colour: string): Rgba => {
      if (!colour || colour === "transparent" || colour === "rgba(0, 0, 0, 0)") return [0, 0, 0, 0];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (fg: Rgba, bg: Rgba): Rgba => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as Rgba;
    const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = (c: Rgba) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (x: Rgba, y: Rgba) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
    /** What an element sits on: its ancestors' backgrounds composited, from the nearest opaque one down. */
    const backdropOf = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let a = el.parentElement; a; a = a.parentElement) {
        const c = rgba(getComputedStyle(a).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let under: Rgba = [255, 255, 255, 1];
      for (const layer of layers.reverse()) under = over(layer, under);
      return under;
    };
    const COLOUR = /(rgba?|oklch|oklab|color|hsla?)\([^)]*\)/g;
    /**
     * An edge: the first side with a visible border, as its colour over the backdrop; or, with no border, an inset ring
     * (`inset 0 0 0 Npx colour`: no offset, no blur), which is drawn exactly like a border.
     */
    const edgeOf = (s: CSSStyleDeclaration, backdrop: Rgba): Rgba | null => {
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (parseFloat(s[`border${side}Width`]) > 0 && !["none", "hidden"].includes(s[`border${side}Style`])) {
          const c = rgba(s[`border${side}Color`]);
          if (c[3] > 0) return over(c, backdrop);
        }
      }
      for (const layer of s.boxShadow === "none" ? [] : s.boxShadow.split(/,(?![^(]*\))/)) {
        const colour = layer.match(COLOUR)?.[0];
        if (!colour || !/\binset\b/.test(layer)) continue;
        const [x, y, blur, spread] = layer.replace(COLOUR, "").replace("inset", "").trim().split(/\s+/).map(parseFloat);
        if (x === 0 && y === 0 && !blur && spread > 0) {
          const c = rgba(colour);
          if (c[3] > 0) return over(c, backdrop);
        }
      }
      return null;
    };
    /** Shadow layers with an offset or a blur (a lip, a drop shadow); a 0 0 0 Npx ring or an inset layer is an edge, not a lift. */
    const lifted = (shadow: string) =>
      shadow !== "none" &&
      shadow
        .replace(/(rgba?|oklch|oklab|color|hsla?)\([^)]*\)/g, "")
        .split(",")
        .some((layer) => !/inset/.test(layer) && layer.trim().split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n)).slice(0, 3).some((n) => n !== 0));

    let interactive = 0, tags = 0, letOff = 0;
    for (const el of root.querySelectorAll(INTERACTIVE)) {
      if (!visible(el)) continue;
      // A disabled control cannot be pressed, so it is not judged as one: it is see-through on purpose ("off").
      if (el.matches(':disabled, [aria-disabled="true"]')) continue;
      if (el.closest("svg") && !el.matches("a[href]")) continue;   // a chart mark that takes focus so arrow keys can read it is not a control
      interactive++;
      const lookLetOff = !!letOffSelector && !!el.closest(letOffSelector);
      if (lookLetOff) letOff++;
      const isChoiceInput = el.matches('input[type="radio"], input[type="checkbox"]');
      // A radio or checkbox is judged by its own edge and sized by its label (the row a Learner presses).
      const host = isChoiceInput ? el.closest("label") || el : el;
      const s = getComputedStyle(el), hs = getComputedStyle(host), r = host.getBoundingClientRect();
      const menuRow = el.matches('[role^="menuitem"]');
      const kind = menuRow ? "menuitem" : kindOf(isChoiceInput ? host : el);
      const backdrop = backdropOf(el);
      const face = over(rgba(s.backgroundColor), backdrop);
      const edge = edgeOf(s, backdrop);
      const label = over(rgba(s.color), face);
      const text = (el.textContent || "").trim();
      const accessibleName = (el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") ? "labelled" : "") || text || el.getAttribute("title") || el.querySelector("img[alt]")?.getAttribute("alt") || "").trim();
      const pointer = s.cursor === "pointer" || (s.cursor === "progress" && el.getAttribute("aria-busy") === "true");
      const ghost = (min: number) => ratio(label, face) >= min;
      const surface = ratio(face, backdrop) >= 1.05 || (edge !== null && ratio(edge, backdrop) >= 1.2) || s.backgroundImage !== "none";
      let ok = false;
      if (menuRow) ok = !!accessibleName && pointer && (surface || ghost(4.5));
      else if (isChoiceInput) ok = (el as HTMLInputElement).checked || (edge !== null && ratio(edge, backdrop) >= 3);
      else if (el.matches('input[type="range"]')) {
        const labelled = !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || ((el as HTMLInputElement).labels?.length ?? 0) > 0);
        ok = labelled && pointer;
      } else if (el.matches("input, select, textarea")) {
        const shell = el.closest(".field-shell") || el, ss = getComputedStyle(shell), under = backdropOf(shell), e = edgeOf(ss, under);
        ok = e !== null && ratio(e, under) >= 3;
      } else if (kind === "split") {
        const grip = el.querySelector("[data-split-grip]");
        const gripBg = grip ? over(rgba(getComputedStyle(grip).backgroundColor), backdropOf(grip)) : null;
        const gripOk = !!grip && gripBg !== null && ratio(gripBg, backdropOf(grip)) >= 3;
        ok = !!accessibleName && s.cursor === "col-resize" && gripOk;
      } else if (kind === "button" || kind === "icon" || kind === "chip" || kind === "nav" || kind === "option" || kind === "step") {
        const ghostKind = kind === "icon" || kind === "nav" || el.matches(".btn-tertiary");
        const signified = surface || (ghostKind && ghost(kind === "icon" && !text ? 3 : 4.5));
        ok = !!accessibleName && pointer && signified;
        if (kind === "option") ok = ok && edgeOf(hs, backdropOf(host)) !== null;
      } else if (kind === "link") ok = s.textDecorationLine.includes("underline");
      else if (el.matches("summary")) ok = !!el.querySelector("svg");
      if (!ok && !lookLetOff) out.interactiveWithoutSignifier.push(name(el));
      const floor = el.matches(".btn-xs") ? 28 : kind ? minSize[kind] : undefined;
      if (floor && (r.height < floor || r.width < floor)) out.tooSmall.push(`${name(host)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (kind && kind in minSize) {
        const why = [lifted(hs.boxShadow) && "shadow", hs.transform !== "none" && "transform", kind !== "icon" && parseFloat(hs.borderTopLeftRadius) > 12 && "radius"].filter(Boolean);
        if (why.length && !lookLetOff) out.notFlat.push(`${name(host)} ${why.join("+")}`);
      }
    }
    for (const el of root.querySelectorAll("*")) {       // nothing that cannot be pressed shows a pointer
      if (!visible(el) || el.closest(INTERACTIVE) || el.closest("label[for], [data-allow-pointer]")) continue;
      if (getComputedStyle(el).cursor === "pointer") out.pointerOnStatic.push(name(el));
    }
    for (const el of root.querySelectorAll('[data-affordance="tag"]')) {   // static tags look static: flat, no pointer, 8px radius or less
      if (!visible(el)) continue;
      tags++;
      const s = getComputedStyle(el);
      if (s.boxShadow !== "none" || s.cursor === "pointer" || parseFloat(s.borderTopLeftRadius) > 8) out.staticLooksPressable.push(name(el));
    }
    out.counts = { interactive, tags, ...(letOffSelector ? { letOff } : {}) };
    return out;                                           // a clean page returns five empty lists
  }, opts.letOff ?? null);
}

/** What `pressLook` finds: each list names the elements that break one rule of spec 2026-11-12 F4, empty when clean. */
export type PressLook = {
  /** A link (data-affordance="link") in a reading area that is not the Theme's accent and underlined. */
  readingLinks: string[];
  /** A link on a Band that is not white and underlined. */
  bandLinks: string[];
  /** A button (.btn) on a Band that is not white with an ink label. */
  bandButtons: string[];
  /** Something pressable whose words are drawn like a key number: the accent, 20px or larger, 600 or heavier, no underline. */
  keyNumberLook: string[];
  /** Something pressable in a reading area whose words are the accent with neither an underline nor a face or edge under them. */
  bareBlueWords: string[];
  /** Two Bands whose boxes touch or overlap (F1: two Bands never touch). */
  bandsTouching: string[];
  /** How many pressable elements, links and Bands were judged, so a page that judged nothing is caught; `letOff`, how many
   * pressable elements sat inside the `letOff` selector (not judged for readingLinks, bandLinks or bareBlueWords). */
  counts: { pressable: number; links: number; bands: number; letOff: number };
};

/**
 * Spec 2026-11-12 F4 (ADR 0022), what can be pressed stays obvious: in a reading area a link is the accent and underlined
 * and a button has a face; on a Band a button is white with an ink label and a link is white and underlined; and nothing
 * that can be pressed uses the key-number style. Also F1's "two Bands never touch", by their drawn boxes. A Band is
 * `.band` or `.home-band`; a `.band-card` inside one is a reading area again. Colours are compared as the browser
 * computes them, the accent read from the token. Pressable means the affordance audit's controls, visible and enabled.
 */
export function pressLook(page: Page, opts: LetOff = {}): Promise<PressLook> {
  return page.evaluate((letOffSelector) => {
    const INTERACTIVE = 'a[href], button, [role="button"], [role="menuitem"], [role="menuitemradio"], summary, [tabindex]:not([tabindex="-1"])';
    const BANDS = ".band, .home-band";
    const out: PressLook = { readingLinks: [], bandLinks: [], bandButtons: [], keyNumberLook: [], bareBlueWords: [], bandsTouching: [], counts: { pressable: 0, links: 0, bands: 0, letOff: 0 } };
    const visible = (el: Element) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none"; };
    const name = (el: Element) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    const colourOf = (css: string) => { const probe = document.createElement("span"); probe.style.color = css; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; };
    const ACCENT = colourOf("var(--accent)");
    const WHITE = "rgb(255, 255, 255)";
    const INK = colourOf("#0b0d12");
    const onBand = (el: Element) => { const band = el.closest(BANDS); return !!band && !el.closest(".band-card"); };
    // Text decoration is not inherited as a computed value, so an underline counts from the element up to the control.
    const underlined = (el: Element, upTo: Element) => {
      for (let e: Element | null = el; e; e = e === upTo ? null : e.parentElement) if (getComputedStyle(e).textDecorationLine.includes("underline")) return true;
      return false;
    };
    const opaque = (c: string) => c !== "transparent" && c !== "rgba(0, 0, 0, 0)" && !/,\s*0\)$/.test(c);
    /** A face under the words: any box from the words up to the control with its own background, or an edge on the control. */
    const faced = (el: Element, control: Element) => {
      for (let e: Element | null = el; e; e = e === control ? null : e.parentElement) if (opaque(getComputedStyle(e).backgroundColor) || getComputedStyle(e).backgroundImage !== "none") return true;
      const s = getComputedStyle(control);
      return (["Top", "Right", "Bottom", "Left"] as const).some((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none" && opaque(s[`border${side}Color`]));
    };
    /** The elements inside a control (itself included) that hold words of their own on screen. */
    const wordHolders = (control: Element) =>
      [control, ...control.querySelectorAll("*")].filter((e) => visible(e) && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()));

    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (!visible(el) || el.matches(':disabled, [aria-disabled="true"]') || (el.closest("svg") && !el.matches("a[href]"))) continue;
      out.counts.pressable++;
      const band = onBand(el);
      const s = getComputedStyle(el);
      const lookLetOff = !!letOffSelector && !!el.closest(letOffSelector);
      if (lookLetOff) out.counts.letOff++;
      if (el.matches('[data-affordance="link"]') && !lookLetOff) {
        out.counts.links++;
        const line = underlined(el, el);
        if (band && !(s.color === WHITE && line)) out.bandLinks.push(`${name(el)} ${s.color}${line ? "" : " not underlined"}`);
        if (!band && !(s.color === ACCENT && line)) out.readingLinks.push(`${name(el)} ${s.color}${line ? "" : " not underlined"}`);
      }
      if (band && el.matches(".btn") && !(s.backgroundColor === WHITE && s.color === INK)) out.bandButtons.push(`${name(el)} face ${s.backgroundColor}, label ${s.color}`);
      for (const words of wordHolders(el)) {
        const w = getComputedStyle(words);
        if (w.color !== ACCENT || underlined(words, el)) continue;
        if (parseFloat(w.fontSize) >= 20 && parseInt(w.fontWeight, 10) >= 600) out.keyNumberLook.push(`${name(el)}: ${name(words)} ${w.fontSize} ${w.fontWeight}`);
        else if (!band && !faced(words, el) && !lookLetOff) out.bareBlueWords.push(`${name(el)}: ${name(words)}`);
      }
    }

    const bands = [...document.querySelectorAll(BANDS)].filter((b) => visible(b) && !b.parentElement?.closest(BANDS)).map((b) => ({ el: b, r: b.getBoundingClientRect() }));
    out.counts.bands = bands.length;
    bands.sort((a, b) => a.r.top - b.r.top);
    for (let i = 1; i < bands.length; i++) {
      const [a, b] = [bands[i - 1], bands[i]];
      const across = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 0;
      if (across && b.r.top - a.r.bottom < 1) out.bandsTouching.push(`${name(a.el)} and ${name(b.el)}: gap ${Math.round(b.r.top - a.r.bottom)}px`);
    }
    return out;
  }, opts.letOff ?? null);
}

/**
 * Which signal FAMILIES (gain, loss, wait: spec §2.1) the visible elements of the page paint; `within` counts only
 * inside a selector (Widgets: WIDGET_CONTENT) and `outside` only outside one (the chrome, which keeps free of them). The page gives the raw material: every
 * step of each family that its stylesheets declare (--gain, --gain-deep, --gain-ink, --gain-tint, --loss, ...),
 * resolved from getComputedStyle(document.documentElement), and each element's background,
 * gradients, borders, SVG fill and stroke, and the colour of its own text. src/dev/accent-families.ts composites each
 * translucent paint and step over its backdrop and decides (tested there with the real token table).
 * Visible means on the screenshot: a box that checkVisibility() passes with opacity and visibility and that keeps some
 * size after its overflow-clipping ancestors and the page (the viewport, for a fixed box) cut it (`visibleBoxes`), so a
 * hidden, see-through or 0x0 accent, one scrolled out of a scroller, inside a collapsed overflow-hidden box, below
 * /study's h-dvh overflow-hidden frame or off the page does not count.
 */
export async function accentFamilies(page: Page, opts: { within?: string; outside?: string } = {}): Promise<AccentCount & { tokens: AccentTokens }> {
  const { tokens, nodes, area } = await page.evaluate(([within, outside]) => {
    const FAMILY = /^--(gain|loss|wait)(-[a-z0-9-]+)?$/;
    const names = new Set<string>();
    const scan = (rules: CSSRuleList) => {
      for (const r of Array.from(rules)) {
        if (r instanceof CSSStyleRule) for (const p of Array.from(r.style)) if (FAMILY.test(p)) names.add(p);
        if ("cssRules" in r) scan((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try { scan(sheet.cssRules); } catch { /* a cross-origin sheet cannot be read */ }
    }
    if (!names.size) for (const f of ["gain", "loss", "wait"]) for (const v of ["", "-ink", "-tint", "-line"]) names.add(`--${f}${v}`);
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const tokens: Record<string, string> = {};
    for (const name of names) {
      const raw = root.getPropertyValue(name).trim();
      if (!raw || !CSS.supports("color", raw)) continue;
      probe.style.color = raw;                       // normalised the way computed styles report colours
      tokens[name] = getComputedStyle(probe).color;
    }
    probe.remove();
    type On = { color: string; kind: "border" | "fill" | "stroke" | "text" };
    const els = [document.documentElement, ...Array.from(document.documentElement.querySelectorAll("*"))];
    const index = new Map<Element, number>(els.map((el, i) => [el, i]));
    // Elements whose overflow can clip: a CSS box (an HTML element, or an outermost <svg>) that is not inline and not
    // display: contents. The root and body are the page itself (their overflow belongs to the viewport).
    const CLIPS = /^(hidden|clip|scroll|auto)$/;
    const TRANSFORMED = (s: CSSStyleDeclaration) =>
      s.transform !== "none" || s.filter !== "none" || s.perspective !== "none" || /paint|strict|content|layout/.test(s.contain);
    const nodes = els.map((el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const isBox = (el instanceof HTMLElement || (el instanceof SVGSVGElement && !el.ownerSVGElement))
        && el !== document.documentElement && el !== document.body && s.display !== "inline" && s.display !== "contents";
      const paintContained = /paint|strict|content/.test(s.contain);
      const padX: [number, number] = [r.left + el.clientLeft, r.left + el.clientLeft + el.clientWidth];
      const padY: [number, number] = [r.top + el.clientTop, r.top + el.clientTop + el.clientHeight];
      const layout = {
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        position: s.position === "fixed" ? "fixed" : s.position === "absolute" ? "absolute" : "flow",
        positioned: s.position !== "static",
        containsFixed: TRANSFORMED(s),
        clipX: isBox && (paintContained || CLIPS.test(s.overflowX)) ? padX : null,
        clipY: isBox && (paintContained || CLIPS.test(s.overflowY)) ? padY : null,
      };
      const shown = typeof el.checkVisibility === "function"
        ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        : s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
      const on: On[] = [];
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (parseFloat(s[`border${side}Width`]) > 0 && !["none", "hidden"].includes(s[`border${side}Style`])) on.push({ color: s[`border${side}Color`], kind: "border" });
      }
      if (el instanceof SVGElement) {
        if (s.fill !== "none") on.push({ color: s.fill, kind: "fill" });
        if (s.stroke !== "none" && parseFloat(s.strokeWidth) > 0) on.push({ color: s.stroke, kind: "stroke" });
      }
      if (Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) on.push({ color: s.color, kind: "text" });
      // ADR 0013: count only the part of the page asked for, e.g. inside Widgets, or the chrome outside them.
      const inScope = (!within || !!el.closest(within)) && (!outside || !el.closest(outside));
      return {
        parent: el.parentElement ? index.get(el.parentElement) ?? -1 : -1,
        shown,
        inScope,
        ...layout,
        background: s.backgroundColor,
        gradients: s.backgroundImage !== "none" ? [s.backgroundImage] : [],
        on,
      };
    });
    const d = document.documentElement;
    const area = {
      page: { left: -scrollX, top: -scrollY, right: d.scrollWidth - scrollX, bottom: d.scrollHeight - scrollY },
      viewport: { left: 0, top: 0, right: d.clientWidth, bottom: d.clientHeight },
    };
    return { tokens, nodes, area };
  }, [opts.within ?? null, opts.outside ?? null] as const);
  const seen = visibleBoxes(nodes as LaidOutNode[], area.page, area.viewport);
  return { ...accentFamiliesPainted(tokens, paintsOf(nodes.map((n, i) => ({ ...n, visible: seen[i] && n.inScope })))), tokens };
}

export type WidgetLook = { fills: string[]; text: string[]; shadows: string[]; tilted: string[]; heavy: string[]; semibold: string[] };

/** A shadow layer that lifts or blurs. A 0 0 0 Npx ring is an edge and does not count. */
function shadowLifts(shadow: string): boolean {
  if (!shadow || shadow === "none") return false;
  return shadow
    .replace(/(rgba?|oklch|oklab|color|hsla?)\([^)]*\)/g, " ")
    .split(",")
    .some((layer) => {
      const [x = 0, y = 0, blur = 0] = layer.trim().split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n));
      return x !== 0 || y !== 0 || blur !== 0;
    });
}

/**
 * rotate, or a 2D matrix with rotation or skew. rotateY and translate have b = c = 0. A quarter turn (90°, 180°, 270°: a
 * disclosure chevron turned to say "open") is an icon's orientation, not a tilt, so it does not count; ADR 0014's ban is
 * on the sticker's slant.
 */
export function isTilted(rotate: string, transform: string): boolean {
  const quarter = (deg: number) => Math.abs(deg / 90 - Math.round(deg / 90)) < 1e-3;
  if (rotate && rotate !== "none") {
    const deg = /^(-?[\d.]+)deg$/.exec(rotate.trim());
    if (!deg || !quarter(parseFloat(deg[1]))) return true;
  }
  const m = /matrix3d\(([^)]+)\)|matrix\(([^)]+)\)/.exec(transform);
  if (!m) return false;
  const n = (m[1] ?? m[2]).split(",").map((s) => parseFloat(s));
  const a = n[0] ?? 1;
  const b = n[1] ?? 0;
  const c = m[1] ? (n[4] ?? 0) : (n[2] ?? 0);
  if (Math.abs(b) <= 0.001 && Math.abs(c) <= 0.001) return false;
  // Rotation with no skew: a quarter turn when the angle is a multiple of 90°.
  return !quarter((Math.atan2(b, a) * 180) / Math.PI) || Math.abs(Math.abs(b) - Math.abs(c)) > 0.001;
}

/**
 * How a Widget uses colour, shadow, tilt and weight (spec 2026-11-11, A7a). `fills` and `text` are family colour used
 * as paint or as words. `shadows` lift or blur. `tilted` is rotated or skewed. `heavy` is over 600. `semibold` is 600
 * outside the one key figure. It judges every element that matches `within` (every Widget on the page by default) and
 * throws when none does, so a part that never drew fails its row instead of passing on an empty page.
 */
export async function widgetLook(page: Page, opts: { within?: string } = {}): Promise<WidgetLook> {
  const within = opts.within ?? WIDGET_CONTENT;
  const raw = await page.evaluate((scope) => {
    const FAMILY = /^--(gain|loss|wait)(-[a-z0-9-]+)?$/;
    const names = new Set<string>();
    const scan = (rules: CSSRuleList) => {
      for (const r of Array.from(rules)) {
        if (r instanceof CSSStyleRule) for (const p of Array.from(r.style)) if (FAMILY.test(p)) names.add(p);
        if ("cssRules" in r) scan((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try { scan(sheet.cssRules); } catch { /* cross-origin */ }
    }
    if (!names.size) for (const f of ["gain", "loss", "wait"]) for (const v of ["", "-ink", "-tint", "-line"]) names.add(`--${f}${v}`);
    const rootStyle = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const tokens: Record<string, string> = {};
    for (const name of names) {
      const value = rootStyle.getPropertyValue(name).trim();
      if (!value || !CSS.supports("color", value)) continue;
      probe.style.color = value;
      tokens[name] = getComputedStyle(probe).color;
    }
    probe.remove();
    // Every Widget that matches the scope, each with everything inside it, once and in document order. None is an error.
    const roots = Array.from(document.querySelectorAll(scope));
    if (!roots.length) return null;
    const els = Array.from(new Set(roots.flatMap((root) => [root, ...Array.from(root.querySelectorAll("*"))])));
    const nodes = els.map((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const shown = typeof el.checkVisibility === "function" ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
      const on: { color: string; kind: "border" | "fill" | "stroke" | "text" }[] = [];
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (parseFloat(s[`border${side}Width`]) > 0 && !["none", "hidden"].includes(s[`border${side}Style`])) on.push({ color: s[`border${side}Color`], kind: "border" });
      }
      const svgText = el.tagName.toLowerCase() === "text";
      if (el instanceof SVGElement && !svgText) {
        if (s.fill && s.fill !== "none") on.push({ color: s.fill, kind: "fill" });
        if (s.stroke && s.stroke !== "none" && parseFloat(s.strokeWidth) > 0) on.push({ color: s.stroke, kind: "stroke" });
      }
      const ownText = svgText || Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
      if (ownText) on.push({ color: svgText ? s.fill : s.color, kind: "text" });
      const label = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`;
      return {
        parent: el.parentElement && els.indexOf(el.parentElement) >= 0 ? els.indexOf(el.parentElement) : -1,
        visible: shown && r.width > 0 && r.height > 0,
        background: s.backgroundColor,
        gradients: s.backgroundImage !== "none" ? [s.backgroundImage] : [],
        on,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        label,
        shadow: s.boxShadow,
        rotate: s.rotate,
        transform: s.transform,
        weight: Number(s.fontWeight),
        ownText,
        inKey: !!el.closest("[data-key-figure]"),
      };
    });
    return { tokens, nodes };
  }, within);
  if (!raw) throw new Error(`widgetLook: no element matches ${within}`);
  const painted: MisuseNode[] = raw.nodes.map((n) => ({ parent: n.parent, visible: n.visible, background: n.background, gradients: n.gradients, on: n.on, rect: n.rect, label: n.label }));
  const { fills, text } = familyMisuses(raw.tokens, painted);
  const name = (n: (typeof raw.nodes)[number]) => n.label;
  return {
    fills,
    text,
    shadows: raw.nodes.filter((n) => n.visible && shadowLifts(n.shadow)).map(name),
    tilted: raw.nodes.filter((n) => n.visible && isTilted(n.rotate, n.transform)).map(name),
    heavy: raw.nodes.filter((n) => n.visible && n.ownText && n.weight > 600).map(name),
    semibold: raw.nodes.filter((n) => n.visible && n.ownText && n.weight === 600 && !n.inKey).map(name),
  };
}

/** The plain frame around a live Widget on Home or About. */
export async function frameLook(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const s = getComputedStyle(el);
    const inner = el.querySelector("section");
    return {
      backgroundColor: s.backgroundColor,
      borderTopWidth: s.borderTopWidth,
      borderTopColor: s.borderTopColor,
      boxShadow: s.boxShadow,
      radius: parseFloat(s.borderTopLeftRadius),
      innerBorder: inner ? getComputedStyle(inner).borderTopWidth : null,
    };
  });
}

/** A box's horizontal extent, in px from the viewport's left edge. */
export type Edges = { left: number; right: number; width: number };

export type ReadingBlock = {
  column: Edges | null;
  block: Edges | null;
  composer: Edges | null;
  offCentre: number | null;
  edges: (Edges & { name: string })[];
};

/**
 * C1 (spec 2026-11-11): the conversation's reading block, the one centred column its lines share. The boxes of
 * `chat-column`, `reading-block` (the thread's block) and `composer-block` (the block under the thread); `offCentre`,
 * |left gap - right gap| of the reading block inside the column; and `edges`, the left and right edges of the last
 * Tutor reply, Learner bubble, step divider and Widget chip, of the Choices row and of the composer field (each only when
 * it is on the page).
 */
export function readingBlock(page: Page): Promise<ReadingBlock> {
  return page.evaluate(() => {
    const edgesOf = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    const byId = (id: string) => edgesOf(document.querySelector(`[data-testid="${id}"]`));
    const column = byId("chat-column"), block = byId("reading-block"), composer = byId("composer-block");
    const offCentre = column && block ? Math.abs(block.left - column.left - (column.right - block.right)) : null;
    const last = (sel: string) => [...document.querySelectorAll(sel)].at(-1);
    const parts: [string, string][] = [
      ["assistant-message", '[data-testid="assistant-message"]'],
      ["learner-message", '[data-testid="learner-message"]'],
      ["step-divider", '[data-testid="step-divider"]'],
      ["widget-chip", '[data-testid="widget-chip"]'],
      ["choices", '[role="group"][aria-label="Choices"]'],
      ["composer", '[data-testid="composer"]'],
    ];
    const edges = parts.flatMap(([name, sel]) => {
      const e = edgesOf(last(sel));
      return e ? [{ name, ...e }] : [];
    });
    return { column, block, composer, offCentre, edges };
  });
}
