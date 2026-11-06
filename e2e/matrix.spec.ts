import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cellsOfProject, MATRIX_DIR, matrixThresholds, type MatrixCell } from "../src/dev/preview-matrix";
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
  focus: FocusWalk | null;
  /** Which of --mint, --coral, --sun, --violet the Widget panel actually paints (concept-with-Widget cell only). */
  accents: string[] | null;
  scrollWidth: number;
  innerWidth: number;
  error?: string;
};

type FocusWalk = {
  /** How many elements Tab stopped on before it left the page or came back round. */
  stops: number;
  /** Accessible names Tab reached (aria-label, else the text), in order. */
  reached: string[];
  /** Stops whose outline and box-shadow did not change from the element's own resting look. */
  withoutRing: string[];
};

/** Run envelope: `run` matches the token test 1 left in Playwright's output dir, which Playwright empties every run. */
type Saved = { run: string; cells: Result[] };

const results: Result[] = [];

// A failing test restarts the Playwright worker, which would empty `results`: the later tests read the numbers back
// from the file the first test wrote. The token file lives in the project's outputDir (test-results/), which Playwright
// deletes at the start of every run, so a cells.json left by an earlier run (or a run whose test 1 died) never matches.
const cellsFile = (project: string) => join(process.cwd(), MATRIX_DIR, project, "cells.json");
const tokenFile = (outputDir: string, project: string) => join(outputDir, `matrix-run-${project}.txt`);
function saved(project: string, outputDir: string): Result[] {
  const token = tokenFile(outputDir, project);
  if (!existsSync(token)) throw new Error(`no matrix run token for ${project}: test 1 ("every cell loads") did not run in this run`);
  if (!existsSync(cellsFile(project))) throw new Error(`${cellsFile(project)} is missing: test 1 did not finish its cells in this run`);
  const data = JSON.parse(readFileSync(cellsFile(project), "utf8")) as Saved;
  if (data.run !== readFileSync(token, "utf8").trim()) throw new Error(`${cellsFile(project)} is from an earlier run (stale): test 1 did not finish in this run`);
  return data.cells;
}

/** The accessible names the Done-when keyboard pass needs: the header's three icons, and Google on the sign-in page. */
const HEADER_CONTROLS = ["Theme", "Settings", "Account menu"];
const LOGIN_CONTROLS = ["Continue with Google"];

/**
 * Which of --mint, --coral, --sun and --violet the visible elements of the Widget panel paint: backgrounds (and their
 * gradients), borders, SVG fills and strokes, and the colour of text they hold. A probe only resolves each token to its
 * colour; the count comes from what is painted. A tint (same colour, alpha >= 0.1) counts as its accent.
 */
const accentsPainted = (page: Page) =>
  page.evaluate(() => {
    const pane = document.querySelector('[data-testid="widget-pane"]');
    if (!pane) return null;
    type Rgba = [number, number, number, number];
    const parse = (c: string): Rgba[] => {
      const out: Rgba[] = [];
      for (const m of c.matchAll(/rgba?\(([^)]+)\)/g)) {
        const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
        out.push([+r, +g, +b, +a]);
      }
      for (const m of c.matchAll(/color\(srgb ([^)]+)\)/g)) {
        const [r, g, b, a = "1"] = m[1].split(/[\s/]+/).filter(Boolean);
        out.push([+r * 255, +g * 255, +b * 255, +a]);
      }
      return out;
    };
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const accents = ["--mint", "--coral", "--sun", "--violet"].map((name) => {
      probe.style.color = `var(${name})`;
      return { name, rgb: parse(getComputedStyle(probe).color)[0] };
    });
    probe.remove();
    const painted: Rgba[] = [];
    for (const el of [pane, ...pane.querySelectorAll("*")]) {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (!r.width || !r.height || s.visibility === "hidden" || s.display === "none" || s.opacity === "0") continue;
      painted.push(...parse(s.backgroundColor), ...parse(s.backgroundImage));
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none") painted.push(...parse(s[`border${side}Color`]));
      }
      if (el instanceof SVGElement) {
        if (s.fill !== "none") painted.push(...parse(s.fill));
        if (s.stroke !== "none" && parseFloat(s.strokeWidth) > 0) painted.push(...parse(s.stroke));
      }
      if ([...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) painted.push(...parse(s.color));
    }
    const near = (a: Rgba, b: Rgba) => a[3] >= 0.1 && Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2 && Math.abs(a[2] - b[2]) <= 2;
    return accents.filter((x) => x.rgb && painted.some((p) => near(p, x.rgb))).map((x) => x.name);
  });

