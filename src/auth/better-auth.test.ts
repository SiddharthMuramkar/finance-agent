import { betterAuth } from "better-auth";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { authOptions } from "./better-auth";
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
  if (!before) throw new Error("no invite gate");
  return (u: ReturnType<typeof googleUser>) => before(u, null);
}

async function count(db: Db, table: "user" | "account" | "learners") {
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
      google: { ...google, getUserInfo: async () => ({ user: { id: "g-123", name: "Asha", image: null, ...profile }, data: { sub: "g-123" } }) },
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

describe("the invite gate (databaseHooks.user.create.before)", () => {
  it("the gate blocks an uninvited sign-up and keeps nothing", async () => {
    const db = await testDb();
    await setSignupOpen(db, false);
    await expect(gate(db)(googleUser("stranger@x.com"))).rejects.toThrow("not_invited");
    await addInvite(db, "a@x.com");
    await expect(gate(db)(googleUser("a@x.com", false))).rejects.toThrow();
    await expect(gate(db)(googleUser(" A@X.com "))).resolves.toEqual({ data: googleUser(" A@X.com ") });
    await setSignupOpen(db, true);
    await expect(gate(db)(googleUser("stranger@x.com"))).resolves.toEqual({ data: googleUser("stranger@x.com") });

    await setSignupOpen(db, false);
    const learnersBefore = await count(db, "learners");
    const res = await signInWithGoogle(db, { email: "stranger@x.com", emailVerified: true });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!, ENV.BETTER_AUTH_URL);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("not_invited");
    expect(await count(db, "user")).toBe(0);
    expect(await count(db, "account")).toBe(0);
    expect(await count(db, "learners")).toBe(learnersBefore);
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
