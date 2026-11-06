import { expect, test, type Page } from "@playwright/test";
import { measureLayout } from "./support/measure";

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
