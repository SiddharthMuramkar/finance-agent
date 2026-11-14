import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ACCESS_COOKIE, learnerToken } from "@/auth/passcode";
import { accessDenials, learners, OWNER_LEARNER_ID, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";

let db: Db;
vi.mock("@/db/client", () => ({ getDb: () => db }));
// Better Auth is mocked at its seam: on when Google or email links are configured (as getAuth decides),
// and getSession answers the signed-in user the test sets, or null (no or stale session).
const ba = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string } }));
vi.mock("@/auth/better-auth", () => {
  type Env = Record<string, string | undefined>;
  const google = (env: Env = process.env) => Boolean(env.BETTER_AUTH_SECRET?.trim() && env.GOOGLE_CLIENT_ID?.trim());
  const emailLinks = (env: Env = process.env) => Boolean(env.BETTER_AUTH_SECRET?.trim() && env.BETTER_AUTH_URL?.trim() && env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
  const on = (env: Env = process.env) => google(env) || emailLinks(env);
  return {
    googleSignInOn: google,
    betterAuthOn: on,
    getAuth: (env: Env = process.env) => (on(env) ? { api: { getSession: async () => (ba.user ? { session: { id: "s1" }, user: ba.user } : null) } } : null),
  };
});
const { proxy, config } = await import("./proxy");

const SECRET = "test-secret";

/** The owner's sign-in cookie, as the login sets it. */
const ownersCookie = async () => `${ACCESS_COOKIE}=${await learnerToken(OWNER_LEARNER_ID, SECRET)}`;

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://app.example"), init);
}

const allowed = (r: Response) => r.headers.get("x-middleware-next") === "1";
const redirectedToLogin = (r: Response) =>
  r.status >= 300 && r.status < 400 && new URL(r.headers.get("location")!).pathname === "/login";

