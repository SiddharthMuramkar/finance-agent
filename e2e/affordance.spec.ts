import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { MATRIX_PAGES, SIGN_IN_WRONG, type MatrixPage } from "../src/dev/preview-matrix";
import { hydrated, quietDevtools, replyLanded, seed, settled, type State } from "./support/app";
import { WIDGET_CONTENT, auditAffordances, pressLook } from "./support/measure";

/**
 * A3b: every button looks like a button, every link like a link, every tag like a tag (spec 2026-11-05, ticket A3b,
 * Appendix C.3, as ADR 0018 amends it: flat controls, signified by a face, an edge or a strong ghost label; nothing in the
 * app's chrome lifts, sinks or is a pill). Widgets are judged the same way (ADR 0018). Measured at 1512×982.
 */

// And mbp14-dark: the same audits in Dark (ADR 0019, #80), on a device set to dark.
const PROJECTS = ["mbp14", "mbp14-dark"];

test.beforeEach(async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "measured at 1512×982");
  await quietDevtools(page);
});

async function clean(page: Page, where: string, opts: { letOff?: string } = {}) {
  const audit = await auditAffordances(page, opts);
  expect(
    {
      interactiveWithoutSignifier: audit.interactiveWithoutSignifier,
      pointerOnStatic: audit.pointerOnStatic,
      staticLooksPressable: audit.staticLooksPressable,
      tooSmall: audit.tooSmall,
      notFlat: audit.notFlat,
    },
    `${where}: ${JSON.stringify(audit)}`,
  ).toEqual({ interactiveWithoutSignifier: [], pointerOnStatic: [], staticLooksPressable: [], tooSmall: [], notFlat: [] });
  expect(audit.counts.interactive, `${where} has controls to audit`).toBeGreaterThan(0);
}

async function visit(page: Page, state: State, path: string) {
  await seed(page, state);
  await page.goto(path);
  await hydrated(page);
}

/**
 * The Signal site's pages (decision #7: Home, How it works, Examples, the case pages and About) are judged like every other
 * page, but for the few Signal spec §5 components whose look the spec draws against the app's rules, while the owner
 * decides which rule wins (#32):
 * - text links (`.v-tlink`) and whole-row question links (`.v-qrow`, "Play →") have no underline until hover (§5.2),
 *   where ADR 0018 underlines a link in a reading area at rest;
 * - an FAQ row (`.v-faq summary`, §5.17) shows a "+" drawn in CSS, not a chevron icon;
 * - the Tutor demo's question chips (`.v-qchip`) are pills, and a case page's Previous and Next cards (`.v-linkcard`, a
 *   whole card that is a link) keep a card's 14 px corners, where ADR 0018 caps a control's corners at 12 px.
 * Only these, only inside `#main`, are let off, and only the look rules (signifier, flatness, F4's link and blue-word
 * rules). Everything else on those pages, the site chrome included, is judged. When the owner decides, either the site
 * follows ADR 0018 and its selector leaves this list, or the ADR makes room for the Signal spec here.
 */
const SIGNAL_SITE = new Set(["home", "home-signed-out", "about", "how-it-works", "examples", "case-amazon"]);
const SIGNAL_SPEC_LOOKS = ["#main .v-tlink", "#main .v-qrow", "#main .v-faq summary", "#main .v-qchip", "#main .v-linkcard"].join(", ");

