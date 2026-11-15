import { expect } from "@playwright/test";
import { hydrated, quietDevtools } from "./support/app";
import { becomePerson, fixture, test } from "./support/people";

/**
 * Sign-in (spec 2026-11-05, C1b; ADR 0014): the login page offers Google first, an email link second and the passcode
 * behind a link. A Google-linked Learner (the test bed's `googleLearner` fixture, through Better Auth's test helpers)
 * reaches their own progress, sees their Google email in Settings and the account menu, and signs out from that menu
 * (A5). An invited person signs in with an email link the test bed keeps instead of mailing; someone nobody invited sees
 * Waiting for approval. Google itself is never called, nor is any mail sent. Every test starts signed out (no saved
 * tools cookie).
 */
test.use({ storageState: { cookies: [], origins: [] } });

// A dark project is a Learner who chose Dark, signed out too: the theme cookie stays when the sign-in goes.
/** Spec 2026-11-12 G9: on the phone project every signed-in page shows only the phone note, so cases that go on there skip. */
const onPhone = (name: string) => name.startsWith("p390");
const PHONE_SKIP = "a signed-in page shows only the phone note below 768 px (e2e/phone-note.spec.ts)";

test.beforeEach(async ({ page, baseURL }, info) => {
  await quietDevtools(page);
  if (info.project.name.endsWith("-dark")) await page.context().addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
});

test("the login page opens in the saved theme, and Light with none", async ({ page }, info) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", info.project.name.endsWith("-dark") ? "dark" : "light");
});

