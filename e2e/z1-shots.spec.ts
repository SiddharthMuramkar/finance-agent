import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hydrated, say, seed, settled } from "./support/app";

// Z1 (spec 2026-11-11): the finished app at 1280 × 800, 1512 × 982 and 1920 × 1080, in Light and Dark, for the critics
// and the owner. Written only with SHOTS=Z1 (spec line 512: CI and ordinary ui:test runs never write PNGs), and only from
// the mbp14 project, which sets each size itself.
const DIR = join("docs", "specs", "img", "2026-11-11");
const SIZES = [
  { name: "1280", width: 1280, height: 800 },
  { name: "1512", width: 1512, height: 982 },
  { name: "1920", width: 1920, height: 1080 },
] as const;
const THEMES = ["light", "dark"] as const;
const ORIGIN = "http://localhost:3100";

/** Skips unless SHOTS=Z1 on mbp14, and gives the run room: each test walks six sizes and themes. */
function z1Only() {
  test.skip(
    process.env.SHOTS !== "Z1" || test.info().project.name !== "mbp14",
    "only with SHOTS=Z1, from mbp14",
  );
  test.setTimeout(300_000);
}

async function shoot(page: Page, name: string, fullPage = false) {
  mkdirSync(DIR, { recursive: true });
  // Next's development overlay (its "Issues" badge) is not part of the app; a production build has none.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  await page.screenshot({ path: join(DIR, `${name}.png`), fullPage });
}

async function at(
  page: Page,
  size: (typeof SIZES)[number],
  theme: (typeof THEMES)[number],
  cookies: Record<string, string> = {},
) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page
    .context()
    .addCookies(
      Object.entries({ theme, ...cookies }).map(([name, value]) => ({
        name,
        value,
        url: ORIGIN,
      })),
    );
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Z1 Home and About, full page", async ({ page }) => {
    z1Only();
    for (const theme of THEMES)
      for (const size of SIZES) {
        await at(page, size, theme);
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await hydrated(page);
        await shoot(page, `Z1-home-${size.name}-${theme}`, true);
        await page.goto("/about");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await hydrated(page);
        await shoot(page, `Z1-about-${size.name}-${theme}`, true);
      }
  });
});

test("Z1 Study on concept-widget, at the default split and at 67", async ({
  page,
}) => {
  z1Only();
  await seed(page, "concept-widget");
  for (const theme of THEMES)
    for (const size of SIZES) {
      await page.context().clearCookies({ name: "split" });
      await at(page, size, theme);
      await page.goto("/study");
      await expect(page.getByTestId("workspace-frame")).toBeVisible();
      await settled(page);
      await hydrated(page);
      await shoot(page, `Z1-study-concept-${size.name}-${theme}`);
      await at(page, size, theme, { split: "67" });
      await page.goto("/study");
      await expect(page.getByTestId("workspace-frame")).toBeVisible();
      await settled(page);
      await hydrated(page);
      await shoot(page, `Z1-study-split-67-${size.name}-${theme}`);
    }
});

test("Z1 Study with four Widgets and the Check tab", async ({ page }) => {
  z1Only();
  await seed(page, "quiz-open");
  await page.goto("/study");
  await expect(page.getByTestId("check-tab")).toBeVisible();
  await settled(page);
  await say(page, "stage-reply-2", "Show me on a deposit rate.");
  await say(page, "stage-reply-3", "And when a rate falls?");
  await say(page, "stage-reply-4", "What about a really small move?");
  await expect(page.getByTestId("filmstrip-thumb")).toHaveCount(4);
  for (const theme of THEMES)
    for (const size of SIZES) {
      await page.context().clearCookies({ name: "split" });
      await at(page, size, theme);
      await page.goto("/study");
      await expect(page.getByTestId("check-tab")).toBeVisible();
      await expect(page.getByTestId("filmstrip-thumb")).toHaveCount(4);
      await settled(page);
      await hydrated(page);
      await shoot(page, `Z1-study-four-widgets-${size.name}-${theme}`);
    }
});

test("Z1 Notebook with a saved Widget", async ({ page }) => {
  z1Only();
  await seed(page, "concept-widget");
  await page.goto("/study");
  await settled(page);
  const save = page.getByTestId("widget-pane").getByTestId("save-to-notes");
  await save.getByRole("button").first().click();
  await expect(save).toHaveAttribute("data-save-state", "saved");
  for (const theme of THEMES)
    for (const size of SIZES) {
      await at(page, size, theme);
      await page.goto("/notebook");
      await expect(page.getByText(/^Widget · /).first()).toBeVisible();
      await hydrated(page);
      await shoot(page, `Z1-notebook-${size.name}-${theme}`, true);
    }
});