test.describe("affordance audit is clean", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("[A3b] /sign-in", async ({ page }) => {
      await page.goto("/sign-in");
      await hydrated(page);
      await clean(page, "/sign-in");
    });

    for (const path of ["/", "/about", "/how-it-works", "/examples", "/examples/amazon-2000"]) {
      test(path === "/about" ? "[D1] /about passes the affordance audit, signed out" : `[A3b] ${path} (the Signal site)`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        await clean(page, path, { letOff: SIGNAL_SPEC_LOOKS });
      });
    }
  });

  test("[A3b] /welcome", async ({ page }) => {
    await visit(page, "fresh", "/welcome");
    await clean(page, "/welcome");
  });

  test("[A3b] /study on a Concept step", async ({ page }) => {
    await visit(page, "story", "/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await clean(page, "/study concept");
  });

  test("[A3b] /study with a Check open and a quiz", async ({ page }) => {
    await visit(page, "quiz-open", "/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await clean(page, "/study quiz");
  });

  test("[A3b] /study with a Widget and a chip", async ({ page }) => {
    await visit(page, "concept-widget", "/study");
    await expect(page.getByTestId("widget-pane")).toBeVisible();
    await clean(page, "/study widget");
  });

  for (const path of ["/course", "/notebook", "/settings"]) {
    test(`[A3b] ${path}`, async ({ page }) => {
      await visit(page, "many-topics", path);
      await clean(page, path);
    });
  }

  test("[A5] /settings with the account menu open", async ({ page }) => {
    await visit(page, "many-topics", "/settings");
    await page.getByTestId("account-menu-button").click();
    await expect(page.getByTestId("account-menu")).toBeVisible();
    await clean(page, "/settings account menu open");
  });

  // B3b: the Topic bar's ⋯ menu, its restart confirm, and Settings → Your Topics with a confirm open.
  test("[B3b] /study with the Topic options menu open, then its confirm", async ({ page }) => {
    await visit(page, "restart-topics", "/study");
    await page.getByTestId("topic-bar").getByRole("button", { name: "Topic options" }).click();
    await expect(page.getByRole("menuitem", { name: "Start this Topic over…" })).toBeVisible();
    await clean(page, "/study Topic options open");
    await page.getByRole("menuitem", { name: "Start this Topic over…" }).click();
    await expect(page.getByTestId("restart-confirm")).toBeVisible();
    await clean(page, "/study restart confirm");
  });

  test("[B3b] /settings Your Topics with a confirm open", async ({ page }) => {
    await visit(page, "restart-topics", "/settings");
    await expect(page.locator("#your-topics [data-your-topic]")).not.toHaveCount(0);
    await clean(page, "/settings Your Topics");
    await page.locator("#your-topics [data-your-topic]").first().getByRole("button", { name: "Start over" }).click();
    await expect(page.getByTestId("restart-confirm")).toBeVisible();
    await clean(page, "/settings Your Topics confirm");
  });
});

/**
 * Spec 2026-11-12 F4 (ADR 0018): what can be pressed stays obvious, over every page of the preview matrix. In a reading
 * area a link is the accent and underlined, and blue words that can be pressed are underlined or sit on a face; on a Band
 * a button is white with an ink label and a link is white and underlined; nothing that can be pressed is drawn like a key
 * number (the accent at 20px or more, 600 or heavier, never underlined). F1 rides along: no two Bands touch. Each page
 * is opened as the matrix opens it (its seed, or signed out).
 */
type F4Rule = "readingLinks" | "bandLinks" | "bandButtons" | "keyNumberLook" | "bareBlueWords" | "bandsTouching";
const F4_RULES: readonly F4Rule[] = ["readingLinks", "bandLinks", "bandButtons", "keyNumberLook", "bareBlueWords", "bandsTouching"];

/**
 * F4 findings on a page another part of the spec rebuilds, with who fixes them. The map may only shrink: a listed rule that
 * comes back clean fails until its row is removed, and every other rule on that page must be clean.
 */
const F4_KNOWN: Record<string, { rule: F4Rule; why: string }> = {};

/** Home signed out: the matrix shoots Home signed in, so the visitor's Home (its Join early access) is judged here. */
const HOME_SIGNED_OUT: MatrixPage = { id: "home-signed-out", path: "/", seed: null, kind: "reading", signedOut: true, public: true };