/**
 * Walks Tab through the whole page (until focus leaves it or comes back round, at most 80 stops). Before the first Tab
 * it notes every element's resting outline and box-shadow, so a raised button's resting lip is not mistaken for a ring:
 * a stop shows a ring when its outline turns visible (not none, not 0 px, not transparent) or its box-shadow changes
 * from that resting look. A stop whose style shows neither (a slider draws its ring on the thumb, which computed styles
 * cannot read) is judged by pixels: its box while focused, against the same box once the walk ends and nothing has focus
 * (so a neighbour's ring cannot leak into the comparison).
 */
async function focusWalk(page: Page): Promise<FocusWalk> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const rest = new WeakMap<Element, { outline: string; shadow: string }>();
    for (const el of document.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      rest.set(el, { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, shadow: s.boxShadow });
    }
    (window as unknown as { __f1Rest: typeof rest }).__f1Rest = rest;
  });
  const viewport = page.viewportSize()!;
  const clipOf = async (id: string) => {
    const b = await page.locator(`[data-f1-stop="${id}"]`).boundingBox();
    if (!b) return null;
    const pad = 6; // outline-offset 2 px + a 2 px ring, with room to spare
    const x = Math.max(0, Math.floor(b.x - pad)), y = Math.max(0, Math.floor(b.y - pad));
    const width = Math.min(viewport.width, Math.ceil(b.x + b.width + pad)) - x, height = Math.min(viewport.height, Math.ceil(b.y + b.height + pad)) - y;
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  };
  const shot = async (id: string) => { const clip = await clipOf(id); return clip ? page.screenshot({ clip, animations: "disabled" }) : null; };
  const walk: FocusWalk = { stops: 0, reached: [], withoutRing: [] };
  let first: string | null = null;
  const pending: { id: string; label: string; focused: Buffer | null }[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      // Next's dev overlay (nextjs-portal) is not part of the app; it sits after the page in Tab order.
      if (!el || el === document.body || el === document.documentElement || el.tagName === "NEXTJS-PORTAL") return null;
      const id = el.getAttribute("data-f1-stop") ?? String(Math.random()).slice(2);
      el.setAttribute("data-f1-stop", id);
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 40);
      const s = getComputedStyle(el);
      const before = (window as unknown as { __f1Rest: WeakMap<Element, { outline: string; shadow: string }> }).__f1Rest.get(el);
      const transparent = (c: string) => c === "transparent" || /,\s*0\)$|\/\s*0\)$/.test(c);
      const outline = `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
      const outlineShown = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && !transparent(s.outlineColor) && outline !== before?.outline;
      // An element that appeared after the snapshot has no known resting shadow: only its outline can count.
      const shadowShown = !!before && s.boxShadow !== "none" && s.boxShadow !== before.shadow;
      return { id, label: `${el.tagName.toLowerCase()} "${name}"`, name, ring: outlineShown || shadowShown };
    });
    if (!stop || stop.id === first) break;
    first ??= stop.id;
    walk.stops++;
    walk.reached.push(stop.name);
    if (!stop.ring) pending.push({ id: stop.id, label: stop.label, focused: await shot(stop.id) });
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  for (const p of pending) {
    await page.locator(`[data-f1-stop="${p.id}"]`).scrollIntoViewIfNeeded().catch(() => {});
    const unfocused = await shot(p.id);
    if (!p.focused || !unfocused || p.focused.equals(unfocused)) walk.withoutRing.push(p.label);
  }
  return walk;
}

async function visit(page: Page, cell: MatrixCell): Promise<Result> {
  const { page: p } = cell;
  const out: Result = { cell: `${cell.project}/${p.id}`, file: cell.file, layout: null, affordances: null, focus: null, accents: null, scrollWidth: 0, innerWidth: 0 };
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
    // Reading pages (the ReadingPage shell) are measured on their running prose: the column's paragraphs, minus the
    // blurbs of cards that sit beside other cards (measureLayout skips those).
    out.layout = await measureLayout(page, p.prose ? { prose: '[data-testid="reading-column"] p' } : {});
    out.affordances = await auditAffordances(page);
    if (p.id === "study-concept-widget") out.accents = await accentsPainted(page);
    mkdirSync(dirname(join(process.cwd(), cell.file)), { recursive: true });
    await page.screenshot({ path: cell.file, fullPage: true });
    out.focus = await focusWalk(page); // after the shot, so the ring does not appear in it
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
  // A fresh run starts from nothing: no screenshot or cells.json of an earlier run can be read as this run's.
  rmSync(join(process.cwd(), MATRIX_DIR, info.project.name), { recursive: true, force: true });
  const run = randomUUID();
  mkdirSync(info.project.outputDir, { recursive: true });
  writeFileSync(tokenFile(info.project.outputDir, info.project.name), run);
  for (const cell of cellsOfProject(info.project.name)) results.push(await visit(page, cell));
  mkdirSync(dirname(cellsFile(info.project.name)), { recursive: true });
  const cells = results.filter((r) => r.cell.startsWith(`${info.project.name}/`));
  writeFileSync(cellsFile(info.project.name), JSON.stringify({ run, cells } satisfies Saved, null, 2));
  const failing = results.filter((r) => r.error || r.scrollWidth > r.innerWidth).map((r) => `${r.cell}: ${r.error ?? `scrollWidth ${r.scrollWidth} > ${r.innerWidth}`}`);
  expect(failing, "cells that failed to load or scroll sideways").toEqual([]);
});

test("[F1] the §6 numbers hold in every cell", async ({}, info) => {
  const project = info.project.name;
  const { gutterMax, headerMax, panelMinPct, lineMin, lineMax } = matrixThresholds(project); // §6.2, 32 px gutters at 1024 too
  const failing: string[] = [];
  const cells = cellsOfProject(project);
  for (const r of saved(project, info.project.outputDir)) {
    const cell = cells.find((c) => `${c.project}/${c.page.id}` === r.cell)!;
    const id = r.cell.split("/")[1];
    const l = r.layout, a = r.affordances;
    if (!l || !a) { failing.push(`${r.cell}: not measured (${r.error ?? "no data"})`); continue; }
    const login = id.startsWith("login");
    if (!login) {
      if (l.gutterLeft !== null && l.gutterLeft > gutterMax) failing.push(`${r.cell}: left gutter ${l.gutterLeft} > ${gutterMax}`);
      if (l.gutterRight !== null && l.gutterRight > gutterMax) failing.push(`${r.cell}: right gutter ${l.gutterRight} > ${gutterMax}`);
      if (l.headerHeight !== null && l.headerHeight > headerMax) failing.push(`${r.cell}: header ${l.headerHeight} > ${headerMax}`);
    }
    if (id === "study-concept-widget" && (l.panelWidthPct === null || l.panelWidthPct < panelMinPct)) failing.push(`${r.cell}: panelWidthPct ${l.panelWidthPct} < ${panelMinPct}`);
    // Notebook and Settings have running paragraphs: measuring none is a failure. Course Map is cards and panels.
    if (cell.page.prose === "required" && l.charsPerLine === null) failing.push(`${r.cell}: chars per line not measured (${l.proseMeasured ?? 0} prose paragraphs of 2+ lines)`);
    if (l.charsPerLine !== null && (l.charsPerLine < lineMin || l.charsPerLine > lineMax)) failing.push(`${r.cell}: chars per line ${l.charsPerLine} outside ${lineMin}-${lineMax}`);
    if (l.horizontalScroll) failing.push(`${r.cell}: horizontal scroll`);
    for (const key of ["interactiveWithoutSignifier", "pointerOnStatic", "staticLooksPressable", "tooSmall"] as const) {
      if (a[key].length) failing.push(`${r.cell}: ${key} ${JSON.stringify(a[key].slice(0, 5))}`);
    }
    const f = r.focus;
    if (!f || f.stops === 0) failing.push(`${r.cell}: Tab reached nothing`);
    else {
      if (f.withoutRing.length) failing.push(`${r.cell}: no focus ring on Tab at ${JSON.stringify(f.withoutRing.slice(0, 5))}${f.withoutRing.length > 5 ? ` (+${f.withoutRing.length - 5})` : ""}`);
      // Home is the landing (no app header); /login?error=not_invited shows no Google button by design.
      const needed = id === "login" ? LOGIN_CONTROLS : login || id === "home" ? [] : HEADER_CONTROLS;
      // "Theme" also matches the theme button's "Theme: Light" (its name says the current choice).
      const missed = needed.filter((n) => !f.reached.some((got) => got === n || got.startsWith(`${n}:`)));
      if (missed.length) failing.push(`${r.cell}: Tab never reaches ${JSON.stringify(missed)}`);
    }
  }
  expect(failing, "failing cells (each is a finding)").toEqual([]);
});

test("[F1] /study with a Widget shows ≥ 3 accents", async ({}, info) => {
  const r = saved(info.project.name, info.project.outputDir).find((x) => x.cell === `${info.project.name}/study-concept-widget`);
  expect(r?.accents, `accents painted in the Widget panel (${r?.error ?? "measured"})`).not.toBeNull();
  expect(r!.accents!.length, `accents painted in the Widget panel: ${JSON.stringify(r!.accents)}`).toBeGreaterThanOrEqual(3);
});
