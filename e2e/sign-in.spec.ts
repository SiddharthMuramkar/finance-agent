import { expect } from "@playwright/test";
import { quietDevtools } from "./support/app";
import { PEOPLE, becomePerson, test } from "./support/people";

/**
 * Sign-in (issue #33): Clerk signs real people in, and is off in the test bed, so /sign-in shows the passcode door here
 * (the test tools' way in; production refuses it). A Clerk person is the test bed's stand-in (`{person}`, a signed
 * cookie in place of a Clerk session): they reach their own Learner, see their email in Settings and the account menu,
 * and sign out from that menu (A5). The old /login sends everyone on to /sign-in. Clerk itself is never called. Every
 * test starts signed out (no saved tools cookie).
 */
test.use({ storageState: { cookies: [], origins: [] } });

// A dark project is a Learner who chose Dark (ADR 0013), signed out too: the theme cookie stays when the sign-in goes.
/** Spec 2026-11-12 G9: on the phone project every signed-in page shows only the phone note, so cases that go on there skip. */
const onPhone = (name: string) => name.startsWith("p390");
const PHONE_SKIP = "a signed-in page shows only the phone note below 768 px (e2e/phone-note.spec.ts)";

test.beforeEach(async ({ page, baseURL }, info) => {
  await quietDevtools(page);
  if (info.project.name.endsWith("-dark")) await page.context().addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
});

test("the sign-in page opens in the saved theme, and Light with none", async ({ page }, info) => {
  await page.goto("/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", info.project.name.endsWith("-dark") ? "dark" : "light");
});

test("the old /login sends the visitor on to /sign-in, keeping where they were going", async ({ page }) => {
  const moved = await page.request.get("/login?next=%2Fcourse", { maxRedirects: 0 });
  expect(moved.status()).toBe(308);
  const to = new URL(moved.headers().location, "http://localhost");
  expect(to.pathname).toBe("/sign-in");
  expect(to.searchParams.get("next")).toBe("/course");
  await page.goto("/login");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
});

test("while Clerk is off, the sign-in page is the passcode door, with wrong passcodes in plain words", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator('[data-band="sign-in-strip"]').getByRole("heading", { level: 1, name: "Enter your passcode" })).toBeVisible();
  const enter = page.getByRole("button", { name: "Enter" });
  await expect(enter).toBeVisible();
  // ADR 0013: flat, so no lip or drop shadow; the page's one primary, at the large size, filled with --fill.
  const look = await enter.evaluate((el) => {
    const s = getComputedStyle(el);
    return { shadow: s.boxShadow, fill: s.backgroundColor, height: el.getBoundingClientRect().height, dark: document.documentElement.classList.contains("dark") };
  });
  expect(look.shadow).toBe("none");
  expect(look.height).toBeGreaterThanOrEqual(44);
  expect(look.fill).toBe(look.dark ? "rgb(245, 245, 247)" : "rgb(31, 63, 174)");
  // No Clerk card while Clerk is off: nothing loads or calls it.
  await expect(page.locator(".cl-rootBox")).toHaveCount(0);

  // The form's own alert: Next.js keeps a route announcer (also role=alert) beside it after a navigation.
  await page.goto("/sign-in?wrong=1");
  await expect(page.locator("form").getByRole("alert")).toHaveText("That passcode didn't work. Check it and try again.");
  await page.goto("/sign-in?locked=1");
  await expect(page.locator("form").getByRole("alert")).toContainText("Too many wrong passcodes");
});

// Spec 2026-11-12 G1 and F1: the sign-in page has the public header (Sign in marked as the page showing, no second
// primary) and a Band across the top that holds its heading.
test("[G1, F1] the sign-in page has the public header and its heading on a Band", async ({ page }) => {
  await page.goto("/sign-in");
  const header = page.locator("header.home-header");
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("aria-current", "page");
  // Below 760 px the header's page links hide (G9's phone); About is in the footer there.
  const about = page.viewportSize()!.width < 760 ? page.locator("footer") : header;
  await expect(about.getByRole("link", { name: "About", exact: true })).toBeVisible();
  await expect(header.getByText("Join early access")).toHaveCount(0);
  const strip = page.locator('[data-band="sign-in-strip"]');
  await expect(strip.getByRole("heading", { level: 1 })).toBeVisible();
  const look = await strip.evaluate((band) => ({ face: getComputedStyle(band).backgroundColor, ink: getComputedStyle(band.querySelector("h1")!).color }));
  expect(look).toEqual({ face: "rgb(31, 63, 174)", ink: "rgb(255, 255, 255)" });
});

// No wrong passcode is typed here: every project shares one server and one address, and five wrong ones pause the door
// for everyone for 15 minutes (src/auth/login-guard.test.ts covers the wrong passcode and the pause).
test("the passcode form signs the tools Learner in", async ({ page }, info) => {
  test.skip(onPhone(info.project.name), PHONE_SKIP);
  await page.goto("/sign-in");
  await page.locator('input[name="passcode"]').fill("e2e-passcode");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL((url) => url.pathname !== "/sign-in");
  // The landing may still be redirecting (/study can send a Learner on to /welcome), which aborts a goto: retry it.
  await expect(async () => {
    await page.goto("/course");
    await expect(page.getByRole("heading", { name: "Course Map" })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
});

test("while Clerk is off, /join and /sign-up send the visitor to /sign-in", async ({ page }) => {
  for (const path of ["/join", "/sign-up"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL((url) => url.pathname === "/sign-in");
  }
});

test("a signed-in person skips the sign-in page and lands where they were going", async ({ page }, info) => {
  test.skip(onPhone(info.project.name), PHONE_SKIP);
  await becomePerson(page, { person: "asha" });
  await page.goto("/sign-in?next=%2Fcourse");
  await expect(page).toHaveURL((url) => url.pathname === "/course");
  await expect(page.getByRole("heading", { name: "Course Map" })).toBeVisible();
});

test("an account's Learner shows their email, and signs out with one click", async ({ page, context }, info) => {
  test.skip(onPhone(info.project.name), PHONE_SKIP);
  // Four pages, the first of them (Settings, Home after the sign-out) compiled cold by the dev server on a first run.
  test.slow();
  const asha = await becomePerson(page, { person: "asha" });
  expect(asha.email).toBe(PEOPLE.asha);
  const before = await context.cookies();
  expect(before.find((c) => c.name === "fa_e2e_person")?.value).toBeTruthy();
  expect(before.find((c) => c.name === "fa_access")).toBeUndefined();

  // Settings' Account card shows the account's email, not "Signed in with a passcode" (A5).
  await page.goto("/settings");
  const accountCard = page.locator("#account");
  await expect(accountCard).toContainText(PEOPLE.asha);
  await expect(accountCard).not.toContainText("Signed in with a passcode");

  // Sign out lives in the header's account menu (A5), which also shows the email; Asha is not the admin.
  await page.getByTestId("account-menu-button").click();
  const menu = page.getByTestId("account-menu");
  await expect(menu).toContainText(PEOPLE.asha);
  await expect(menu.getByRole("menuitem", { name: /^Admin/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.locator('a[href="/sign-in"]').first()).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === "fa_e2e_person")?.value ?? "").toBe("");

  // Signed out at once: a signed-in page sends her to the sign-in, remembering where she was going.
  await page.goto("/settings");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/settings");
});

test("the passcode Learner's Settings say so", async ({ page }, info) => {
  test.skip(onPhone(info.project.name), PHONE_SKIP);
  const login = await page.request.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  expect(login.status()).toBe(303);
  await page.goto("/settings");
  await expect(page.locator("#account")).toContainText("Signed in with a passcode");
});
