import { expect, test } from "@playwright/test";
import { quietDevtools } from "./support/app";

/**
 * Sign-in (spec 2026-11-05, C1b): the login page offers Google first and the passcode second, and a
 * Google-linked Learner (the test bed's `googleLearner` fixture, through Better Auth's test helpers)
 * reaches their own progress and signs out with one click. Google itself is never called. Every test
 * starts signed out (no saved tools cookie).
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

test("login page: Google first, passcode behind a link, invite errors in plain words", async ({ page }) => {
  await page.goto("/login");
  const google = page.getByRole("button", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute("data-affordance", "button");
  expect(await google.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
  await expect(page.getByRole("link", { name: "Use a passcode" })).toBeVisible();
  await expect(page.locator('input[name="passcode"]')).toHaveCount(0);

  await page.goto("/login?error=not_invited");
  await expect(page.getByText("You're not on the list yet")).toBeVisible();
  await expect(page.getByText("Ask the person who shared Value It with you to add your email.")).toBeVisible();

  await page.goto("/login?error=access_denied");
  await expect(page.getByText("Sign-in didn't work. Try again.")).toBeVisible();

  await page.goto("/login?passcode=1");
  await expect(page.locator('input[name="passcode"]')).toBeVisible();
});

test("login page: the passcode form still signs the tools Learner in", async ({ page }) => {
  await page.goto("/login?passcode=1");
  await page.locator('input[name="passcode"]').fill("e2e-passcode");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/course");
  await expect(page.getByRole("heading", { name: "Course Map" })).toBeVisible();
});

test("a Google-linked Learner reaches their progress and signs out with one click", async ({ page, context }) => {
  // The fixture route is guarded to the tools Learner: sign in as tools first, then ask for the fixture.
  const login = await page.request.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  expect(login.status()).toBe(303);
  const fixture = await page.request.post("/api/dev-e2e", { data: { googleLearner: true } });
  expect(fixture.status(), await fixture.text()).toBe(200);

  const before = await context.cookies();
  expect(before.find((c) => c.name === "better-auth.session_token")?.value).toBeTruthy();
  expect(before.find((c) => c.name === "fa_access")?.value).toBeTruthy();

  await page.goto("/study");
  await expect(page.getByTestId("topic-bar")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.locator('a[href="/login"]').first()).toBeVisible();
  const after = await context.cookies();
  expect(after.find((c) => c.name === "better-auth.session_token")?.value ?? "").toBe("");
  expect(after.find((c) => c.name === "fa_access")?.value ?? "").toBe("");
});
