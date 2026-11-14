import { betterAuth } from "better-auth";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { authOptions } from "./better-auth";

/**
 * Email-link sign-in through Better Auth's real handler on PGlite (ADR 0014). Resend is never called:
 * `fetch` is stubbed and each email's text is read for its landing link, as the person would click it.
 */
const ENV = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a-test-secret-of-at-least-32-characters!",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Value It <sign-in@localhost>",
};

type Mail = { to: string[]; text: string };
/** Any Better Auth instance: only its handler is used. */
type Handler = { handler: (request: Request) => Promise<Response> };

/** Better Auth over this database, with every Resend call caught; `rateLimited` turns the limiter on as production has it. */
function emailAuth(db: Db, { rateLimited = false } = {}) {
  const sent: Mail[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url !== "https://api.resend.com/emails") throw new Error(`unexpected fetch ${url}`);
      sent.push(JSON.parse(String(init.body)) as Mail);
      return Response.json({ id: `email-${sent.length}` });
    }),
  );
  const options = authOptions(db, ENV);
  const auth = betterAuth({ ...options, rateLimit: { ...options.rateLimit, enabled: rateLimited } });
  return { auth, sent };
}

/** Asks for a link, as the login page's form does. */
function ask(auth: Handler, body: Record<string, string>, ip = "203.0.113.7") {
  return auth.handler(
    new Request(`${ENV.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ENV.BETTER_AUTH_URL, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

/** The landing link in an email, then the verify request the landing page's "Sign in" button makes. */
function open(auth: Handler, mail: Mail) {
  const landing = new URL(/https?:\/\/\S+\/login\?\S+/.exec(mail.text)![0]);
  const verify = new URL(`${ENV.BETTER_AUTH_URL}/api/auth/magic-link/verify`);
  verify.searchParams.set("token", landing.searchParams.get("link")!);
  verify.searchParams.set("callbackURL", landing.searchParams.get("next")!);
  verify.searchParams.set("errorCallbackURL", "/login");
  return auth.handler(new Request(verify));
}

const where = (res: Response) => {
  const to = new URL(res.headers.get("location")!, ENV.BETTER_AUTH_URL);
  return to.pathname + to.search;
};
const signedIn = (res: Response) => res.headers.getSetCookie().some((c) => c.includes("session_token=") && !c.includes("session_token=;"));

async function rows<T>(db: Db, query: string): Promise<T[]> {
  return ((await db.execute(sql.raw(query))) as unknown as { rows: T[] }).rows;
}

/** One Google sign-in through the real handler; Google is never called (as in better-auth.test.ts). */
async function signInWithGoogle(db: Db, email: string) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "at", token_type: "Bearer", expires_in: 3600, scope: "openid email profile" })));
  const options = authOptions(db, ENV);
  const auth = betterAuth({
    ...options,
    socialProviders: {
      google: { ...options.socialProviders.google!, getUserInfo: async () => ({ user: { name: "Asha G", email, emailVerified: true }, data: { sub: "g-123" } as never }) },
    },
  });
  const start = await auth.handler(
    new Request(`${ENV.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ENV.BETTER_AUTH_URL },
      body: JSON.stringify({ provider: "google", callbackURL: "/study" }),
    }),
  );
  const { url } = (await start.json()) as { url: string };
  const cookie = start.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return auth.handler(new Request(`${ENV.BETTER_AUTH_URL}/api/auth/callback/google?code=c&state=${new URL(url).searchParams.get("state")}`, { headers: { cookie } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("email-link sign-in, through the real handler", () => {
  it("asking writes no user; opening the link makes one, verified, named from the address, not from the request", async () => {
    const db = await testDb();
    const { auth, sent } = emailAuth(db);
    const asked = await ask(auth, { email: "Asha.Kumar+x@iCloud.com", name: "owner", callbackURL: "/course" });
    expect(asked.status).toBe(200);
    expect(await rows(db, `select id from "user"`)).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["asha.kumar+x@icloud.com"]);
    // The token is stored hashed: the stored identifier never holds the token the email carries.
    const token = new URL(/https?:\/\/\S+\/login\?\S+/.exec(sent[0].text)![0]).searchParams.get("link")!;
    const [stored] = await rows<{ identifier: string }>(db, `select identifier from "verification"`);
    expect(stored.identifier.startsWith("magic-link:")).toBe(true);
    expect(stored.identifier).not.toContain(token);

    const opened = await open(auth, sent[0]);
    expect(opened.status).toBe(302);
    expect(where(opened)).toBe("/course");
    expect(signedIn(opened)).toBe(true);
    expect(await rows(db, `select email, name, email_verified from "user"`)).toEqual([{ email: "asha.kumar+x@icloud.com", name: "Asha Kumar", email_verified: true }]);
    expect(await rows(db, `select id from "account"`)).toEqual([]);
  });

  it("a used or expired link sends the person to /login?error=INVALID_TOKEN", async () => {
    const db = await testDb();
    const { auth, sent } = emailAuth(db);
    await ask(auth, { email: "noor@x.com", callbackURL: "/study" });
    expect(signedIn(await open(auth, sent[0]))).toBe(true);
    const reused = await open(auth, sent[0]);
    expect(where(reused)).toBe("/login?error=INVALID_TOKEN");
    expect(signedIn(reused)).toBe(false);

    vi.useFakeTimers({ toFake: ["Date"] });
    await ask(auth, { email: "noor@x.com", callbackURL: "/study" });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    expect(where(await open(auth, sent[1]))).toBe("/login?error=INVALID_TOKEN");
  });

  it("email then Google, and Google then email, is one user", async () => {
    const db = await testDb();
    const first = emailAuth(db);
    await ask(first.auth, { email: "asha@x.com", callbackURL: "/study" });
    await open(first.auth, first.sent[0]);
    expect(where(await signInWithGoogle(db, "asha@x.com"))).toBe("/study");
    expect(await rows(db, `select email from "user"`)).toEqual([{ email: "asha@x.com" }]);
    expect(await rows(db, `select provider_id from "account"`)).toEqual([{ provider_id: "google" }]);

    await signInWithGoogle(db, "noor@x.com");
    const second = emailAuth(db);
    await ask(second.auth, { email: "noor@x.com", callbackURL: "/study" });
    const opened = await open(second.auth, second.sent[0]);
    expect(signedIn(opened)).toBe(true);
    expect(await rows(db, `select email from "user" order by email`)).toEqual([{ email: "asha@x.com" }, { email: "noor@x.com" }]);
  });

  it("the fourth link to one address in an hour is refused with email_link_throttled, and nothing is sent", async () => {
    const db = await testDb();
    const { auth, sent } = emailAuth(db);
    for (let i = 0; i < 3; i++) expect((await ask(auth, { email: "asha@x.com", callbackURL: "/study" })).status).toBe(200);
    const refused = await ask(auth, { email: "asha@x.com", callbackURL: "/study" });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "email_link_throttled" });
    expect(sent).toHaveLength(3);
  });

  it("a Resend failure answers email_not_sent and writes no user", async () => {
    const db = await testDb();
    const options = authOptions(db, ENV);
    const auth = betterAuth(options);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await ask(auth, { email: "asha@x.com", callbackURL: "/study" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "email_not_sent" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("asha@x.com");
    expect(await rows(db, `select id from "user"`)).toEqual([]);
    error.mockRestore();
  });

  it("the 11th link request from one address in 15 minutes gets 429, across two instances sharing the database", async () => {
    const db = await testDb();
    const one = emailAuth(db, { rateLimited: true });
    const two = betterAuth({ ...authOptions(db, ENV), rateLimit: { ...authOptions(db, ENV).rateLimit, enabled: true } });
    for (let i = 0; i < 10; i++) {
      const res = await ask(i % 2 ? two : one.auth, { email: `person${i}@x.com`, callbackURL: "/study" });
      expect(res.status, `request ${i + 1}`).toBe(200);
    }
    expect((await ask(two, { email: "person10@x.com", callbackURL: "/study" })).status).toBe(429);
    expect((await ask(one.auth, { email: "person11@x.com", callbackURL: "/study" })).status).toBe(429);
    // Another address is not held back by this one.
    expect((await ask(one.auth, { email: "person12@x.com", callbackURL: "/study" }, "198.51.100.9")).status).toBe(200);
    expect((await rows<{ key: string }>(db, `select key from "rate_limit"`)).map((r) => r.key)).toContain("203.0.113.7|/sign-in/magic-link");
  });
});
