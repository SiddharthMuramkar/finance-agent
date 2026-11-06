import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { accentFamilies, measureLayout } from "./support/measure";

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

test("[F1] prose: a narrow paragraph fails the bound, and a column of only cards measures nothing", async ({ page }) => {
  await column(page, prose(40));
  expect((await measureLayout(page, { prose: PROSE })).charsPerLine).toBeLessThan(45);
  await column(page, cards("display:grid;grid-template-columns:repeat(2,340px)"));
  const l = await measureLayout(page, { prose: PROSE });
  expect(l.proseMeasured).toBe(0);
  expect(l.charsPerLine).toBeNull();
});

// Accent families (F1, §3 row 7): throwaway pages styled by the app's real globals.css, so every token resolves the way
// it does on /study, in Light and in Dark (`:root.dark`). The whole page counts, not only the Widget panel.
const GLOBALS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const themed = (page: Page, theme: "light" | "dark", body: string) =>
  page.setContent(`<html class="${theme === "dark" ? "dark" : ""}"><head><style>${GLOBALS}</style></head><body style="margin:0;background:var(--bg);color:var(--ink);font:16px sans-serif">${body}</body></html>`);
// Neutrals only, plus accents that are on the page but not seen: display none, visibility hidden, inside opacity 0, 0x0.
const NEUTRAL = `
  <header style="height:48px;border-bottom:1px solid var(--hairline);background:var(--field)"><a style="color:var(--brand)">Course Map</a></header>
  <main style="display:flex;gap:16px;padding:16px">
    <section style="flex:1;background:var(--field);border:1px solid var(--border);color:var(--muted)"><p>The Tutor says hello.</p>
      <button style="background:var(--brand-main);color:var(--brand-ink);border:1px solid var(--edge)">Send</button></section>
    <section data-testid="widget-pane" style="flex:1;background:var(--bubble)"><svg width="80" height="40"><rect width="80" height="40" fill="var(--data)" stroke="var(--edge)"/></svg>
      <p style="display:none;color:var(--mint)">hidden mint</p>
      <p style="visibility:hidden;background:var(--coral);color:var(--coral-ink)">hidden coral</p>
      <div style="opacity:0"><p style="background:var(--sun-tag)">see-through sun</p></div>
      <span style="display:block;width:0;height:0;overflow:hidden;background:var(--violet)">x</span></section>
  </main>`;
// One accent family in each region: the header (mint ink), the chat (coral tint), the Topic bar (sun tag), the Widget
// panel (a violet tint card). Only the Widget panel's is inside [data-testid="widget-pane"].
const LIVELY = `
  <header style="height:48px;background:var(--field)"><span style="color:var(--mint-ink)">Your progress</span></header>
  <div data-testid="topic-bar" aria-label="Topic progress" style="padding:8px"><span style="background:var(--sun-tag);padding:2px 6px">History</span></div>
  <main style="display:flex;gap:16px;padding:16px">
    <section style="flex:1;background:var(--coral-tint);padding:8px"><p>A loss of 20 %.</p></section>
    <section data-testid="widget-pane" style="flex:1"><div style="background:var(--violet-tint);padding:8px"><p>Lingo card</p></div></section>
  </main>`;

for (const theme of ["light", "dark"] as const) {
  test(`[F1] accents: a page of neutrals and hidden accents paints no accent family (${theme})`, async ({ page }) => {
    await themed(page, theme, NEUTRAL);
    expect((await accentFamilies(page)).families).toEqual([]);
  });

  test(`[F1] accents: every accent family on the page counts, ink, tint and tag included (${theme})`, async ({ page }) => {
    await themed(page, theme, LIVELY);
    expect((await accentFamilies(page)).families).toEqual(["mint", "coral", "sun", "violet"]);
  });
}
