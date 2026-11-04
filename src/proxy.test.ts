import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ACCESS_COOKIE, learnerToken } from "@/auth/passcode";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";

let db: Db;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const { proxy } = await import("./proxy");

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

  it("refuses a write to / and any Server Action call", async () => {
    expect((await proxy(request("/", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/", { headers: { "Next-Action": "abc" } }))).status).toBe(401);
    expect((await proxy(request("/course", { headers: { "Next-Action": "abc" } }))).status).toBe(401);
  });

  it("serves the link-preview image signed out", async () => {
    expect(allowed(await proxy(request("/landing-assets/workspace-light.png")))).toBe(true);
    expect(allowed(await proxy(request("/landing-assets/workspace-dark.webp")))).toBe(true);
  });

  it("sends every other page to the login", async () => {
    for (const path of ["/course", "/sessions/1", "/landing-assets/x.txt", "/landing-assets/a/b.png"]) {
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
    expect((await proxy(request("/api/profile/dismiss", { method: "POST" }))).status).toBe(401);
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
