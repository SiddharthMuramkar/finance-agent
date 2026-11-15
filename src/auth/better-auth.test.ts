import { betterAuth } from "better-auth";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { accessFor } from "./access";
import { authOptions, betterAuthOn, googleSignInOn } from "./better-auth";
import { addInvite, setSignupOpen } from "./invites";

const ENV = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a-test-secret-of-at-least-32-characters!",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
};

const now = new Date();
const googleUser = (email: string, emailVerified = true) => ({ id: "ignored", name: "Asha", email, emailVerified, createdAt: now, updatedAt: now });

function gate(db: Db) {
  const before = authOptions(db, ENV).databaseHooks?.user?.create?.before;
  if (!before) throw new Error("no new-user gate");
  return (u: ReturnType<typeof googleUser>) => before(u, null);
}

async function count(db: Db, table: "user" | "account" | "learners" | "session") {
  const { rows } = (await db.execute(sql.raw(`select count(*)::int as n from "${table}"`))) as unknown as { rows: { n: number }[] };
  return rows[0].n;
}

/**
 * One Google sign-in through Better Auth's real handler on PGlite. Google is never called: the token
 * endpoint is stubbed and the profile comes from the provider's own getUserInfo option.
 */
async function signInWithGoogle(db: Db, profile: { email: string; emailVerified: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "at", token_type: "Bearer", expires_in: 3600, scope: "openid email profile" })),
  );
  const options = authOptions(db, ENV);
  const google = options.socialProviders!.google!;
  const auth = betterAuth({
    ...options,
    socialProviders: {
      google: {
        ...google,
        // The provider's account subject is the profile's `sub`, as in a real Google id token.
        getUserInfo: async () => ({ user: { name: "Asha", ...profile }, data: { sub: "g-123" } as never }),
      },
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
  const state = new URL(url).searchParams.get("state")!;
  const cookie = start.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return auth.handler(new Request(`${ENV.BETTER_AUTH_URL}/api/auth/callback/google?code=c&state=${state}`, { headers: { cookie } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the new-user gate (databaseHooks.user.create.before)", () => {
  it("refuses an unverified email and lets any verified one through unchanged", async () => {
    const db = await testDb();
    await setSignupOpen(db, false);
    await expect(gate(db)(googleUser("a@x.com", false))).rejects.toThrow("email_not_verified");
    await expect(gate(db)(googleUser("stranger@x.com"))).resolves.toEqual({ data: googleUser("stranger@x.com") });
  });

  it("an uninvited verified sign-up is kept as a user with no Learner: they wait", async () => {
    const db = await testDb();
    await setSignupOpen(db, false);
    const learnersBefore = await count(db, "learners");
    const res = await signInWithGoogle(db, { email: "stranger@x.com", emailVerified: true });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!, ENV.BETTER_AUTH_URL).pathname).toBe("/study");
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(1);
    expect(await count(db, "learners")).toBe(learnersBefore);
    const { rows } = (await db.execute(sql.raw(`select id, email, name from "user"`))) as unknown as { rows: { id: string; email: string; name: string }[] };
    expect(await accessFor(db, rows[0])).toEqual({ state: "waiting" });
  });

  it("an invited Google account is let in through the real handler", async () => {
    const db = await testDb();
    await addInvite(db, "A@x.com");
    const res = await signInWithGoogle(db, { email: "a@X.com", emailVerified: true });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!, ENV.BETTER_AUTH_URL).pathname).toBe("/study");
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(1);
  });

  it("an unverified Google email is refused through the real handler", async () => {
    const db = await testDb();
    await addInvite(db, "a@x.com");
    const res = await signInWithGoogle(db, { email: "a@x.com", emailVerified: false });
    expect(new URL(res.headers.get("location")!, ENV.BETTER_AUTH_URL).pathname).toBe("/login");
    expect(await count(db, "user")).toBe(0);
  });
});