test.describe("[F4] what can be pressed stays obvious on every page of the preview matrix", () => {
  for (const cell of [...MATRIX_PAGES, SIGN_IN_WRONG, HOME_SIGNED_OUT]) {
    test(`[F4] ${cell.id} (${cell.path})`, async ({ page }) => {
      if (cell.signedOut) await page.context().clearCookies();
      else await seed(page, cell.seed!);
      await page.goto(cell.path);
      await hydrated(page);
      if (cell.kind === "study") {
        await expect(page.getByTestId("workspace-frame")).toBeVisible();
        await settled(page);
      }
      const look = await pressLook(page, SIGNAL_SITE.has(cell.id) ? { letOff: SIGNAL_SPEC_LOOKS } : {});
      const known = F4_KNOWN[cell.id];
      const found = Object.fromEntries(F4_RULES.filter((rule) => rule !== known?.rule).map((rule) => [rule, look[rule]]));
      expect(found, `${cell.path}: ${JSON.stringify(look)}`).toEqual(Object.fromEntries(Object.keys(found).map((rule) => [rule, []])));
      if (known) expect(look[known.rule].length, `${cell.id}: ${known.rule} is clean now, so remove its F4_KNOWN row (${known.why})`).toBeGreaterThan(0);
      expect(look.counts.pressable, `${cell.path} has controls to judge`).toBeGreaterThan(0);
      // Every page judged here but the Course Map, the Notebook, Settings and the Signal site's pages (whose sections are the
      // Signal spec's, with no royal-blue Band) stands on at least one Band (F1): the sign-in strip, and the Topic bar on
      // every /study cell. On the Signal pages a Band would still be judged by every Band rule above.
      if (!["course-map", "notebook", "settings"].includes(cell.id) && !SIGNAL_SITE.has(cell.id)) expect(look.counts.bands, `${cell.path} has a Band`).toBeGreaterThan(0);
    });
  }
});

/** A control's look in one moment: its colours and anything that would move or lift it. */
const lookOf = (el: Element) => {
  const s = getComputedStyle(el);
  return { background: s.backgroundColor, border: s.borderTopColor, transform: s.transform, translate: s.translate, scale: s.scale, shadow: s.boxShadow, top: el.getBoundingClientRect().top };
};
const STILL = { transform: "none", translate: "none", scale: "none", shadow: "none" };

// The primary fill at rest, on hover and on press (the --fill, --fill-hover and --fill-active tokens: the spec's blues),
// and --ink-2, in each theme's block of globals.css (Dark: ADR 0019, #80).
const PRESS = {
  light: { fill: ["rgb(31, 63, 174)", "rgb(26, 53, 150)", "rgb(21, 43, 122)"], ink2: "rgb(48, 53, 63)" },
  dark: { fill: ["rgb(138, 164, 255)", "rgb(159, 181, 255)", "rgb(179, 196, 255)"], ink2: "rgb(211, 215, 223)" },
} as const;

const pressColours = (project: string) => PRESS[project.endsWith("-dark") ? "dark" : "light"];

test("[ADR 0018] pressing is flat: a press changes colour, never position", async ({ page }, info) => {
  const { fill: FILL, ink2: INK_2 } = pressColours(info.project.name);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seed(page, "many-topics");
  await page.goto("/settings");
  await hydrated(page);
  const primary = page.locator('[data-affordance="button"].btn-primary:visible').first();
  await expect(primary).toBeVisible();
  const look = () => primary.evaluate(lookOf);

  const rest = await look();
  expect(rest).toMatchObject({ background: FILL[0], ...STILL });
  await primary.hover();
  await expect.poll(async () => (await look()).background).toBe(FILL[1]);
  expect(await look()).toMatchObject({ ...STILL, top: rest.top });
  await page.mouse.down();
  await expect.poll(async () => (await look()).background).toBe(FILL[2]);
  expect(await look()).toMatchObject({ ...STILL, top: rest.top });
  // Let go away from the button (no click), so the form is not sent.
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect.poll(async () => (await look()).background).toBe(FILL[0]);

  // Colour transitions only, and quick: the longest is the 140ms --dur-ui.
  const longest = await primary.evaluate((el) => Math.max(...getComputedStyle(el).transitionDuration.split(",").map((d) => parseFloat(d) * (d.trim().endsWith("ms") ? 0.001 : 1))));
  expect(longest).toBeLessThanOrEqual(0.14);
  expect(await primary.evaluate((el) => getComputedStyle(el).transitionProperty)).not.toMatch(/transform|translate|scale|all/);

  // A secondary's rim darkens to --ink-2 on hover, and it does not move either.
  const secondary = page.locator('[data-affordance="button"].btn-secondary:visible').first();
  await expect(secondary).toBeVisible();
  const secondaryRest = await secondary.evaluate(lookOf);
  await secondary.hover();
  await expect.poll(async () => (await secondary.evaluate(lookOf)).border).toBe(INK_2);
  expect(await secondary.evaluate(lookOf)).toMatchObject({ ...STILL, top: secondaryRest.top });
  await page.mouse.move(2, 2);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await primary.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s(, 0s)*$/);
});

