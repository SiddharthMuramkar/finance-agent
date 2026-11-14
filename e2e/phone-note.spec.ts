import { expect, test, type Page } from "@playwright/test";
import { hydrated, quietDevtools, seed } from "./support/app";

/** The Study Workspace's note below 768 px, as the spec quotes it (2026-11-12, Part E Evidence). */
const PHONE_NOTE = "The Study Workspace needs a bigger screen. Open it on a laptop or an iPad.";

/**
 * The phone and the tablet (spec 2026-11-12 G9, E7): studying stays laptop and tablet only, so Home must say so before a
 * visitor joins, and a signed-in Learner on a phone gets a way to send the site to their laptop, never an email. Runs on
 * the p390 (390 x 844) and t768 (768 x 1024) projects only; what each case expects depends on which side of 768 px it is.
 */

test.beforeEach(async ({ page }, info) => {
  test.skip(!["p390", "t768"].includes(info.project.name), "the phone and tablet projects (G9)");
  await quietDevtools(page);
});

const isPhone = (page: Page) => page.viewportSize()!.width < 768;

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("[E7] the note under Home's button adds that studying needs a laptop or tablet, on a phone only", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const note = page.locator('[data-home-section="hero"] [data-join-note]');
    await expect(note).toContainText("Free during early access.");
    const phoneNote = note.getByText("Studying needs a laptop or tablet today.");
    if (isPhone(page)) await expect(phoneNote).toBeVisible();
    else await expect(phoneNote).toBeHidden();
    // The main button is Join early access at both sizes, and Home never scrolls sideways.
    await expect(page.locator('[data-home-section="hero"]').getByRole("link", { name: "Join early access" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("signed in", () => {
  test("[E7] on a phone the main button sends the site to the laptop through the share sheet; on a tablet it opens the Topic", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      const shared: ShareData[] = [];
      (window as unknown as { __shared: ShareData[] }).__shared = shared;
      Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => void shared.push(data) });
    });
    await seed(page, "story");
    await page.goto("/");
    await hydrated(page);
    const hero = page.locator('[data-home-section="hero"]');
    const send = hero.getByRole("button", { name: "Send this to my laptop" });
    if (!isPhone(page)) {
      await expect(send).toBeHidden();
      await expect(hero.locator('form[action="/api/open"] button')).toBeVisible();
      return;
    }
    await expect(hero.locator('form[action="/api/open"] button')).toBeHidden();
    await send.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared)).toEqual([{ title: "Value It", url: `${baseURL}/` }]);
    expect(page.url()).toBe(`${baseURL}/`);
  });

  test("[E7] with no share sheet, it copies the site's address and says so", async ({ page, baseURL }) => {
    test.skip(!isPhone(page), "a phone");
    await page.addInitScript(() => {
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void copied.push(text) } });
    });
    await seed(page, "story");
    await page.goto("/");
    await hydrated(page);
    await page.locator('[data-home-section="hero"]').getByRole("button", { name: "Send this to my laptop" }).click();
    await expect(page.locator('[data-home-section="hero"]').getByRole("status")).toHaveText("Link copied. Open it on your laptop or tablet.");
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([`${baseURL}/`]);
  });

  test("[G9] the Study Workspace shows its phone note below 768 px, and opens from 768 px", async ({ page }) => {
    await seed(page, "story");
    await page.goto("/study");
    if (isPhone(page)) {
      await expect(page.getByText(PHONE_NOTE)).toBeVisible();
      await expect(page.getByTestId("topic-bar")).toBeHidden();
    } else {
      await expect(page.getByTestId("topic-bar")).toBeVisible();
      await expect(page.getByText(PHONE_NOTE)).toBeHidden();
    }
  });
});
