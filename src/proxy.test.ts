import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ACCESS_COOKIE, learnerToken } from "@/auth/passcode";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { E2E_PERSON_COOKIE, e2ePersonToken } from "@/dev/e2e-identity";
import { testDb } from "@/test/pglite";
import nextConfig from "../next.config";

let db: Db;
vi.mock("@/db/client", () => ({ getDb: () => db }));
// clerkMiddleware is mocked at its seam: it verifies nothing and hands the gate an `auth()` that says whether the test
// signed a Clerk user in. `calls` counts the requests it saw, so a test can show Clerk was never asked.
const clerk = vi.hoisted(() => ({ calls: 0, signedIn: false }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: (auth: () => Promise<{ isAuthenticated: boolean }>, request: NextRequest) => Promise<Response>) => async (request: NextRequest) => {
    clerk.calls++;
    return handler(async () => ({ isAuthenticated: clerk.signedIn }), request);
  },
}));
const { proxy, config } = await import("./proxy");

const SECRET = "test-secret";
const CLERK_KEYS = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", CLERK_SECRET_KEY: "sk_test_x" };

/** The owner Learner's passcode cookie, as the passcode door sets it. */
const ownersCookie = async () => `${ACCESS_COOKIE}=${await learnerToken(OWNER_LEARNER_ID, SECRET)}`;

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://app.example"), init);
}

const allowed = (r: Response) => r.headers.get("x-middleware-next") === "1";
const redirectedToSignIn = (r: Response) =>
  r.status >= 300 && r.status < 400 && new URL(r.headers.get("location")!).pathname === "/sign-in";
/** Where a signed-in visit to /sign-in is sent instead (a temporary redirect). */
async function skipsTo(path: string, headers: Record<string, string> = {}) {
  const response = await proxy(request(path, { headers }));
  expect([302, 303, 307], path).toContain(response.status);
  const url = new URL(response.headers.get("location")!);
  return url.pathname + url.search;
}

function stubEnv(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
}

beforeEach(async () => {
  db = await testDb();
  clerk.calls = 0;
  clerk.signedIn = false;
  stubEnv({ SESSION_SECRET: SECRET, PASSCODES: "owner:the passcode, tools:tools-pass" });
});
afterEach(() => vi.unstubAllEnvs());

