import { expect, test, type Page } from "@playwright/test";
import { hydrated } from "./support/app";

// Market readings (spec #68, ticket #105), on the Widget harness, which draws the recipe's frozen fixture with the real
// renderer and needs no database or model call: every reading beside a Workbench's Levers shows its month and year, its
// credit and a working link to its public source, and none is called today's or current.

const ONE = "w1280";
const MONTH_YEAR = /^\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\)$/;

async function openFixture(page: Page, fixture: string) {
  await page.goto(`/dev/widgets?fixture=${fixture}`);
  await hydrated(page);
}

for (const [fixture, count] of [
  ["wacc-stack-readings", 1],
  ["value-levers-readings", 1],
] as const) {
  test(`[#105] ${fixture}: every Market reading shows its date, credit and a working link, and none is "today" or "current"`, async ({ page }, info) => {
    test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
    await openFixture(page, fixture);
    const panel = page.getByTestId("market-readings");
    await expect(panel).toBeVisible();
    const readings = panel.getByTestId("market-reading");
    await expect(readings).toHaveCount(count);
    for (const reading of await readings.all()) {
      await expect(reading.getByTestId("reading-date")).toHaveText(MONTH_YEAR);
      const credit = reading.getByTestId("reading-credit");
      await expect(credit).toHaveText(/\S{3,}/);
      const href = await credit.getAttribute("href");
      expect(href).toMatch(/^https:\/\/pages\.stern\.nyu\.edu\/~adamodar\//);
      // Opens in a new tab, away from the Workspace, and safely.
      await expect(credit).toHaveAttribute("target", "_blank");
      await expect(credit).toHaveAttribute("rel", "noreferrer");
    }
    await expect(panel).not.toContainText(/today|current/i);
  });
}
