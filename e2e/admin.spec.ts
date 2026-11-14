import { expect } from "@playwright/test";
import { signIn } from "./support/app";
import { NOOR, fixture, test } from "./support/people";

/**
 * The owner's Admin page (ADR 0014): anyone may sign in and then waits, and the owner lets them in, or keeps them out,
 * on /admin. The owner and Noor each get a browser of their own from the test bed's fixtures: `googleOwner` (a Google
 * account linked to the owner Learner) and `waitingUser` (Noor, signed in with nobody's invite and put back in Waiting
 * each time, so every project starts from the same place). Google and real mail are never used. Every test starts
 * signed out.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("the owner sees the waiting count, approves, and the person gets in", async ({ person }) => {
  const noor = await person({ waitingUser: true });
  await noor.page.goto("/study");
  await expect(noor.page.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();

  // The account menu's Admin row carries how many wait, Noor among them.
  const owner = await person({ googleOwner: true });
  const waiting = owner.body.waiting ?? 0;
  expect(waiting).toBeGreaterThan(0);
  await owner.page.goto("/settings");
  await owner.page.getByTestId("account-menu-button").click();
  const admin = owner.page.getByTestId("account-menu").getByRole("menuitem", { name: /^Admin/ });
  await expect(admin).toContainText(`${waiting} waiting`);
  await admin.click();
  await owner.page.waitForURL((url) => url.pathname === "/admin");
  await expect(owner.page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();

  await owner.page.locator("#waiting li").filter({ hasText: NOOR }).getByRole("button", { name: "Approve" }).click();
  await expect(owner.page.locator("#people").getByRole("status")).toContainText("Approved");
  await expect(owner.page.locator("#people li").filter({ hasText: NOOR })).toBeVisible();
  await expect(owner.page.locator("#waiting li").filter({ hasText: NOOR })).toHaveCount(0);

  // Noor checks again and is let in, as a Learner of her own: a new Learner, so /study sends her on to the Welcome.
  // Wait for that last stop, or the next goto races the /study -> /welcome redirect and is aborted.
  await noor.page.getByRole("link", { name: "Check again" }).click();
  await noor.page.waitForURL((url) => url.pathname === "/welcome");
  await noor.page.goto("/settings");
  await expect(noor.page.locator("#account")).toContainText(NOOR);
});

test("Remove access signs them out at once", async ({ person, tools }) => {
  // Noor, invited this time, so her next page lets her in.
  const noor = await person({ waitingUser: true });
  await fixture(tools, { invite: NOOR });
  await noor.page.goto("/settings");
  await expect(noor.page.locator("#account")).toContainText(NOOR);

  const owner = await person({ googleOwner: true });
  await owner.page.goto("/admin");
  const row = owner.page.locator("#people li").filter({ hasText: NOOR });
  await row.getByRole("button", { name: "Remove access" }).click();
  // It asks first, naming who.
  const confirm = row.getByRole("alertdialog");
  await expect(confirm).toContainText(NOOR);
  await confirm.getByRole("button", { name: "Yes, remove access" }).click();
  await expect(owner.page.locator("#denied li").filter({ hasText: NOOR })).toBeVisible();
  await expect(owner.page.locator("#people li").filter({ hasText: NOOR })).toHaveCount(0);

  // At once: her very next page finds no sign-in, and the login page offers to sign in again.
  await noor.page.goto("/settings");
  await noor.page.waitForURL((url) => url.pathname === "/login");
  await expect(noor.page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("a non-owner sees no Admin row and /admin is not found", async ({ person, page }) => {
  const asha = await person({ googleLearner: true });
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

test("the owner sees each person's Spend, their own row marked You, and nothing to press", async ({ person }) => {
  const owner = await person({ googleOwner: true });
  await owner.page.goto("/admin");
  const spend = owner.page.locator("#spend");
  await expect(spend.getByRole("heading", { name: "Spend", level: 2 })).toBeVisible();
  await expect(spend).toContainText("Tutor model calls only");
  await expect(spend.locator('[data-spend="total"]')).toContainText(/\$\d+\.\d{2} this month/);
  for (const name of ["Person", "Turns", "This month", "All time"]) await expect(spend.getByRole("columnheader", { name })).toBeVisible();
  await expect(spend.locator("tbody tr").filter({ hasText: "You" })).toHaveCount(1);
  await expect(spend.getByRole("button")).toHaveCount(0);
});
