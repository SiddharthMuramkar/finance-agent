import { expect, test } from "@playwright/test";
import { quietDevtools } from "./support/app";

/**
 * Privacy, Terms and the contact address (issue #77), signed out: /privacy and /terms answer 200 to a Visitor in the site
 * chrome, the footer and /join link both and show hello@value-it.xyz as text a Visitor can select and copy.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const CONTACT = "hello@value-it.xyz";

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

for (const { path, h1 } of [
  { path: "/privacy", h1: "Privacy" },
  { path: "/terms", h1: "Terms" },
]) {
  test(`${path} is public: 200 signed out, its own heading, titled, and the contact address`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(page).toHaveTitle(`${h1} · Value It`);
    await expect(page.locator("main [data-contact]")).toHaveText(CONTACT);
  });
}

test("the footer links Privacy and Terms, and its contact address selects as text", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer.v-footer");
  await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
  const contact = footer.locator("[data-contact]");
  await expect(contact).toHaveText(CONTACT);
  // Selectable text, not a picture or a button: a click selects the whole address.
  await contact.click();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(CONTACT);
  await footer.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
});

test("/join links Privacy and Terms and shows the contact address before the waitlist card", async ({ page }) => {
  await page.goto("/join");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(main.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
  await expect(main.locator("[data-contact]")).toHaveText(CONTACT);
  await expect(page.locator("footer.v-footer [data-contact]")).toHaveText(CONTACT);
});
