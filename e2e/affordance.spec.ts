import { expect, test, type Page } from "@playwright/test";
import { hydrated, quietDevtools, seed, type State } from "./support/app";
import { auditAffordances } from "./support/measure";

/**
 * A3b: every button looks like a button, every link like a link, every tag like a tag (spec 2026-11-05, ticket A3b,
 * Appendix C.3). Measured at 1512×982 only.
 */

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await quietDevtools(page);
});

async function clean(page: Page, where: string) {
  const audit = await auditAffordances(page);
  expect(
    {
      interactiveWithoutSignifier: audit.interactiveWithoutSignifier,
      pointerOnStatic: audit.pointerOnStatic,
      staticLooksPressable: audit.staticLooksPressable,
      tooSmall: audit.tooSmall,
    },
    `${where}: ${JSON.stringify(audit)}`,
  ).toEqual({ interactiveWithoutSignifier: [], pointerOnStatic: [], staticLooksPressable: [], tooSmall: [] });
  expect(audit.counts.interactive, `${where} has controls to audit`).toBeGreaterThan(0);
}

async function visit(page: Page, state: State, path: string) {
  await seed(page, state);
  await page.goto(path);
  await hydrated(page);
}

test.describe("affordance audit is clean", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    for (const path of ["/", "/login"]) {
      test(`[A3b] ${path}`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        await clean(page, path);
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

  for (const path of ["/course", "/progress", "/sessions", "/notes", "/settings"]) {
    test(`[A3b] ${path}`, async ({ page }) => {
      await visit(page, "many-topics", path);
      await clean(page, path);
    });
  }
});

test("[A3b] pressing feels physical", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seed(page, "many-topics");
  await page.goto("/settings");
  const primary = page.locator('[data-affordance="button"].btn-primary:visible').first();
  await expect(primary).toBeVisible();
  // Chrome writes the colour first ("rgb(…) 0px 3px 0px 0px"); the test cares about the offsets.
  const look = () => primary.evaluate((el) => ({ transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow.replace(/rgba?\([^)]*\)\s*/g, "") }));
  await primary.hover();
  await page.mouse.down();
  await expect.poll(async () => (await look()).transform).toBe("matrix(1, 0, 0, 1, 0, 2)");
  expect((await look()).shadow.startsWith("0px 1px 0px")).toBe(true);
  // Let go away from the button (no click), so hover does not lift it again.
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect.poll(async () => (await look()).shadow.startsWith("0px 3px 0px")).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await primary.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});
