import { expect } from "@playwright/test";
import { signIn } from "./support/app";
import { PEOPLE, test } from "./support/people";

/**
 * The owner's Admin page (issue #33): Spend, Tutor speed, and Who may come in, which only links to Clerk (its Waitlist
 * and Users pages), where people are let in or banned. Only an account whose Clerk session says admin opens it: here the
 * test bed's owner (`{person: "owner"}`, a signed cookie in place of a Clerk session). Asha, an account that is not the
 * admin, and the passcode, which is no account, both get the not-found page. Clerk itself is never called. Every test
 * starts signed out.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("the owner reaches Admin from the account menu: Spend, Tutor speed and Who may come in, nothing to press", async ({ person }) => {
  const owner = await person({ person: "owner" });
  await owner.page.goto("/settings");
  await owner.page.getByTestId("account-menu-button").click();
  const admin = owner.page.getByTestId("account-menu").getByRole("menuitem", { name: /^Admin/ });
  await expect(admin).toBeVisible();
  await admin.click();
  await owner.page.waitForURL((url) => url.pathname === "/admin");
  await expect(owner.page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();

  const spend = owner.page.locator("#spend");
  await expect(spend.getByRole("heading", { name: "Spend", level: 2 })).toBeVisible();
  await expect(spend).toContainText("Tutor model calls only");
  await expect(spend.locator('[data-spend="total"]')).toContainText(/\$\d+\.\d{2} this month/);
  for (const name of ["Person", "Turns", "This month", "All time"]) await expect(spend.getByRole("columnheader", { name })).toBeVisible();
  // The owner's own row reads You, under the email Clerk (here, the test bed's registry) has for them.
  const you = spend.locator("tbody tr").filter({ hasText: "You" });
  await expect(you).toHaveCount(1);
  await expect(you).toHaveAttribute("data-user", "user_e2e_owner");
  await expect(you).toContainText(PEOPLE.owner);

  await expect(owner.page.locator("#speed").getByRole("heading", { level: 2 })).toBeVisible();

  const people = owner.page.locator("#people");
  await expect(people.getByRole("heading", { name: "Who may come in", level: 2 })).toBeVisible();
  await expect(people.getByRole("link", { name: "Waitlist in Clerk" })).toHaveAttribute("href", /^https:\/\/dashboard\.clerk\.com\//);
  await expect(people.getByRole("link", { name: "Users in Clerk" })).toHaveAttribute("href", /^https:\/\/dashboard\.clerk\.com\//);
  // Read only: approving, denying and inviting are Clerk's now.
  await expect(owner.page.locator("main").getByRole("button")).toHaveCount(0);
});

test("an account that is not the admin sees no Admin row, and /admin is not found; nor is it for the passcode", async ({ person, page }) => {
  const asha = await person({ person: "asha" });
  await asha.page.goto("/settings");
  await asha.page.getByTestId("account-menu-button").click();
  const menu = asha.page.getByTestId("account-menu");
  await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Admin/ })).toHaveCount(0);
  expect((await asha.page.goto("/admin"))?.status()).toBe(404);

  // The passcode never opens it either: a shared secret is not the owner.
  await signIn(page);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});

test("signed out, /admin sends the visitor to the sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/admin");
});