// The same no-movement, no-shadow rule on the Study Workspace's own controls: a Choice and a quiz option.
for (const [state, selector] of [
  ["story", '[data-testid="choice"]'],
  ["quiz-open", 'label:has(input[type="radio"])'],
] as const) {
  test(`[ADR 0018] a press on /study (${state}) changes colour, never position`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await seed(page, state);
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await hydrated(page);
    if (state === "story") await replyLanded(page);
    const control = page.locator(selector).filter({ visible: true }).first();
    await expect(control).toBeVisible();
    const rest = await control.evaluate(lookOf);
    expect(rest, "at rest").toMatchObject(STILL);
    await control.hover();
    expect(await control.evaluate(lookOf), "on hover").toMatchObject({ ...STILL, top: rest.top });
    await page.mouse.down();
    await page.waitForTimeout(150);
    expect(await control.evaluate(lookOf), "while pressed").toMatchObject({ ...STILL, top: rest.top });
    await page.mouse.move(2, 2);
    await page.mouse.up();
  });
}

// Every control the keyboard reaches, Widgets included, shows the one ring: a solid 2px outline at a 2px offset.
for (const state of ["concept-widget", "quiz-open"] as const) {
  test(`[A4] Tab shows the 2px ring at a 2px offset on every control, Widgets included (/study ${state})`, async ({ page }) => {
    await seed(page, state);
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await hydrated(page);
    // Start the walk at the top of the page, whatever the page focused on load (an open quiz focuses its question).
    await page.evaluate(() => {
      const start = document.createElement("span");
      start.tabIndex = -1;
      start.dataset.walkStart = "";
      document.body.prepend(start);
      start.focus();
    });
    const reached = new Set<string>();
    const wrong: string[] = [];
    let widgetStops = 0;
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate((widgets) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const control = el.matches('input[type="radio"], input[type="checkbox"]') || (el.matches("[data-affordance]") && !el.matches("input, textarea, select"));
        if (!control) return { skip: true as const };
        const s = getComputedStyle(el);
        return { skip: false as const, inWidget: !!el.closest(widgets), kind: el.matches("input") ? "radio" : el.getAttribute("data-affordance"), name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset };
      }, WIDGET_CONTENT);
      if (!stop) break;
      if (stop.skip || !stop.kind) continue;
      if (stop.inWidget) widgetStops++;
      reached.add(stop.kind);
      if (stop.style !== "solid" || stop.width !== "2px" || stop.offset !== "2px") wrong.push(`${stop.kind} "${stop.name}": ${stop.style} ${stop.width} offset ${stop.offset}`);
    }
    expect(wrong).toEqual([]);
    // The Topic bar's finished steps are step segments, no longer chips; the chat's Widget chip is a chip.
    for (const kind of ["nav", "icon", "button", "step"]) expect([...reached], `Tab reaches a ${kind}`).toContain(kind);
    if (state === "concept-widget") {
      expect([...reached], "Tab reaches a chip").toContain("chip");
      expect(widgetStops, "Tab reaches a control inside the Widget and it is ringed").toBeGreaterThan(0);
    }
    if (state === "quiz-open") expect([...reached]).toContain("radio");
  });
}

const WIDGET_PRESS = [
  // A story scene has Next beat only in a narrow panel (spec 2026-11-12 B8): at 860 px every beat shows with no Next.
  { fixture: "story-scene", selector: '[data-testid="story-next"]', kind: "button", width: 480 },
  { fixture: "rate-move-practice", selector: '[data-testid="rate-move-choice"]', kind: "chip", width: 860 },
  { fixture: "rate-move", selector: '[aria-label="Increase New rate by one step"]', kind: "icon button", width: 860 },
] as const;

