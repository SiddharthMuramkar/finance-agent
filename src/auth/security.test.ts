import { betterAuth } from "better-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { authOptions } from "./better-auth";
import { googleCallbackURL } from "./destination";
import { addInvite } from "./invites";

describe("open redirect through next (C1b)", () => {
  it("builds callbackURL only from a safe destination", () => {
    for (const next of ["//evil.example", "/\\evil", "/%2f%2fevil", "https://evil.example", "/api/anything"]) {
      expect(googleCallbackURL(next), next).toBe("/study");
    }
    expect(googleCallbackURL("/course")).toBe("/course");
    expect(googleCallbackURL(undefined)).toBe("/study");
  });
});

const ENV = {
  BETTER_AUTH_URL: "https://app.example",
  BETTER_AUTH_SECRET: "a-test-secret-of-at-least-32-characters!",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
};

/** One invited Google sign-in through Better Auth's real handler on PGlite; Google is never called. */
async function signInWithGoogle(db: Db) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "at", token_type: "Bearer", expires_in: 3600, scope: "openid email profile" })),
  );
  const options = authOptions(db, ENV);
  const google = options.socialProviders!.google!;
  const auth = betterAuth({
    ...options,
    socialProviders: {
      google: { ...google, getUserInfo: async () => ({ user: { name: "Asha", email: "a@x.com", emailVerified: true }, data: { sub: "g-123" } as never }) },
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

afterEach(() => vi.unstubAllGlobals());

describe("the Better Auth session cookie (C1b)", () => {
  it("is HttpOnly, SameSite=Lax, and Secure for an https base URL", async () => {
    const db = await testDb();
    await addInvite(db, "a@x.com");
    const res = await signInWithGoogle(db);
    expect(res.status).toBe(302);
    const sessionCookie = res.headers.getSetCookie().find((c) => c.includes("session_token=") && !c.includes("session_token=;"))!;
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Secure/i);
  });
});

describe("while Google sign-in is off (C1b)", () => {
  it("/api/auth/* answers 404", async () => {
    const { GET, POST } = await import("@/app/api/auth/[...all]/route");
    expect((await GET(new Request("http://localhost:3000/api/auth/get-session"))).status).toBe(404);
    expect((await POST(new Request("http://localhost:3000/api/auth/sign-in/social", { method: "POST" }))).status).toBe(404);
  });
});