describe("account linking", () => {
  it("an unverified Google profile never links to an email-link user, and gets no session", async () => {
    const db = await testDb();
    // An email-link user (the owner, say): verified, and no account row, as the magic link leaves it.
    await db.execute(sql.raw(`insert into "user" (id, name, email, email_verified) values ('u-owner', 'Owner', 'owner@x.com', true)`));
    const res = await signInWithGoogle(db, { email: "owner@x.com", emailVerified: false });
    expect(new URL(res.headers.get("location")!, ENV.BETTER_AUTH_URL).pathname).toBe("/login");
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token=") && !c.includes("session_token=;"))).toBe(false);
    expect(await count(db, "account")).toBe(0);
    expect(await count(db, "session")).toBe(0);
    expect(await count(db, "user")).toBe(1);
  });

  it("a verified Google profile links to the email-link user with that address: one user", async () => {
    const db = await testDb();
    await db.execute(sql.raw(`insert into "user" (id, name, email, email_verified) values ('u-asha', 'Asha', 'asha@x.com', true)`));
    const res = await signInWithGoogle(db, { email: "asha@x.com", emailVerified: true });
    expect(new URL(res.headers.get("location")!, ENV.BETTER_AUTH_URL).pathname).toBe("/study");
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(1);
    expect(await count(db, "session")).toBe(1);
  });
});

describe("what Better Auth offers a signed-in person", () => {
  it("change-email and delete-user are disabled, so nobody can move or erase their account (and its denial)", async () => {
    const db = await testDb();
    const res = await signInWithGoogle(db, { email: "asha@x.com", emailVerified: true });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const auth = betterAuth(authOptions(db, ENV));
    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`${ENV.BETTER_AUTH_URL}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ENV.BETTER_AUTH_URL, cookie },
          body: JSON.stringify(body),
        }),
      );
    expect((await post("/change-email", { newEmail: "other@x.com" })).status).toBeGreaterThanOrEqual(400);
    expect((await post("/delete-user", {})).status).toBeGreaterThanOrEqual(400);
    const { rows } = (await db.execute(sql.raw(`select email from "user"`))) as unknown as { rows: { email: string }[] };
    expect(rows).toEqual([{ email: "asha@x.com" }]);
  });
});

describe("which ways in are on", () => {
  const EMAIL = { BETTER_AUTH_SECRET: ENV.BETTER_AUTH_SECRET, BETTER_AUTH_URL: ENV.BETTER_AUTH_URL, RESEND_API_KEY: "re_test", EMAIL_FROM: "Value It <a@b.c>" };

  it("Better Auth runs with Google, with email links, or both; the Google provider exists only with Google", async () => {
    const db = await testDb();
    expect(betterAuthOn(ENV)).toBe(true);
    expect(betterAuthOn(EMAIL)).toBe(true);
    expect(googleSignInOn(EMAIL)).toBe(false);
    expect(betterAuthOn({ GOOGLE_CLIENT_ID: "x", RESEND_API_KEY: "re", EMAIL_FROM: "a@b.c" })).toBe(false);
    expect(authOptions(db, EMAIL).socialProviders.google).toBeUndefined();
    expect(authOptions(db, ENV).socialProviders.google).toBeDefined();
  });

  it("Google needs all four settings: without the client secret or the site's address there is no button that fails on press", async () => {
    const db = await testDb();
    expect(googleSignInOn(ENV)).toBe(true);
    for (const missing of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const) {
      for (const value of [undefined, "", "  "]) {
        const env = { ...ENV, [missing]: value };
        expect(googleSignInOn(env), `${missing}=${JSON.stringify(value)}`).toBe(false);
        expect(betterAuthOn(env), `${missing}=${JSON.stringify(value)}`).toBe(false);
        expect(authOptions(db, env).socialProviders.google, missing).toBeUndefined();
      }
    }
    // Email links stay on beside a half-set Google: only the Google door closes.
    const halfGoogle = { ...EMAIL, GOOGLE_CLIENT_ID: "test-client" };
    expect(googleSignInOn(halfGoogle)).toBe(false);
    expect(betterAuthOn(halfGoogle)).toBe(true);
  });

  it("the magic-link plugin exists only with email links, and rate limits live in the database", async () => {
    const db = await testDb();
    const ids = (env: Record<string, string>) => authOptions(db, env).plugins.map((p) => p.id);
    expect(ids(EMAIL)).toContain("magic-link");
    expect(ids(ENV)).not.toContain("magic-link");
    expect(ids({ ...EMAIL, ...ENV })).toEqual(["magic-link", "next-cookies"]);
    expect(authOptions(db, EMAIL).rateLimit).toEqual({ storage: "database", customRules: { "/sign-in/magic-link": { window: 900, max: 10 } } });
  });
});