for (const { fixture, selector, kind, width } of WIDGET_PRESS) {
  test(`[A4] a press inside a Widget changes colour, never position (${fixture})`, async ({ page }, info) => {
    const INK_2 = pressColours(info.project.name).ink2;
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/dev/widgets?fixture=${fixture}&width=${width}`);
    await expect(page.getByTestId("widget-card")).toBeVisible();
    const control = page.locator(selector).first();
    await expect(control).toBeVisible();
    const rest = await control.evaluate(lookOf);
    expect(rest, "at rest").toMatchObject(STILL);
    expect(await control.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("8px");
    await control.hover();
    const hover = await control.evaluate(lookOf);
    expect(hover, "on hover").toMatchObject({ ...STILL, top: rest.top });
    // A button's and a chip's edge darkens to ink-2 on hover; the ghost icon button steps its face instead (spec A4 test 7).
    if (kind === "icon button") await expect.poll(async () => (await control.evaluate(lookOf)).background, "the icon button's face steps on hover").not.toBe(rest.background);
    else await expect.poll(async () => (await control.evaluate(lookOf)).border, `the ${kind}'s edge on hover`).toBe(INK_2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const pressed = await control.evaluate(lookOf);
    expect(pressed, "while pressed").toMatchObject({ ...STILL, top: rest.top });
    expect(pressed.background).not.toBe(rest.background);
    await page.mouse.up();
    const motion = await control.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(motion).not.toMatch(/transform|translate|scale|all/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.locator(selector).first()).toBeVisible();
    const durations = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(durations.split(",").every((d) => d.trim() === "0s")).toBe(true);
  });
}

/** Fixtures whose controls are still not flat, and the ticket that flattens them. The map may only shrink. */
const NOT_FLAT_YET: Record<string, string> = {};
const FIXTURES = ["audit", "parts"].flatMap((group) => readdirSync(`src/widgets/fixtures/${group}`).filter((f) => f.endsWith(".openui")).map((f) => f.replace(/\.openui$/, "")));

test("[A4] no Widget control lifts, moves or is rounder than 12px", async ({ page }) => {
  test.setTimeout(240_000);
  const stillRaised: string[] = [];
  const alreadyFlat: string[] = [];
  for (const fixture of FIXTURES) {
    await page.goto(`/dev/widgets?fixture=${fixture}&width=860`);
    await expect(page.getByTestId("widget-card")).toBeVisible();
    const notFlat = (await auditAffordances(page)).notFlat;
    if (fixture in NOT_FLAT_YET) {
      if (notFlat.length === 0) alreadyFlat.push(fixture);
    } else if (notFlat.length) stillRaised.push(`${fixture}: ${notFlat.join("; ")}`);
  }
  expect(stillRaised, "add a fixture to NOT_FLAT_YET only with the ticket that flattens it").toEqual([]);
  expect(alreadyFlat, "NOT_FLAT_YET may only shrink").toEqual([]);
});

test("[A4] the kit's callouts have no tinted face", async ({ page }) => {
  for (const fixture of ["05-pv-100-today-vs-later", "07-sip-1000-month"]) {
    await page.goto(`/dev/widgets?fixture=${fixture}&width=860`);
    const card = page.getByTestId("widget-card");
    await expect(card).toBeVisible();
    const tinted = await card.evaluate((root) => {
      // The callout's own title: the innermost element holding the words, not the card's wrapper that also contains them.
      const holders = [...root.querySelectorAll("*")].filter((el) => /Read the chart|This assumes a smooth return/.test(el.textContent || ""));
      const title = holders.find((el) => !holders.some((other) => other !== el && el.contains(other)));
      if (!title) return ["no callout title"];
      const cardBg = getComputedStyle(root).backgroundColor;
      const bad: string[] = [];
      for (let el: Element | null = title; el && el !== root; el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && bg !== cardBg) bad.push(`${el.tagName} ${bg}`);
      }
      return bad;
    });
    expect(tinted, fixture).toEqual([]);
  }
});

// With SHOTS=A4, the 1512×982 projects save the flat Widget controls on /study and on the Story scene.
test("[A4] screenshots: a flat Widget on /study and the Story scene", async ({ page }) => {
  test.skip(process.env.SHOTS !== "A4", "only with SHOTS=A4");
  const shots = join("docs", "specs", "img", "2026-11-11");
  mkdirSync(shots, { recursive: true });
  await seed(page, "concept-widget");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await hydrated(page);
  await expect(page.locator(WIDGET_CONTENT).first()).toBeVisible();
  await page.screenshot({ path: join(shots, `A4-study-widget-light.png`) });
  await page.goto(`/dev/widgets?fixture=story-scene&width=860`);
  await expect(page.getByTestId("widget-card")).toBeVisible();
  await page.screenshot({ path: join(shots, `A4-story-scene-light.png`) });
});
