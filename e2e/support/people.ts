import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { quietDevtools } from "./app";

/**
 * The test bed's sign-in people (ADR 0014), each built by POST /api/dev-e2e and signed in through a real Better Auth
 * session; Google and real mail are never used. That route serves only the tools Learner, so whoever calls it signs in
 * with the tools passcode first.
 */

/** Noor, the `waitingUser` fixture: signed in with nobody's invite, so she waits for the owner. Each call puts her back in Waiting. */
export const NOOR = "noor@e2e.example";

/** The fixtures that sign a browser in as a person: the owner, Noor (waiting), or Asha (an invited Google Learner). */
export type PersonFixture = { googleOwner: true } | { waitingUser: true } | { googleLearner: true };

/** What a person fixture answers: their email, their Learner when they have one, and how many people wait. */
export type PersonBody = { email: string; learnerId?: number; waiting?: number };

/** A person's own browser, signed in as them alone, and what the fixture answered. */
export type Person = { page: Page; context: BrowserContext; body: PersonBody };

/** Signs this request context (or page's browser) in as the tools Learner through the real login route. */
async function signInTools(request: APIRequestContext) {
  const login = await request.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  expect(login.status(), "POST /api/login").toBe(303);
}

/** POSTs one fixture to the test bed's route; a refusal fails the test with the route's own words. */
export async function fixture<T = Record<string, unknown>>(request: APIRequestContext, data: Record<string, unknown>): Promise<T> {
  const response = await request.post("/api/dev-e2e", { data });
  expect(response.status(), `POST /api/dev-e2e ${JSON.stringify(data)}: ${await response.text()}`).toBe(200);
  return (await response.json()) as T;
}

/**
 * Signs this page's browser in as the fixture's person, and only them: as tools first (the route's guard), then the
 * fixture, then the tools cookie goes. Left beside the person's session it would quietly sign the browser in as tools
 * once that session ends, as Remove access ends it.
 */
export async function becomePerson(page: Page, data: PersonFixture): Promise<PersonBody> {
  await signInTools(page.request);
  const body = await fixture<PersonBody>(page.request, data);
  await page.context().clearCookies({ name: "fa_access" });
  return body;
}

// Each fixture hands its value to the test through its second argument, named `provide` here: called `use`, the React
// hooks lint takes it for a hook.
export const test = base.extend<{ tools: APIRequestContext; person: (data: PersonFixture) => Promise<Person> }>({
  /** A request context signed in as the tools Learner, for the fixtures that sign nobody in ({invite}, {emailLinkFor}). It shares no cookie with any page. */
  tools: async ({ playwright }, provide) => {
    const tools = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    await signInTools(tools);
    await provide(tools);
    await tools.dispose();
  },
  /** Opens a browser of the person's own (beside the test's `page`), signed in as them; closed when the test ends. */
  person: async ({ browser }, provide) => {
    const opened: BrowserContext[] = [];
    await provide(async (data) => {
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      opened.push(context);
      const page = await context.newPage();
      await quietDevtools(page);
      return { page, context, body: await becomePerson(page, data) };
    });
    for (const context of opened) await context.close();
  },
});