describe("The signed-out gate", () => {
  it("lets a signed-out visitor read Home, the About page and the Waitlist", async () => {
    for (const path of ["/", "/about", "/join"]) {
      expect(allowed(await proxy(request(path))), path).toBe(true);
      expect(allowed(await proxy(request(path, { method: "HEAD" }))), path).toBe(true);
    }
  });

  it("lets a signed-out visitor read the sign-in and sign-up pages and every step under them, so there is no loop", async () => {
    for (const path of ["/sign-in", "/sign-in?next=%2Fcourse", "/sign-in/factor-one", "/sign-in/sso-callback", "/sign-up", "/sign-up/verify-email-address"]) {
      expect(allowed(await proxy(request(path))), path).toBe(true);
    }
    for (const path of ["/sign-inx", "/sign-upx", "/joinx", "/join/x", "/login"]) {
      expect(redirectedToSignIn(await proxy(request(path))), path).toBe(true);
    }
  });

  it("refuses a write to a public page and any Server Action call while Clerk is off", async () => {
    for (const path of ["/", "/about", "/join", "/sign-in", "/sign-up/x"]) {
      expect((await proxy(request(path, { method: "POST" }))).status, path).toBe(401);
      expect((await proxy(request(path, { method: "POST", headers: { "Next-Action": "abc" } }))).status, path).toBe(401);
    }
    expect((await proxy(request("/course", { method: "POST", headers: { "Next-Action": "abc" } }))).status).toBe(401);
  });

  it("serves any .png or .webp file under /landing-assets/ signed out, the link-preview image among them", async () => {
    expect(allowed(await proxy(request("/landing-assets/workspace-light.png")))).toBe(true);
    expect(allowed(await proxy(request("/landing-assets/workspace-dark.webp")))).toBe(true);
  });

  it("sends every other page to the sign-in", async () => {
    for (const path of ["/course", "/sessions/1", "/landing-assets/x.txt", "/landing-assets/a/b.png", "/about/x", "/aboutx", "/admin"]) {
      expect(redirectedToSignIn(await proxy(request(path))), path).toBe(true);
    }
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

  it("answers 401 on API routes, the old Better Auth ones included", async () => {
    for (const path of ["/api/turn", "/api/profile", "/api/admin/access", "/api/auth/sign-in/social"]) {
      expect((await proxy(request(path, { method: "POST" }))).status, path).toBe(401);
      expect((await proxy(request(path))).status, path).toBe(401);
    }
  });

  it("sends /study to the sign-in, remembering it", async () => {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(request("/study", { method }));
      expect(redirectedToSignIn(response), method).toBe(true);
      expect(new URL(response.headers.get("location")!).search).toBe("?next=%2Fstudy");
    }
  });

  it("remembers any other page with its query, minus Next.js's internal parameters", async () => {
    const response = await proxy(request("/passages/12?from=map&_rsc=abc123"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/passages/12?from=map");
  });

  it("remembers nothing for a non-GET page request or an API route", async () => {
    const post = await proxy(request("/course", { method: "POST" }));
    expect(redirectedToSignIn(post)).toBe(true);
    expect(new URL(post.headers.get("location")!).search).toBe("");
    const api = await proxy(request("/api/turn"));
    expect(api.status).toBe(401);
    expect(api.headers.get("location")).toBeNull();
  });
});

describe("Signed in with a passcode (the door is open off production)", () => {
  it("lets every page and route through, Home and sign-out included", async () => {
    const cookie = await ownersCookie();
    for (const path of ["/study", "/course", "/", "/admin"]) expect(allowed(await proxy(request(path, { headers: { cookie } }))), path).toBe(true);
    expect(allowed(await proxy(request("/api/turn", { method: "POST", headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/api/logout", { method: "POST", headers: { cookie } })))).toBe(true);
  });

  it("skips the sign-in form, with a temporary redirect to a safe next or /study", async () => {
    const cookie = await ownersCookie();
    expect(await skipsTo("/sign-in", { cookie })).toBe("/study");
    expect(await skipsTo("/sign-in?next=%2Fcourse%3Ftopic%3D3", { cookie })).toBe("/course?topic=3");
    for (const next of ["https%3A%2F%2Fevil.example", "%2Fapi%2Fturn", "%2Fsign-in", "%2Fsign-up%2Fx", "%2Fjoin", "%2Flogin"]) {
      expect(await skipsTo(`/sign-in?next=${next}`, { cookie }), next).toBe("/study");
    }
    // Only /sign-in itself: Clerk's steps under it, and /sign-up, are left to Clerk.
    expect(allowed(await proxy(request("/sign-in/sso-callback", { headers: { cookie } })))).toBe(true);
  });
});

describe("Passcode cookies the proxy refuses", () => {
  /** Signed out: a page goes to the sign-in, an API route answers 401, and the sign-in page shows its form rather than looping. */
  async function expectSignedOut(cookie: string) {
    const headers = { cookie };
    expect(redirectedToSignIn(await proxy(request("/study", { headers })))).toBe(true);
    expect((await proxy(request("/api/turn", { method: "POST", headers }))).status).toBe(401);
    expect(allowed(await proxy(request("/sign-in", { headers })))).toBe(true);
  }

  it("refuses a tampered signature or Learner id", async () => {
    const [, signature] = (await learnerToken(OWNER_LEARNER_ID, SECRET)).split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    await expectSignedOut(`${ACCESS_COOKIE}=${OWNER_LEARNER_ID}.${flipped}`);
    const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
    await expectSignedOut(`${ACCESS_COOKIE}=${tools.id}.${signature}`);
  });

  it("refuses an old cookie that carries no Learner", async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("finance-agent-access")));
    await expectSignedOut(`${ACCESS_COOKIE}=${Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")}`);
  });

  it("refuses the cookie of an archived Learner, or of a name taken off the list", async () => {
    const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
    const cookie = `${ACCESS_COOKIE}=${await learnerToken(tools.id, SECRET)}`;
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
    vi.stubEnv("PASSCODES", "owner:the passcode");
    await expectSignedOut(cookie);
    vi.stubEnv("PASSCODES", "owner:the passcode, tools:tools-pass");
    await db.update(learners).set({ archivedAt: new Date() }).where(eq(learners.id, tools.id));
    await expectSignedOut(cookie);
  });

  it("refuses the cookie of a Learner that belongs to a Clerk user", async () => {
    const [tools] = await db.insert(learners).values({ name: "tools", clerkUserId: "user_t" }).returning();
    await expectSignedOut(`${ACCESS_COOKIE}=${await learnerToken(tools.id, SECRET)}`);
  });

  it("refuses every passcode cookie in production and on Vercel (the door is shut)", async () => {
    const cookie = await ownersCookie();
    vi.stubEnv("VERCEL", "1");
    await expectSignedOut(cookie);
    vi.unstubAllEnvs();
    stubEnv({ SESSION_SECRET: SECRET, PASSCODES: "owner:the passcode", NODE_ENV: "production" });
    expect(redirectedToSignIn(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
  });
});

describe("Developer pages (/dev)", () => {
  it("open without a sign-in outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(allowed(await proxy(request("/dev/widgets?fixture=01-sensex-milestones")))).toBe(true);
  });

  it("go through the sign-in gate in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(redirectedToSignIn(await proxy(request("/dev/widgets")))).toBe(true);
  });

  it("do not open for a path that only starts with the same letters", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(redirectedToSignIn(await proxy(request("/devices")))).toBe(true);
  });
});

describe("With Clerk on (issue #33)", () => {
  beforeEach(() => stubEnv(CLERK_KEYS));

  it("asks clerkMiddleware about every request, and lets a signed-in Clerk user through", async () => {
    clerk.signedIn = true;
    expect(allowed(await proxy(request("/study")))).toBe(true);
    expect(allowed(await proxy(request("/api/turn", { method: "POST" })))).toBe(true);
    expect(clerk.calls).toBe(2);
  });

  it("skips the sign-in form for a signed-in Clerk user, but leaves Clerk's own steps alone", async () => {
    clerk.signedIn = true;
    expect(await skipsTo("/sign-in")).toBe("/study");
    expect(await skipsTo("/sign-in?next=%2Fnotebook")).toBe("/notebook");
    expect(allowed(await proxy(request("/sign-in/sso-callback")))).toBe(true);
    expect(allowed(await proxy(request("/sign-up")))).toBe(true);
  });

  it("signed out, sends pages to /sign-in?next=… and answers 401 on API routes, and lets the public pages through", async () => {
    const page = await proxy(request("/study"));
    expect(redirectedToSignIn(page)).toBe(true);
    expect(new URL(page.headers.get("location")!).search).toBe("?next=%2Fstudy");
    expect((await proxy(request("/api/turn", { method: "POST" }))).status).toBe(401);
    for (const path of ["/", "/about", "/join", "/sign-in", "/sign-up"]) expect(allowed(await proxy(request(path))), path).toBe(true);
  });

  it("signed out, lets a Server Action call reach the sign-in and sign-up pages, where Clerk's setActive makes one", async () => {
    // @clerk/nextjs's ClerkProvider calls its own Server Action (invalidateCacheAction) before clerk-js writes the new
    // session cookie, so the call comes signed out; refused, setActive would wait for it forever (review of PR B).
    const action = { method: "POST", headers: { "Next-Action": "abc" } };
    for (const path of ["/sign-in", "/sign-in/factor-one", "/sign-in/verify", "/sign-in/sso-callback", "/sign-up", "/sign-up/verify-email-address"]) {
      expect(allowed(await proxy(request(path, action))), path).toBe(true);
    }
    // Only a Server Action call, only by POST, and only there.
    for (const path of ["/sign-in", "/sign-up/x"]) {
      expect((await proxy(request(path, { method: "POST" }))).status, path).toBe(401);
      expect((await proxy(request(path, { method: "PUT", headers: { "Next-Action": "abc" } }))).status, path).toBe(401);
    }
    for (const path of ["/", "/about", "/join", "/sign-inx", "/sign-upx", "/course", "/api/turn", "/api/logout"]) {
      expect((await proxy(request(path, action))).status, path).toBe(401);
    }
  });

  it("still lets the passcode door's cookie through on a developer's machine, and never on Vercel", async () => {
    const cookie = await ownersCookie();
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
    vi.stubEnv("VERCEL", "1");
    expect(redirectedToSignIn(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
  });
});

describe("Clerk off: no keys (CI), or the browser test bed", () => {
  it("never calls Clerk without both keys", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    clerk.signedIn = true;
    expect(redirectedToSignIn(await proxy(request("/study")))).toBe(true);
    expect(clerk.calls).toBe(0);
  });

  it("in the test bed, a signed person's cookie stands for a Clerk session, and Clerk is never called, keys or not", async () => {
    stubEnv({ ...CLERK_KEYS, E2E: "1" });
    clerk.signedIn = true;
    expect(redirectedToSignIn(await proxy(request("/study")))).toBe(true);
    const cookie = `${E2E_PERSON_COOKIE}=${await e2ePersonToken("asha", SECRET)}`;
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
    expect(await skipsTo("/sign-in", { cookie })).toBe("/study");
    const forged = `${E2E_PERSON_COOKIE}=${await e2ePersonToken("asha", "another-secret")}`;
    expect(redirectedToSignIn(await proxy(request("/study", { headers: { cookie: forged } })))).toBe(true);
    expect(clerk.calls).toBe(0);
  });

  it("outside the test bed, the test bed's cookie means nothing", async () => {
    const cookie = `${E2E_PERSON_COOKIE}=${await e2ePersonToken("owner", SECRET)}`;
    expect(redirectedToSignIn(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
  });
});

describe("The matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("keeps only the passcode door's own route and the two cron routes out of the proxy; Better Auth's routes go through it now", () => {
    expect(matcher.test("/api/login")).toBe(false);
    expect(matcher.test("/api/login/x")).toBe(false);
    expect(matcher.test("/api/login-anything")).toBe(true);
    expect(matcher.test("/api/cron/library-refresh")).toBe(false);
    // The health cron (#36): Vercel's schedule has no sign-in; the route checks CRON_SECRET itself.
    expect(matcher.test("/api/cron/health")).toBe(false);
    expect(matcher.test("/api/cron/health/x")).toBe(true);
    expect(matcher.test("/api/cron/other")).toBe(true);
    expect(matcher.test("/api/auth/sign-in/social")).toBe(true);
    expect(matcher.test("/api/auth")).toBe(true);
    expect(matcher.test("/api/turn")).toBe(true);
    expect(matcher.test("/study")).toBe(true);
    expect(matcher.test("/sign-in/sso-callback")).toBe(true);
  });

  it("keeps BotID's challenge paths out of the proxy, signed out (issue #33)", async () => {
    // The browser loads the challenge with no say over its cookies, so the proxy must never send it to the sign-in.
    const rewrites = await nextConfig.rewrites!();
    const sources = (Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? [])])
      .filter((r) => r.destination.startsWith("https://api.vercel.com/bot-protection/"))
      .map((r) => r.source.replace("/:path*", "/a/b.js"));
    expect(sources).toHaveLength(2);
    for (const source of sources) expect(matcher.test(source), source).toBe(false);
    expect(matcher.test("/149e9513-01fa-4fb0-aad4-566afd725d1bx")).toBe(true);
  });
});

describe("Server Actions", () => {
  /** Every .ts and .tsx file under src, tests left out. */
  function* sources(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) yield* sources(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield path;
    }
  }
  const USE_SERVER = /^\s*["']use server["'];?\s*$/m;

  it("the app defines none of its own, so the signed-out call the gate lets through on /sign-in can only be Clerk's", () => {
    // A Server Action of ours would be callable signed out from /sign-in (isClerkSignInAction): adding one means
    // narrowing that rule first.
    expect(USE_SERVER.test('"use server";\nexport async function act() {}')).toBe(true);
    expect(USE_SERVER.test('async function act() {\n  "use server";\n}')).toBe(true);
    const files = [...sources(join(import.meta.dirname))];
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((path) => USE_SERVER.test(readFileSync(path, "utf8")))).toEqual([]);
  });
});
