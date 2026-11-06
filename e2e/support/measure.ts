import type { Page } from "@playwright/test";

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
 * every visible element the selector matches instead (not flex or grid rows): the full lines (all but each element's last) of all of them,
 * median, and `proseMeasured` says how many elements had a full line. Nothing else changes.
 */
export function measureLayout(page: Page, opts: { prose?: string } = {}): Promise<Layout> {
  return page.evaluate((prose) => {
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
    let proseLine: number | null = null, proseMeasured: number | undefined;
    if (prose) {                                    // F1: the running prose of a reading page, every matched element
      const full: number[] = [];
      proseMeasured = 0;
      for (const el of document.querySelectorAll(prose)) {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === "hidden" || s.display === "none") continue;
        if (/flex|grid/.test(s.display)) continue;  // a row of tags or links laid out side by side is not running prose
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
  }, opts.prose ?? null);
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