test("login page: Google first, an email link second, passcode behind a link, errors in plain words", async ({ page }) => {
  await page.goto("/login");
  const google = page.getByRole("button", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute("data-affordance", "button");
  // ADR 0018: flat, so no lip or drop shadow; it is signified by a 1px edge or a fill instead.
  const look = await google.evaluate((el) => {
    const s = getComputedStyle(el);
    return { shadow: s.boxShadow, edge: parseFloat(s.borderTopWidth), fill: s.backgroundColor, height: el.getBoundingClientRect().height, dark: document.documentElement.classList.contains("dark") };
  });
  expect(look.shadow).toBe("none");
  expect(look.edge >= 1 || look.fill !== "rgba(0, 0, 0, 0)").toBe(true);
  // The page's one primary, at the large size: 44px, filled with --fill (royal blue in Light, near-white in Dark).
  expect(look.height).toBeGreaterThanOrEqual(44);
  expect(look.fill).toBe(look.dark ? "rgb(245, 245, 247)" : "rgb(31, 63, 174)");
  // The email link comes after Google, as a secondary: never the page's primary fill.
  const email = page.getByRole("button", { name: "Email me a sign-in link" });
  await expect(email).toBeVisible();
  await expect(email).toHaveAttribute("data-affordance", "button");
  expect(await email.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(look.fill);
  expect((await email.boundingBox())!.y).toBeGreaterThan((await google.boundingBox())!.y);
  await expect(page.getByRole("link", { name: "Use a passcode" })).toBeVisible();
  await expect(page.locator('input[name="passcode"]')).toHaveCount(0);

  await page.goto("/login?error=INVALID_TOKEN");
  await expect(page.getByRole("heading", { name: "That sign-in link has expired" })).toBeVisible();

  // Anyone may sign in now and wait for the owner (ADR 0014), so not_invited is never sent: an old link gets the plain words.
  await page.goto("/login?error=not_invited");
  await expect(page.getByText("Sign-in didn't work. Try again.")).toBeVisible();
  await expect(page.getByText("You're not on the list yet")).toHaveCount(0);

  await page.goto("/login?error=access_denied");
  await expect(page.getByText("Sign-in didn't work. Try again.")).toBeVisible();

  await page.goto("/login?passcode=1");
  await expect(page.locator('input[name="passcode"]')).toBeVisible();
});

// Spec 2026-11-12 G1 and F1: the sign-in page has the public header (Sign in marked as the page showing, no second
// primary) and a Band across the top that holds its heading.
test("[G1, F1] the login page has the public header and its heading on a Band", async ({ page }) => {
  await page.goto("/login");
  const header = page.locator("header.home-header");
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("aria-current", "page");
  // Below 760 px the header's page links hide (G9's phone); About is in the footer there.
  const about = page.viewportSize()!.width < 760 ? page.locator("footer") : header;
  await expect(about.getByRole("link", { name: "About", exact: true })).toBeVisible();
  await expect(header.getByText("Join early access")).toHaveCount(0);
  const strip = page.locator('[data-band="sign-in-strip"]');
  await expect(strip.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  const look = await strip.evaluate((band) => ({ face: getComputedStyle(band).backgroundColor, ink: getComputedStyle(band.querySelector("h1")!).color }));
  expect(look).toEqual({ face: "rgb(31, 63, 174)", ink: "rgb(255, 255, 255)" });
});

test("login page: the passcode form still signs the tools Learner in", async ({ page }, info) => {
  test.skip(onPhone(info.project.name), PHONE_SKIP);
  await page.goto("/login?passcode=1");
  await page.locator('input[name="passcode"]').fill("e2e-passcode");
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  // The landing may still be redirecting (/study can send a Learner on to /welcome), which aborts a goto: retry it.
  await expect(async () => {
    await page.goto("/course");
    await expect(page.getByRole("heading", { name: "Course Map" })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
});

test("a Google-linked Learner reaches their progress and signs out with one click", async ({ page, context }, info) => {
  test.skip(onPhone(info.project.name), PHONE_SKIP);
  // The fixture route is guarded to the tools Learner: sign in as tools first, then ask for the fixture.
  const login = await page.request.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  expect(login.status()).toBe(303);
  const fixture = await page.request.post("/api/dev-e2e", { data: { googleLearner: true } });
  expect(fixture.status(), await fixture.text()).toBe(200);

  const before = await context.cookies();
  expect(before.find((c) => c.name === "better-auth.session_token")?.value).toBeTruthy();
  expect(before.find((c) => c.name === "fa_access")?.value).toBeTruthy();

  // Settings' Account card shows the Google email, not "Signed in with a passcode" (A5).
  await page.goto("/settings");
  const accountCard = page.locator("#account");
  await expect(accountCard).toContainText("asha@e2e.example");
  await expect(accountCard).not.toContainText("Signed in with a passcode");

  await page.goto("/study");
  await expect(page.getByTestId("topic-bar")).toBeVisible();

  // Sign out lives in the header's account menu (A5), which also shows the Google email.
  await page.getByTestId("account-menu-button").click();
  const menu = page.getByTestId("account-menu");
  await expect(menu).toContainText("asha@e2e.example");
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.locator('a[href="/login"]').first()).toBeVisible();
  const after = await context.cookies();
  expect(after.find((c) => c.name === "better-auth.session_token")?.value ?? "").toBe("");
  expect(after.find((c) => c.name === "fa_access")?.value ?? "").toBe("");
});

test("an email link signs an invited person in without sending mail; opening it again says it expired", async ({ page, context, tools }, info) => {
  test.skip(onPhone(info.project.name), PHONE_SKIP);
  // An address of this run's own: one address gets 3 links an hour, and every project shares the test bed's database.
  const email = `mia.${Date.now()}@e2e.example`;
  await fixture(tools, { invite: email });

  await page.goto("/login");
  // The form sends with a script; before hydration a press would submit the page's own GET instead.
  await hydrated(page);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // The test bed kept the email's link instead of sending it: the landing page, not Better Auth's verify URL.
  const { link } = await fixture<{ link: string }>(tools, { emailLinkFor: email });
  expect(new URL(link).pathname).toBe("/login");

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Finish signing in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // A new Learner: /study sends them on to the Welcome. Wait for that last stop, or the goto below races the redirect.
  await page.waitForURL((url) => url.pathname === "/welcome");
  await page.goto("/settings");
  await expect(page.locator("#account")).toContainText(email);

  // A link works once: opened again, signed out, it has expired.
  await context.clearCookies({ name: "better-auth.session_token" });
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Finish signing in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("error") === "INVALID_TOKEN");
  await expect(page.getByRole("heading", { name: "That sign-in link has expired" })).toBeVisible();
});

test("a waiting person sees Waiting and can sign out", async ({ page, context }) => {
  // Noor signed in with nobody's invite (ADR 0014): she counts as signed out everywhere but the login page.
  await becomePerson(page, { waitingUser: true });
  await page.goto("/study");
  await page.waitForURL((url) => url.pathname === "/login");
  await expect(page.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Check again" })).toBeVisible();
  // G1: she is signed in, so the public header never offers Sign in or Join early access; her status screen has Sign out.
  await expect(page.locator('[data-band="sign-in-strip"]').getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  await expect(page.locator("header.home-header").getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(page.locator("header.home-header").getByText("Join early access")).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  const after = await context.cookies();
  expect(after.find((c) => c.name === "better-auth.session_token")?.value ?? "").toBe("");
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Waiting for approval" })).toHaveCount(0);
});
