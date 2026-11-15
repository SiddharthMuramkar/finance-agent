import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { accentFamilies, auditAffordances, measureLayout, pressLook, readingBlock, widgetLook } from "./support/measure";

/**
 * The measuring helper itself (e2e/support/measure.ts, F1's `{ prose }` option), on fixed pages: no app, no server
 * state. Running prose is a paragraph laid out down the column; a blurb inside a card that sits beside other cards
 * (a grid of 2+ columns, or a flex row) is a panel's text, not running prose (§2: "panels and Widgets span the width,
 * running prose caps at 70ch").
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== "mbp14", "fixed pages: one viewport is enough"));

const PROSE = '[data-testid="reading-column"] p';
const words = (n: number) => Array.from({ length: n }, (_, i) => ["money", "today", "is", "worth", "more", "than", "later"][i % 7]).join(" ");
const column = (page: Page, body: string) =>
  page.setContent(`<body style="margin:0;font:16px/24px monospace"><main><div data-testid="reading-column">${body}</div></main></body>`);
const prose = (ch: number) => `<p style="max-width:${ch}ch">${words(120)}</p>`;
const cards = (style: string) =>
  `<ol style="${style};list-style:none;padding:0">${Array.from({ length: 4 }, () => `<li><p style="max-width:30ch">${words(40)}</p></li>`).join("")}</ol>`;

test("[F1] prose: cards in a multi-column grid are not running prose", async ({ page }) => {
  await column(page, prose(70) + cards("display:grid;grid-template-columns:repeat(2,340px)"));
  const l = await measureLayout(page, { prose: PROSE });
  expect(l.proseMeasured).toBe(1);
  expect(l.charsPerLine).toBeGreaterThanOrEqual(60);
});

test("[F1] prose: cards in a flex row are not running prose", async ({ page }) => {
  await column(page, prose(70) + cards("display:flex;flex-direction:row;gap:8px"));
  const l = await measureLayout(page, { prose: PROSE });
  expect(l.proseMeasured).toBe(1);
  expect(l.charsPerLine).toBeGreaterThanOrEqual(60);
});

test("[F1] prose: a one-column grid or a flex column is still running prose", async ({ page }) => {
  await column(page, `<section style="display:flex;flex-direction:column"><div style="display:grid;gap:8px">${prose(70)}${prose(70)}</div></section>`);
  const l = await measureLayout(page, { prose: PROSE });
  expect(l.proseMeasured).toBe(2);
  expect(l.charsPerLine).toBeGreaterThanOrEqual(60);
});

// Settings (A5) is all cards, and A1 says "Running paragraphs inside cards use `measure`": with `cardsAsColumns` each
// card of a multi-column grid is its own column, so its paragraphs are measured inside it. A side-by-side row inside a
// card is still not running prose.
test("[F1] prose: with cardsAsColumns, each card's paragraphs are measured inside their card", async ({ page }) => {
  const sideBySide = `<li><div style="display:flex;gap:8px"><p style="max-width:12ch">${words(20)}</p><p style="max-width:12ch">${words(20)}</p></div></li>`;
  await column(page, `<ol style="display:grid;grid-template-columns:repeat(2,340px);list-style:none;padding:0">${Array.from({ length: 3 }, () => `<li><p style="max-width:30ch">${words(40)}</p></li>`).join("")}${sideBySide}</ol>`);
  const l = await measureLayout(page, { prose: PROSE, cardsAsColumns: true });
  expect(l.proseMeasured).toBe(3);
  expect(l.charsPerLine).toBeGreaterThanOrEqual(25);
  expect(l.charsPerLine).toBeLessThanOrEqual(30);
  // Without the option the same page is "only cards": nothing measured (Course Map's rule).
  expect((await measureLayout(page, { prose: PROSE })).proseMeasured).toBe(0);
});

test("[F1] prose: a narrow paragraph fails the bound, and a column of only cards measures nothing", async ({ page }) => {
  await column(page, prose(40));
  expect((await measureLayout(page, { prose: PROSE })).charsPerLine).toBeLessThan(45);
  await column(page, cards("display:grid;grid-template-columns:repeat(2,340px)"));
  const l = await measureLayout(page, { prose: PROSE });
  expect(l.proseMeasured).toBe(0);
  expect(l.charsPerLine).toBeNull();
});

// Signal families (spec §2.1: gain, loss, wait): throwaway pages styled by the app's real globals.css, so every token
// resolves the way it does on /study, in the one Light theme. The whole page counts, not only the Widget panel.
const GLOBALS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const styled = (page: Page, body: string) =>
  page.setContent(`<html><head><style>${GLOBALS}</style></head><body style="margin:0;background:var(--bg);color:var(--ink);font:16px sans-serif">${body}</body></html>`);
// Neutrals only, plus accents that are on the page but not seen: display none, visibility hidden, inside opacity 0, 0x0.
const NEUTRAL = `
  <header style="height:48px;border-bottom:1px solid var(--hairline);background:var(--field)"><a style="color:var(--brand)">Course Map</a></header>
  <main style="display:flex;gap:16px;padding:16px">
    <section style="flex:1;background:var(--field);border:1px solid var(--border);color:var(--muted)"><p>The Tutor says hello.</p>
      <button style="background:var(--brand-main);color:var(--brand-ink);border:1px solid var(--edge)">Send</button></section>
    <section data-testid="widget-pane" style="flex:1;background:var(--bubble)"><svg width="80" height="40"><rect width="80" height="40" fill="var(--data)" stroke="var(--edge)"/></svg>
      <p style="display:none;color:var(--gain)">hidden gain</p>
      <p style="visibility:hidden;background:var(--loss);color:var(--loss-ink)">hidden loss</p>
      <div style="opacity:0"><p style="background:var(--wait-tint)">see-through careful</p></div>
      <span style="display:block;width:0;height:0;overflow:hidden;background:var(--wait)">x</span>
      <p style="color:var(--sun);background:var(--violet-tint)">sunflower and violet are neutral now</p></section>
  </main>`;
// A signal family in each region: the header (gain ink, by its older name), the chat (loss tint, by its older name), the
// Topic bar (a careful tint), the Widget panel (a gain line). Only the Widget panel's is inside [data-testid="widget-pane"].
const LIVELY = `
  <header style="height:48px;background:var(--field)"><span style="color:var(--mint-ink)">Your progress</span></header>
  <div data-testid="topic-bar" aria-label="Topic progress" style="padding:8px"><span style="background:var(--wait-tint);padding:2px 6px">Careful</span></div>
  <main style="display:flex;gap:16px;padding:16px">
    <section style="flex:1;background:var(--coral-tint);padding:8px"><p>A loss of 20 %.</p></section>
    <section data-testid="widget-pane" style="flex:1"><div style="border-top:2px solid var(--gain-line);padding:8px"><p>Growth</p></div></section>
  </main>`;

// Shaped like /study: an h-dvh overflow-hidden frame whose chat and Widget panes scroll inside it. Every accent is on the
// page and painted, but clipped away from the screenshot: scrolled out of the chat, inside a collapsed overflow-hidden
// box, past the frame's bottom edge, off the page's left edge. Scrolling the chat to its end brings its coral into view.
const CLIPPED = `
  <main data-route="study" style="height:100dvh;overflow:hidden;display:flex;flex-direction:column;padding:12px">
    <header style="height:48px;flex:none;background:var(--field)"><a style="color:var(--brand)">Course Map</a></header>
    <div style="flex:none;height:700px;display:flex;gap:16px">
      <section data-testid="chat" style="flex:1;overflow-y:auto;background:var(--field)">
        <p style="height:3000px;margin:0;color:var(--muted)">The Tutor says hello.</p>
        <p style="background:var(--coral-tint);color:var(--coral-ink);margin:0">A loss of 20 %.</p></section>
      <section data-testid="widget-pane" style="flex:1;overflow:auto">
        <div style="height:0;overflow:hidden"><p style="background:var(--wait-tint);color:var(--wait-ink)">collapsed careful card</p></div>
        <span style="position:absolute;left:-400px;top:80px;width:120px;background:var(--gain);color:var(--gain-ink)">off the page</span></section>
    </div>
    <div style="flex:none;height:400px;margin-top:2000px;background:var(--wait-tint);color:var(--wait)">below the frame</div>
  </main>`;

test("[F1] signal families: a page of neutrals and hidden signal colours paints no family", async ({ page }) => {
  await styled(page, NEUTRAL);
  expect((await accentFamilies(page)).families).toEqual([]);
});

test("[F1] signal families: every family on the page counts, ink, tint and line included, and older names too", async ({ page }) => {
  await styled(page, LIVELY);
  expect((await accentFamilies(page)).families).toEqual(["gain", "loss", "wait"]);
});

test("[F1] signal families: colours clipped away from the screenshot do not count, scrolled into view they do", async ({ page }) => {
  await styled(page, CLIPPED);
  expect((await accentFamilies(page)).families).toEqual([]);
  await page.getByTestId("chat").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect((await accentFamilies(page)).families).toEqual(["loss"]);
});

const SPLIT = `
  <div class="split-handle" role="separator" data-affordance="split" aria-label="Resize the conversation and the Widget panel" tabindex="0" style="width:24px;height:400px;position:relative">
    <span data-split-line></span>
    <span data-split-grip></span>
  </div>`;

test("[C2b] the audit judges a split handle", async ({ page }) => {
  await styled(page, SPLIT);
  const clean = await auditAffordances(page);
  expect(clean.interactiveWithoutSignifier).toEqual([]);
  expect(clean.tooSmall).toEqual([]);

  await styled(page, SPLIT.replace("split-handle", "split-handle") + `<style>.split-handle{cursor:pointer!important}</style>`);
  // The class already sets col-resize; an inline cursor on the element itself is what the audit reads.
  await page.evaluate(() => {
    const el = document.querySelector(".split-handle") as HTMLElement;
    el.style.cursor = "pointer";
  });
  expect((await auditAffordances(page)).interactiveWithoutSignifier.length).toBeGreaterThan(0);

  await styled(page, `
    <div class="split-handle" role="separator" data-affordance="split" aria-label="Resize the conversation and the Widget panel" tabindex="0" style="width:24px;height:400px"></div>`);
  expect((await auditAffordances(page)).interactiveWithoutSignifier.length).toBeGreaterThan(0);

  await styled(page, SPLIT.replace("width:24px", "width:10px"));
  expect((await auditAffordances(page)).tooSmall.length).toBeGreaterThan(0);
});

// C1 (spec 2026-11-11): the conversation's reading block, on fixed pages with inline styles (raw globals.css is not compiled
// here). A 600 px size container holds a block of min(34em, 100cqw - 32px), centred: 544 wide, 28 px either side.
const reading = (page: Page, blockStyle: string, inner = "") =>
  page.setContent(`<body style="margin:0;font:16px sans-serif"><div data-testid="chat-column" style="width:600px;container-type:inline-size">
    <div data-testid="reading-block" style="width:min(34em, 100cqw - 32px);margin-inline:auto;${blockStyle}">${inner}</div>
    <div data-testid="composer-block" style="width:min(34em, 100cqw - 32px);margin-inline:auto"><form data-testid="composer">x</form></div></div></body>`);

test("[C1] readingBlock measures a centred block, an off-centre one, and a child's own right edge", async ({ page }) => {
  await reading(page, "", `<div data-testid="assistant-message">A reply.</div>`);
  const centred = await readingBlock(page);
  expect(centred.offCentre).toBeCloseTo(0, 1);
  expect(centred.block?.width).toBeCloseTo(544, 1);
  expect(centred.composer).toEqual(centred.block);
  expect(centred.edges.find((e) => e.name === "composer")).toMatchObject({ left: centred.block!.left, right: centred.block!.right });

  await reading(page, "margin-left:38px");
  expect((await readingBlock(page)).offCentre).toBeCloseTo(20, 1);

  await reading(page, "", `<div data-testid="assistant-message">First.</div><div data-testid="assistant-message" style="margin-right:5px">Last.</div>`);
  const short = await readingBlock(page);
  expect(short.edges.find((e) => e.name === "assistant-message")?.right).toBeCloseTo(short.block!.right - 5, 1);
});

// A7a (ADR 0014; spec §2.2 rules 5 and 6): inside a Widget the signal colours are small marks only; no fill, no family
// text, no lift, no tilt, nothing over 600, and 600 only on the one key figure. `widgetLook` lists what breaks that, on
// fixed pages styled by the real globals.css.
const MISUSED = `
  <div style="width:300px;height:80px;background:var(--wait-tint)">Careful</div>
  <p style="color:var(--loss-ink)">A loss</p>
  <div style="width:300px;height:80px;background:var(--raised);box-shadow:0 6px 16px -8px var(--shadow)">Lifted card</div>
  <div style="width:300px;height:80px;background:var(--raised);box-shadow:inset 0 -10px 18px -12px var(--shadow)">Lipped box</div>
  <div style="width:120px;height:40px;rotate:6deg">Tilted</div>
  <p style="font-weight:700">Bold</p>
  <p style="font-weight:600">Semibold</p>`;
const MARKS = `
  <div style="width:300px;height:40px;border-left:2px solid var(--wait)">Edge</div>
  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gain)"></span>
  <div style="width:300px;height:2px;background:var(--loss)"></div>
  <svg width="300" height="80"><path d="M0 70 L300 10" stroke="var(--gain-ink)" stroke-width="2" fill="none"/><rect x="10" y="20" width="40" height="60" fill="var(--gain-deep)"/></svg>
  <p style="color:var(--ink)">Right</p>
  <div style="width:300px;height:40px;box-shadow:inset 0 0 0 1px var(--accent)">Ring</div>
  <div style="width:300px;height:80px;transform:rotateY(180deg)">Flipped card</div>
  <span data-key-figure style="font-weight:600">₹1,000</span>`;
const NONE = { fills: [], text: [], shadows: [], tilted: [], heavy: [], semibold: [] };
const lengths = (l: Record<string, string[]>) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v.length]));

test(`[A7a] widgetLook: a fill, family text, two shadows, a tilt, a heavy and a semibold inside a Widget`, async ({ page }) => {
  await styled(page, `<div class="genui">${MISUSED}</div>`);
  expect(lengths(await widgetLook(page))).toEqual({ fills: 1, text: 1, shadows: 2, tilted: 1, heavy: 1, semibold: 1 });
});

test(`[A7a] widgetLook: thin marks, a ring, a flip and the key figure pass`, async ({ page }) => {
  await styled(page, `<div class="genui">${MARKS}</div>`);
  expect(await widgetLook(page)).toEqual(NONE);
});

test(`[A7a] widgetLook: the same misuse outside a Widget is not its business`, async ({ page }) => {
  await styled(page, `<div class="genui">${MARKS}</div><div>${MISUSED}</div>`);
  expect(await widgetLook(page)).toEqual(NONE);
});

test(`[A7a] widgetLook: a family Tag is a neutral tag with a coloured dot`, async ({ page }) => {
  await styled(page, `<div class="genui"><span class="tag" data-tone="violet">Lingo</span></div>`);
  expect(await widgetLook(page)).toEqual(NONE);
  const seen = await page.evaluate(() => {
    const tag = document.querySelector(".tag")!;
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const resolve = (v: string) => {
      probe.style.backgroundColor = `var(${v})`;
      return getComputedStyle(probe).backgroundColor;
    };
    return { bg: getComputedStyle(tag).backgroundColor, hairline: resolve("--hairline"), dot: getComputedStyle(tag, "::before").backgroundColor, violet: resolve("--violet") };
  });
  expect(seen.bg).toBe(seen.hairline);
  expect(seen.dot).toBe(seen.violet);
});

// A7a: every Widget on the page is judged, not just the first one the selector finds.
test("[A7a] widgetLook judges every Widget that matches the scope", async ({ page }) => {
  await styled(page, `<div class="genui">${MARKS}</div><div class="genui">${MISUSED}</div>`);
  expect(lengths(await widgetLook(page))).toEqual({ fills: 1, text: 1, shadows: 2, tilted: 1, heavy: 1, semibold: 1 });
});

// A7a: a scope that matches nothing is a broken test, not a clean Widget; it never falls back to the whole page.
test("[A7a] widgetLook fails when the scope matches nothing", async ({ page }) => {
  await styled(page, `<div>${MISUSED}</div>`);
  await expect(widgetLook(page, { within: '[data-testid="no-such-part"]' })).rejects.toThrow(/no-such-part/);
});

// A7a (guard): since A4, `auditAffordances` judges Widget controls by default (ADR 0014: one set of control rules).
test("[A7a] auditAffordances: a lipped button and a 16px-radius button inside a Widget are not flat", async ({ page }) => {
  await styled(
    page,
    `<div class="genui">
    <button data-affordance="button" style="box-shadow:0 3px 0 #000">Lipped</button>
    <button data-affordance="button" style="border-radius:16px">Rounded</button></div>`,
  );
  const { notFlat } = await auditAffordances(page);
  expect(notFlat.some((n) => n.includes('"Lipped"'))).toBe(true);
  expect(notFlat.some((n) => n.includes('"Rounded"'))).toBe(true);
});

// The audits' `letOff` (affordance.spec.ts, the Signal pages): a control inside `letOff` is not judged for its signifier,
// its flatness or the F4 link and blue-word rules, and is counted; every other rule, and every control outside it, still is.
test("[A3b, F4] letOff lets off only the controls inside it, and only for the look rules", async ({ page }) => {
  await styled(
    page,
    `<main style="padding:24px">
    <p><a href="#a" class="spec-look" data-affordance="link" style="color:var(--accent);text-decoration:none">Spec link</a></p>
    <p><a href="#b" data-affordance="link" style="color:var(--accent);text-decoration:none">Bare link</a></p>
    <button class="spec-look" data-affordance="button" style="border-radius:999px;border:1px solid #000;cursor:pointer">Pill</button>
    <button class="spec-look" data-affordance="button" style="border:1px solid #000;cursor:pointer;height:12px;font-size:8px">Tiny</button>
    <span class="spec-look" style="cursor:pointer">Static</span></main>`,
  );
  const all = await auditAffordances(page);
  expect(all.interactiveWithoutSignifier).toEqual(['a "Spec link"', 'a "Bare link"']);
  expect(all.notFlat).toEqual(['button "Pill" radius']);
  const some = await auditAffordances(page, { letOff: ".spec-look" });
  expect(some.interactiveWithoutSignifier).toEqual(['a "Bare link"']);
  expect(some.notFlat).toEqual([]);
  expect(some.tooSmall.some((n) => n.startsWith('button "Tiny"'))).toBe(true);
  expect(some.pointerOnStatic).toEqual(['span "Static"']);
  expect(some.counts.letOff).toBe(3);

  const look = await pressLook(page, { letOff: ".spec-look" });
  expect(look.readingLinks.map((w) => w.split(" rgb")[0])).toEqual(['a "Bare link"']);
  expect(look.bareBlueWords.map((w) => w.split(":")[0])).toEqual(['a "Bare link"']);
  expect(look.counts.letOff).toBe(3);
  expect((await pressLook(page)).readingLinks).toHaveLength(2);
});

// An inset ring (inset 0 0 0 1px, no offset or blur) is drawn exactly like a border, so it is a button's edge (the Signal
// widgets' quiet button); a ring too faint to see, or a soft inset glow, is not.
test("[A3b] auditAffordances reads an inset ring as an edge", async ({ page }) => {
  const button = (shadow: string, label: string) => `<button data-affordance="button" style="background:#fff;border:0;cursor:pointer;height:40px;box-shadow:${shadow}">${label}</button>`;
  await styled(page, `<main style="background:#fff;padding:24px">${button("inset 0 0 0 1px #e2e5ea", "Ring")}${button("inset 0 0 0 1px #fbfbfc", "Faint")}${button("inset 0 2px 6px #000", "Glow")}</main>`);
  expect((await auditAffordances(page)).interactiveWithoutSignifier).toEqual(['button "Faint"', 'button "Glow"']);
});