describe("The signed-out gate", () => {
  beforeEach(async () => {
    db = await testDb();
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODE", "the passcode");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lets a signed-out visitor read Home", async () => {
    expect(allowed(await proxy(request("/")))).toBe(true);
    expect(allowed(await proxy(request("/", { method: "HEAD" })))).toBe(true);
  });

  it("lets a signed-out visitor read the About page", async () => {
    expect(allowed(await proxy(request("/about")))).toBe(true);
    expect(allowed(await proxy(request("/about", { method: "HEAD" })))).toBe(true);
  });

  it("refuses a write to / and any Server Action call", async () => {
    expect((await proxy(request("/", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/", { headers: { "Next-Action": "abc" } }))).status).toBe(401);
    expect((await proxy(request("/course", { headers: { "Next-Action": "abc" } }))).status).toBe(401);
  });

  it("refuses a write to /about and keeps the match exact", async () => {
    expect((await proxy(request("/about", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/about", { headers: { "Next-Action": "abc" } }))).status).toBe(401);
  });

  it("serves any .png or .webp file under /landing-assets/ signed out, the link-preview image among them", async () => {
    expect(allowed(await proxy(request("/landing-assets/workspace-light.png")))).toBe(true);
    expect(allowed(await proxy(request("/landing-assets/workspace-dark.webp")))).toBe(true);
  });

  it("sends every other page to the login", async () => {
    for (const path of ["/course", "/sessions/1", "/landing-assets/x.txt", "/landing-assets/a/b.png", "/about/x", "/aboutx"]) {
      expect(redirectedToLogin(await proxy(request(path))), path).toBe(true);
    }
  });

  it("sends a signed-out visitor from the Study Workspace to the login, and lets a signed-in one in", async () => {
    expect(redirectedToLogin(await proxy(request("/study")))).toBe(true);
    const cookie = await ownersCookie();
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
  });

  it("lets a signed-out POST reach exactly the sign-out route", async () => {
    expect(allowed(await proxy(request("/api/logout", { method: "POST" })))).toBe(true);
    expect((await proxy(request("/api/logout"))).status).toBe(401);
    expect((await proxy(request("/api/logout", { method: "HEAD" }))).status).toBe(401);
    for (const path of ["/api/logout/x", "/api/logoutx", "/api/logout/"]) {
      expect((await proxy(request(path, { method: "POST" }))).status, path).toBe(401);
    }
    expect((await proxy(request("/api/logout", { method: "POST", headers: { "Next-Action": "abc" } }))).status).toBe(401);
  });

  it("answers 401 on API routes", async () => {
    expect((await proxy(request("/api/turn", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/api/turn"))).status).toBe(401);
    // The Learner Profile API is behind the passcode too.
    expect((await proxy(request("/api/profile"))).status).toBe(401);
    expect((await proxy(request("/api/profile", { method: "PUT" }))).status).toBe(401);
  });

  it("sends /study to the login, remembering it", async () => {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(request("/study", { method }));
      expect(redirectedToLogin(response), method).toBe(true);
      expect(new URL(response.headers.get("location")!).search).toBe("?next=%2Fstudy");
    }
  });

  it("remembers any other page with its query, minus Next.js's internal parameters", async () => {
    const response = await proxy(request("/passages/12?from=map&_rsc=abc123"));
    expect(redirectedToLogin(response)).toBe(true);
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/passages/12?from=map");
  });

  it("remembers nothing for a non-GET page request or an API route", async () => {
    const post = await proxy(request("/course", { method: "POST" }));
    expect(redirectedToLogin(post)).toBe(true);
    expect(new URL(post.headers.get("location")!).search).toBe("");
    const api = await proxy(request("/api/turn"));
    expect(api.status).toBe(401);
    expect(api.headers.get("location")).toBeNull();
  });

  it("lets a signed-out visitor read exactly the login page, so there is no loop", async () => {
    expect(allowed(await proxy(request("/login")))).toBe(true);
    expect(allowed(await proxy(request("/login?next=%2Fcourse&wrong=1")))).toBe(true);
    expect(redirectedToLogin(await proxy(request("/login-anything")))).toBe(true);
  });

  it("skips the login form when signed in, with a temporary redirect to a safe next or /study", async () => {
    const cookie = await ownersCookie();
    const where = async (path: string) => {
      const response = await proxy(request(path, { headers: { cookie } }));
      expect([302, 303, 307]).toContain(response.status);
      const url = new URL(response.headers.get("location")!);
      return url.pathname + url.search;
    };
    expect(await where("/login")).toBe("/study");
    expect(await where("/login?next=%2Fcourse%3Ftopic%3D3")).toBe("/course?topic=3");
    expect(await where("/login?next=https%3A%2F%2Fevil.example")).toBe("/study");
    expect(await where("/login?next=%2Fapi%2Fturn")).toBe("/study");
  });

  it("lets a signed-in request through", async () => {
    const cookie = await ownersCookie();
    expect(allowed(await proxy(request("/course", { headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/api/turn", { method: "POST", headers: { cookie } })))).toBe(true);
  });

  it("lets a signed-in visitor read Home and sign out", async () => {
    const cookie = await ownersCookie();
    expect(allowed(await proxy(request("/", { headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/api/logout", { method: "POST", headers: { cookie } })))).toBe(true);
  });
});

describe("Cookies the proxy refuses", () => {
  beforeEach(async () => {
    db = await testDb();
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "owner:the passcode, test:another");
  });
  afterEach(() => vi.unstubAllEnvs());

  /** Signed out: a page goes to the login, an API route answers 401, and the login page shows its form rather than looping. */
  async function expectSignedOut(cookie: string) {
    const headers = { cookie };
    expect(redirectedToLogin(await proxy(request("/study", { headers })))).toBe(true);
    expect((await proxy(request("/api/turn", { method: "POST", headers }))).status).toBe(401);
    expect(allowed(await proxy(request("/login", { headers })))).toBe(true);
  }

  it("lets the owner's cookie through", async () => {
    expect(allowed(await proxy(request("/study", { headers: { cookie: await ownersCookie() } })))).toBe(true);
  });

  it("refuses a tampered signature or Learner id", async () => {
    const token = await learnerToken(OWNER_LEARNER_ID, SECRET);
    const [, signature] = token.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    await expectSignedOut(`${ACCESS_COOKIE}=${OWNER_LEARNER_ID}.${flipped}`);
    const [test] = await db.insert(learners).values({ name: "test" }).returning();
    await expectSignedOut(`${ACCESS_COOKIE}=${test.id}.${signature}`);
  });

  it("refuses an old cookie that carries no Learner", async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("finance-agent-access")));
    await expectSignedOut(`${ACCESS_COOKIE}=${Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")}`);
  });

  it("refuses the cookie of an archived Learner, or of a name taken off the list", async () => {
    const [test] = await db.insert(learners).values({ name: "test" }).returning();
    const cookie = `${ACCESS_COOKIE}=${await learnerToken(test.id, SECRET)}`;
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);

    vi.stubEnv("PASSCODES", "owner:the passcode");
    await expectSignedOut(cookie);

    vi.stubEnv("PASSCODES", "owner:the passcode, test:another");
    await db.update(learners).set({ archivedAt: new Date() }).where(eq(learners.id, test.id));
    await expectSignedOut(cookie);
  });
});

describe("Developer pages (/dev)", () => {
  beforeEach(async () => {
    db = await testDb();
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODE", "the passcode");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("open without a sign-in outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(allowed(await proxy(request("/dev/widgets?fixture=01-sensex-milestones")))).toBe(true);
  });

  it("go through the sign-in gate in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(redirectedToLogin(await proxy(request("/dev/widgets")))).toBe(true);
  });

  it("do not open for a path that only starts with the same letters", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(redirectedToLogin(await proxy(request("/devices")))).toBe(true);
  });
});

describe("Cookies at the gate (Google sign-in, C1b)", () => {
  const googleCookie = "better-auth.session_token=tok.sig";

  beforeEach(async () => {
    db = await testDb();
    ba.user = null;
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "tools:tools-pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-of-at-least-32-characters!");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lets a verified fa_access through and skips the login form for it", async () => {
    const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
    const cookie = `${ACCESS_COOKIE}=${await learnerToken(tools.id, SECRET)}`;
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
    const login = await proxy(request("/login", { headers: { cookie } }));
    expect(login.status).toBe(307);
    expect(new URL(login.headers.get("location")!).pathname).toBe("/study");
  });

  it("lets a request with only a Better Auth cookie through to the page (optimistic)", async () => {
    const headers = { cookie: googleCookie };
    expect(allowed(await proxy(request("/study", { headers })))).toBe(true);
    expect(allowed(await proxy(request("/api/turn", { method: "POST", headers })))).toBe(true);
  });

  it("with neither cookie a page redirects to /login?next=… and /api/* answers 401", async () => {
    const page = await proxy(request("/study"));
    expect(redirectedToLogin(page)).toBe(true);
    expect(new URL(page.headers.get("location")!).search).toBe("?next=%2Fstudy");
    expect((await proxy(request("/api/turn", { method: "POST" }))).status).toBe(401);
  });

  it("does not redirect GET /login away for an unchecked Better Auth cookie (no loop)", async () => {
    expect(allowed(await proxy(request("/login", { headers: { cookie: googleCookie } })))).toBe(true);
    expect(allowed(await proxy(request("/login?next=%2Fcourse", { headers: { cookie: googleCookie } })))).toBe(true);
  });

  it("skips the login form only for a fully checked Google session with a Learner", async () => {
    await db.insert(user).values({ id: "g1", name: "Asha", email: "a@x.com", emailVerified: true });
    await db.insert(learners).values({ name: "Asha", authUserId: "g1" });
    ba.user = { id: "g1", email: "a@x.com", name: "Asha" };
    const headers = { cookie: googleCookie };
    const plain = await proxy(request("/login", { headers }));
    expect(plain.status).toBe(307);
    expect(new URL(plain.headers.get("location")!).pathname).toBe("/study");
    const withNext = await proxy(request("/login?next=%2Fcourse", { headers }));
    expect(new URL(withNext.headers.get("location")!).pathname).toBe("/course");
    const evil = await proxy(request("/login?next=https%3A%2F%2Fevil.example", { headers }));
    expect(new URL(evil.headers.get("location")!).pathname).toBe("/study");
  });

  it("shows the login form when a Google session with no Learner sits beside a valid fa_access (no loop)", async () => {
    // currentLearner() lets the Google session decide, even when it maps to no Learner (session.test.ts),
    // so the page sends this request to /login; the login page must then show its form, not bounce back.
    const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
    await db.insert(user).values({ id: "g2", name: "Stranger", email: "s@x.com", emailVerified: true });
    ba.user = { id: "g2", email: "s@x.com", name: "Stranger" };
    const cookie = `${ACCESS_COOKIE}=${await learnerToken(tools.id, SECRET)}; ${googleCookie}`;
    expect(allowed(await proxy(request("/login", { headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/login?next=%2Fstudy", { headers: { cookie } })))).toBe(true);
  });

  it("recognises the production __Secure- cookie name on an https request", async () => {
    const headers = { cookie: "__Secure-better-auth.session_token=tok.sig" };
    expect(allowed(await proxy(request("/study", { headers })))).toBe(true);
  });

  it("treats a Better Auth cookie as signed out while Google sign-in is off", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(redirectedToLogin(await proxy(request("/study", { headers: { cookie: googleCookie } })))).toBe(true);
    expect((await proxy(request("/api/turn", { method: "POST", headers: { cookie: googleCookie } }))).status).toBe(401);
  });

  it("a waiting person sees /login, and so does a denied one whose Learner is still active (no loop)", async () => {
    const headers = { cookie: googleCookie };
    await db.insert(user).values({ id: "g3", name: "Noor", email: "n@x.com", emailVerified: true });
    ba.user = { id: "g3", email: "n@x.com", name: "Noor" };
    expect(allowed(await proxy(request("/login", { headers })))).toBe(true);
    expect(allowed(await proxy(request("/login?next=%2Fstudy", { headers })))).toBe(true);

    await db.insert(user).values({ id: "g1", name: "Asha", email: "a@x.com", emailVerified: true });
    await db.insert(learners).values({ name: "Asha", authUserId: "g1" });
    await db.insert(accessDenials).values({ userId: "g1" });
    ba.user = { id: "g1", email: "a@x.com", name: "Asha" };
    expect(allowed(await proxy(request("/login", { headers })))).toBe(true);
    // The page behind the gate sends them back to /login (currentLearner is null), and /login stays put.
    expect(allowed(await proxy(request("/study", { headers })))).toBe(true);
  });

  it("refuses the passcode cookie of a Learner whose account is denied", async () => {
    vi.stubEnv("PASSCODES", "tools:tools-pass, test:test-pass");
    await db.insert(user).values({ id: "g5", name: "Tess", email: "t@x.com", emailVerified: true });
    const [test] = await db.insert(learners).values({ name: "test", authUserId: "g5" }).returning();
    const cookie = `${ACCESS_COOKIE}=${await learnerToken(test.id, SECRET)}`;
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
    await db.insert(accessDenials).values({ userId: "g5" });
    expect(redirectedToLogin(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/login", { headers: { cookie } })))).toBe(true);
  });

  it("a Better Auth cookie counts with only email links on", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Value It <sign-in@app.example>");
    expect(allowed(await proxy(request("/study", { headers: { cookie: googleCookie } })))).toBe(true);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(redirectedToLogin(await proxy(request("/study", { headers: { cookie: googleCookie } })))).toBe(true);
  });

  it("signed out, /admin goes to the login and /api/admin answers 401", async () => {
    const page = await proxy(request("/admin"));
    expect(redirectedToLogin(page)).toBe(true);
    expect(new URL(page.headers.get("location")!).searchParams.get("next")).toBe("/admin");
    expect((await proxy(request("/api/admin/access", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/api/admin/invites", { method: "POST" }))).status).toBe(401);
  });

  it("keeps Better Auth's own routes out of the proxy, signed out (matcher)", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test("/api/auth/sign-in/social")).toBe(false);
    expect(matcher.test("/api/auth")).toBe(false);
    expect(matcher.test("/api/authx")).toBe(true);
    expect(matcher.test("/api/turn")).toBe(true);
    expect(matcher.test("/study")).toBe(true);
  });
});
