import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE } from "@/auth/passcode";

// Signing out must never touch the database (Better Auth is mocked at its seam): any use of it fails the test.
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("sign-out must not touch Learner data");
  },
}));
const ba = vi.hoisted(() => ({
  signOut: vi.fn(async () => {
    const headers = new Headers();
    headers.append("set-cookie", "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
    return new Response(null, { headers });
  }),
}));
vi.mock("@/auth/better-auth", () => {
  const on = (env: Record<string, string | undefined> = process.env) => Boolean(env.BETTER_AUTH_SECRET?.trim() && env.GOOGLE_CLIENT_ID?.trim());
  return {
    googleSignInOn: on,
    getAuth: (env: Record<string, string | undefined> = process.env) => (on(env) ? { api: { signOut: ba.signOut } } : null),
  };
});
const { GET, POST } = await import("./route");

const SITE = "https://www.app.example";

function signOut(headers: Record<string, string>, method = "POST") {
  return new Request(`${SITE}/api/logout`, { method, headers });
}

const cookieHeader = (r: Response) => r.headers.get("set-cookie") ?? "";

function expectsSignedOut(r: Response) {
  expect(r.status).toBe(303);
  expect(new URL(r.headers.get("location")!).pathname).toBe("/");
  const cookie = cookieHeader(r);
  expect(cookie).toMatch(new RegExp(`^${ACCESS_COOKIE}=;`));
  expect(cookie).toMatch(/Path=\/(;|$)/);
  expect(cookie).not.toMatch(/Domain=/i);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=lax/i);
  const expires = cookie.match(/Expires=([^;]+)/i)?.[1];
  expect(expires).toBeDefined();
  expect(new Date(expires!).getTime()).toBeLessThan(Date.now());
}

describe("Signing out", () => {
  it("expires the passcode cookie and sends a same-origin POST to Home", async () => {
    expectsSignedOut(
      await POST(signOut({ "sec-fetch-site": "same-origin", origin: SITE, cookie: `${ACCESS_COOKIE}=abc` })),
    );
  });

  it("works when already signed out", async () => {
    expectsSignedOut(await POST(signOut({ "sec-fetch-site": "same-origin" })));
  });

  it("accepts a matching Origin when the browser sends no Sec-Fetch-Site", async () => {
    expectsSignedOut(await POST(signOut({ origin: SITE })));
  });

  it("refuses every request that isn't plainly same-origin, leaving the cookie alone", async () => {
    const refused: Record<string, Record<string, string>> = {
      "cross-site": { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      "same-site": { "sec-fetch-site": "same-site", origin: "https://app.example" },
      "Origin: null": { origin: "null" },
      "no Origin, no Sec-Fetch-Site": {},
      "another origin": { origin: "https://evil.example" },
      "another port": { origin: "https://www.app.example:8443" },
    };
    for (const [name, headers] of Object.entries(refused)) {
      const r = await POST(signOut(headers));
      expect(r.status, name).toBe(403);
      expect(cookieHeader(r), name).toBe("");
    }
  });

  it("answers a GET with 405", async () => {
    const r = await GET();
    expect(r.status).toBe(405);
    expect(cookieHeader(r)).toBe("");
  });
});

describe("Signing out with Google sign-in on (C1b)", () => {
  beforeEach(() => {
    ba.signOut.mockClear();
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-of-at-least-32-characters!");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sign out ends both: Better Auth once, and fa_access expired", async () => {
    const r = await POST(
      signOut({ "sec-fetch-site": "same-origin", origin: SITE, cookie: `${ACCESS_COOKIE}=abc; better-auth.session_token=tok.sig` }),
    );
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
    expect(ba.signOut).toHaveBeenCalledTimes(1);
    const call = ba.signOut.mock.calls[0] as unknown as [{ headers: Headers }];
    expect(call[0].headers.get("cookie")).toContain("better-auth.session_token=tok.sig");
    const cookies = r.headers.getSetCookie();
    const fa = cookies.find((c) => c.startsWith(`${ACCESS_COOKIE}=;`))!;
    expect(fa).toMatch(/Path=\/(;|$)/);
    expect(fa).toMatch(/HttpOnly/i);
    expect(fa).toMatch(/SameSite=lax/i);
    expect(new Date(fa.match(/Expires=([^;]+)/i)![1]).getTime()).toBeLessThan(Date.now());
    expect(cookies.some((c) => c.startsWith("better-auth.session_token=;"))).toBe(true);
  });

  it("a cross-site POST answers 403 and signs nothing out", async () => {
    const r = await POST(signOut({ "sec-fetch-site": "cross-site", origin: "https://evil.example", cookie: "better-auth.session_token=tok.sig" }));
    expect(r.status).toBe(403);
    expect(ba.signOut).not.toHaveBeenCalled();
    expect(cookieHeader(r)).toBe("");
  });

  it("answers a GET with 405 and signs nothing out", async () => {
    const r = await GET();
    expect(r.status).toBe(405);
    expect(ba.signOut).not.toHaveBeenCalled();
  });
});
