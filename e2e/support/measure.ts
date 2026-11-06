import type { Page } from "@playwright/test";
import { accentFamiliesPainted, paintsOf, visibleBoxes, type AccentCount, type AccentTokens, type LaidOutNode } from "../../src/dev/accent-families";

/**
 * The one measuring module of the browser test bed (spec 2026-11-05, Appendix C.2 and C.3, ticket T-00). Each function
 * runs the spec's console script in the page. No ticket writes a second measuring helper; if this file and Appendix C
 * ever differ, Appendix C wins.
 */

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
  counts: { interactive?: number; tags?: number };
};

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
      chatWidthPct: pct(chat),                       // of the viewport width; target 36 to 42
      panelWidthPct: pct(panel),                     // of the viewport width; target 55 or more
      headerHeight: header ? Math.round(header.height * 10) / 10 : null,   // target 56 or less
      chatFontPx: fontOf(para) ?? fontOf(input),     // target 15
      charsPerLine: prose ? proseLine : perLine(para), // target 60 to 75 from 1280 px up
      horizontalScroll: doc.scrollWidth > doc.clientWidth + 1,
      ...(prose ? { proseMeasured } : {}),
    };
  }, [opts.prose ?? null, opts.cardsAsColumns ?? false] as const);
}

/** Appendix C.3: what can be pressed looks pressable, and what cannot does not. A clean page returns four empty lists. */
export function auditAffordances(page: Page): Promise<Affordances> {
  return page.evaluate(() => {
    const root = document;
    const INTERACTIVE = 'a[href], button, [role="button"], [role="menuitem"], [role="menuitemradio"], summary, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const visible = (el: Element) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`;
    const out = { interactiveWithoutSignifier: [] as string[], pointerOnStatic: [] as string[], staticLooksPressable: [] as string[], tooSmall: [] as string[], counts: {} as { interactive?: number; tags?: number } };
    const kindOf = (el: Element) => (el.closest("[data-affordance]") || el).getAttribute("data-affordance");
    const minSize: Record<string, number> = { button: 32, icon: 32, chip: 28, nav: 28 };
    let interactive = 0, tags = 0;
    for (const el of root.querySelectorAll(INTERACTIVE)) {
      if (!visible(el)) continue;
      // A disabled control cannot be pressed, so it is not judged as one: Appendix B.3 makes it flat on purpose ("off").
      if (el.matches(':disabled, [aria-disabled="true"]')) continue;
      if (el.closest("svg") && !el.matches("a[href]")) continue;   // a chart mark that takes focus so arrow keys can read it is not a control
      interactive++;
      // A radio or checkbox inside a chip label is the chip's own control: judge the chip face, not the 18px native input.
      const host = el.matches('input[type="radio"], input[type="checkbox"]') ? el.closest('[data-affordance="chip"]') || el : el;
      const s = getComputedStyle(host), r = host.getBoundingClientRect(), kind = kindOf(el);
      const raised = s.boxShadow !== "none";
      const surface = s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.backgroundImage !== "none" || parseFloat(s.borderTopWidth) > 0;
      let ok = false;
      if (kind === "button" || kind === "icon" || kind === "chip" || kind === "nav") ok = raised && surface;
      else if (kind === "link") ok = s.textDecorationLine.includes("underline");
      else if (el.matches("input, select, textarea")) ok = parseFloat(s.borderTopWidth) > 0;
      else if (el.matches("summary")) ok = !!el.querySelector("svg");
      if (!ok) out.interactiveWithoutSignifier.push(name(el));
      if (kind && minSize[kind] && (r.height < minSize[kind] || r.width < minSize[kind])) out.tooSmall.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const el of root.querySelectorAll("*")) {       // nothing that cannot be pressed shows a pointer
      if (!visible(el) || el.closest(INTERACTIVE) || el.closest("label[for], [data-allow-pointer]")) continue;
      if (getComputedStyle(el).cursor === "pointer") out.pointerOnStatic.push(name(el));
    }
    for (const el of root.querySelectorAll('[data-affordance="tag"]')) {   // static pills look static: flat, no pointer, 8px radius or less
      if (!visible(el)) continue;
      tags++;
      const s = getComputedStyle(el);
      if (s.boxShadow !== "none" || s.cursor === "pointer" || parseFloat(s.borderTopLeftRadius) > 8) out.staticLooksPressable.push(name(el));
    }
    out.counts = { interactive, tags };
    return out;                                           // a clean page returns four empty lists
  });
}

/**
 * F1's accent count (§3 row 7: ">= 3 distinct accent colours visible on /study with a Widget"): which accent FAMILIES
 * (mint, coral, sun, violet) the visible elements of the whole page paint. The page gives the raw material: every
 * variant of each family that its stylesheets declare (--mint, --mint-ink, --mint-tint, --mint-tag, --coral-fill, ...),
 * resolved in the current theme from getComputedStyle(document.documentElement), and each element's background,
 * gradients, borders, SVG fill and stroke, and the colour of its own text. src/dev/accent-families.ts composites each
 * translucent paint and variant over its backdrop and decides (tested there with the Light and Dark token tables).
 * Visible means on the screenshot: a box that checkVisibility() passes with opacity and visibility and that keeps some
 * size after its overflow-clipping ancestors and the page (the viewport, for a fixed box) cut it (`visibleBoxes`), so a
 * hidden, see-through or 0x0 accent, one scrolled out of a scroller, inside a collapsed overflow-hidden box, below
 * /study's h-dvh overflow-hidden frame or off the page does not count.
 */
export async function accentFamilies(page: Page): Promise<AccentCount & { tokens: AccentTokens }> {
  const { tokens, nodes, area } = await page.evaluate(() => {
    const FAMILY = /^--(mint|coral|sun|violet)(-[a-z0-9-]+)?$/;
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
    if (!names.size) for (const f of ["mint", "coral", "sun", "violet"]) for (const v of ["", "-ink", "-tint", "-tag"]) names.add(`--${f}${v}`);
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
      return {
        parent: el.parentElement ? index.get(el.parentElement) ?? -1 : -1,
        shown,
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
  });
  const seen = visibleBoxes(nodes as LaidOutNode[], area.page, area.viewport);
  return { ...accentFamiliesPainted(tokens, paintsOf(nodes.map((n, i) => ({ ...n, visible: seen[i] })))), tokens };
}
