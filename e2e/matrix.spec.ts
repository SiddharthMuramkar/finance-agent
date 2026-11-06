import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cellsOfProject, MATRIX_DIR, type MatrixCell } from "../src/dev/preview-matrix";
import { quietDevtools, seed, settled } from "./support/app";
import { auditAffordances, measureLayout, type Affordances, type Layout } from "./support/measure";

/**
 * F1's preview matrix (spec 2026-11-05, ticket F1): one shot and one set of numbers for every cell of the current
 * project. It runs only with UI_MATRIX=1, so the ordinary `ui` CI job does not touch it. Run it with
 * `node scripts/preview-matrix.mjs`. Expected numbers are the thresholds of §6.2, not values read from the code.
 * Pages still changing (header, Settings, Topic menu) are found by route and role, never by markup.
 */
test.skip(process.env.UI_MATRIX !== "1", "the preview matrix runs only with UI_MATRIX=1 (node scripts/preview-matrix.mjs)");
// Default mode, one worker: the three tests run in file order, and a failing cell must not skip the later tests.

type Result = {
  cell: string;
  file: string;
  layout: Layout | null;
  affordances: Affordances | null;
  focusRing: boolean | null;
  accents: number | null;
  scrollWidth: number;
  innerWidth: number;
  error?: string;
};

const results: Result[] = [];

// A failing test restarts the Playwright worker, which would empty `results`: the later tests read the numbers back
// from the file the first test wrote.
const cellsFile = (project: string) => join(process.cwd(), MATRIX_DIR, project, "cells.json");
const saved = (project: string): Result[] => JSON.parse(readFileSync(cellsFile(project), "utf8"));

/** Distinct computed fills among --mint, --coral, --sun and --violet. */
const accentCount = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const fills = new Set<string>();
    for (const name of ["--mint", "--coral", "--sun", "--violet"]) {
      probe.style.backgroundColor = `var(${name})`;
      fills.add(getComputedStyle(probe).backgroundColor);
    }
    probe.remove();
    return fills.size;
  });

/** Presses Tab up to 12 times and reports whether any focused element shows an outline or a ring shadow. */
async function focusRingVisible(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const shown = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const s = getComputedStyle(el);
      return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== "none" && s.boxShadow !== "");
    });
    if (shown) return true;
  }
  return false;
}

async function visit(page: Page, cell: MatrixCell): Promise<Result> {
  const { page: p } = cell;
  const out: Result = { cell: `${cell.project}/${p.id}`, file: cell.file, layout: null, affordances: null, focusRing: null, accents: null, scrollWidth: 0, innerWidth: 0 };
  try {
    if (p.signedOut) await page.context().clearCookies();
    else await seed(page, p.seed!);
    await page.goto(p.path);
    if (p.kind === "study") {
      await expect(page.getByTestId("workspace-frame")).toBeVisible();
      await settled(page);
    } else if (p.kind === "reading" && p.path !== "/") {
      await expect(page.getByTestId("reading-column")).toBeVisible();
      await page.waitForLoadState("networkidle");
    } else {
      await expect(page.getByRole("heading").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    const dims = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    out.scrollWidth = dims.scrollWidth;
    out.innerWidth = dims.innerWidth;
    out.layout = await measureLayout(page);
    out.affordances = await auditAffordances(page);
    if (p.id === "study-concept-widget") out.accents = await accentCount(page);
    mkdirSync(dirname(join(process.cwd(), cell.file)), { recursive: true });
    await page.screenshot({ path: cell.file, fullPage: true });
    out.focusRing = await focusRingVisible(page); // after the shot, so the ring does not appear in it
  } catch (e) {
    out.error = String(e instanceof Error ? e.message : e).split("\n")[0];
  }
  return out;
}

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

test("[F1] every cell loads without horizontal scroll", async ({ page }, info) => {
  test.setTimeout(10 * 60_000);
  for (const cell of cellsOfProject(info.project.name)) results.push(await visit(page, cell));
  mkdirSync(dirname(cellsFile(info.project.name)), { recursive: true });
  writeFileSync(cellsFile(info.project.name), JSON.stringify(results.filter((r) => r.cell.startsWith(`${info.project.name}/`)), null, 2));
  const failing = results.filter((r) => r.error || r.scrollWidth > r.innerWidth).map((r) => `${r.cell}: ${r.error ?? `scrollWidth ${r.scrollWidth} > ${r.innerWidth}`}`);
  expect(failing, "cells that failed to load or scroll sideways").toEqual([]);
});

test("[F1] the §6 numbers hold in every cell", async ({}, info) => {
  const project = info.project.name;
  const w1024 = project.startsWith("w1024");
  const gutterMax = w1024 ? 17 : 32; // §6.2: 32 px; A1 names 17 px at 1024
  const [lineMin, lineMax] = w1024 ? [45, 80] : project.startsWith("w1280") || project.startsWith("mbp14") || project.startsWith("w1920") ? [60, 75] : [45, 80];
  const failing: string[] = [];
  for (const r of saved(project)) {
    const id = r.cell.split("/")[1];
    const l = r.layout, a = r.affordances;
    if (!l || !a) { failing.push(`${r.cell}: not measured (${r.error ?? "no data"})`); continue; }
    const login = id.startsWith("login");
    if (!login) {
      if (l.gutterLeft !== null && l.gutterLeft > gutterMax) failing.push(`${r.cell}: left gutter ${l.gutterLeft} > ${gutterMax}`);
      if (l.gutterRight !== null && l.gutterRight > gutterMax) failing.push(`${r.cell}: right gutter ${l.gutterRight} > ${gutterMax}`);
      if (l.headerHeight !== null && l.headerHeight > 56) failing.push(`${r.cell}: header ${l.headerHeight} > 56`);
    }
    if (id === "study-concept-widget" && (l.panelWidthPct === null || l.panelWidthPct < 55)) failing.push(`${r.cell}: panelWidthPct ${l.panelWidthPct} < 55`);
    if (l.charsPerLine !== null && (l.charsPerLine < lineMin || l.charsPerLine > lineMax)) failing.push(`${r.cell}: chars per line ${l.charsPerLine} outside ${lineMin}-${lineMax}`);
    if (l.horizontalScroll) failing.push(`${r.cell}: horizontal scroll`);
    for (const key of ["interactiveWithoutSignifier", "pointerOnStatic", "staticLooksPressable", "tooSmall"] as const) {
      if (a[key].length) failing.push(`${r.cell}: ${key} ${JSON.stringify(a[key].slice(0, 5))}`);
    }
    if (r.focusRing === false) failing.push(`${r.cell}: no focus ring visible on Tab`);
  }
  expect(failing, "failing cells (each is a finding)").toEqual([]);
});

test("[F1] /study with a Widget shows ≥ 3 accents", async ({}, info) => {
  const r = saved(info.project.name).find((x) => x.cell === `${info.project.name}/study-concept-widget`);
  expect(r?.accents, "distinct fills among --mint, --coral, --sun, --violet").toBeGreaterThanOrEqual(3);
});
