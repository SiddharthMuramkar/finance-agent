import { betterAuth } from "better-auth";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";

/**
 * BotID Basic on the two sign-in POSTs (decision #10), through Better Auth's real handler on PGlite. BotID itself is
 * never called: `botid/server` is stubbed, and each test sets its verdict. Resend and Google are never called either.
 */
const verdict = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("botid/server", () => ({ checkBotId: verdict.check }));
const initBotId = vi.hoisted(() => vi.fn());
vi.mock("botid/client/core", () => ({ initBotId }));

const { authOptions } = await import("./better-auth");
const { BOT_CHECKED, BOT_PROTECTED } = await import("./bot-protection");

const ENV = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a-test-secret-of-at-least-32-characters!",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Value It <sign-in@localhost>",
};

const HUMAN = { isHuman: true, isBot: false, isVerifiedBot: false, bypassed: false };
const BOT = { isHuman: false, isBot: true, isVerifiedBot: false, bypassed: false };

/** Better Auth over this database with Google and email links on; every outside call (Resend) is caught. */
function signInAuth(db: Db) {
  const outside: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      outside.push(url);
      return Response.json({ id: "email-1" });
    }),
  );
  return { auth: betterAuth(authOptions(db, ENV)), outside };
}

const post = (path: string, body: Record<string, string>) =>
  new Request(`${ENV.BETTER_AUTH_URL}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ENV.BETTER_AUTH_URL },
    body: JSON.stringify(body),
  });
const askForLink = (path = "/sign-in/magic-link") => post(path, { email: "a@x.com", callbackURL: "/study" });
const startGoogle = () => post("/sign-in/social", { provider: "google", callbackURL: "/study" });

async function sends(db: Db) {
  const { rows } = (await db.execute(sql.raw(`select count(*)::int as n from "email_link_sends"`))) as unknown as { rows: { n: number }[] };
  return rows[0].n;
}

beforeEach(() => {
  verdict.check.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {}); // Better Auth logs a check that throws
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BotID on the sign-in POSTs (decision #10)", () => {
  it("a bot asking for an email link gets 403, and no email is claimed or sent", async () => {
    const db = await testDb();
    const { auth, outside } = signInAuth(db);
    verdict.check.mockResolvedValue(BOT);
    const res = await auth.handler(askForLink());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("VERIFICATION_FAILED");
    expect(outside).toEqual([]);
    expect(await sends(db)).toBe(0);
  });

  it("a bot starting Google sign-in gets 403 and no Google address", async () => {
    const { auth } = signInAuth(await testDb());
    verdict.check.mockResolvedValue(BOT);
    const res = await auth.handler(startGoogle());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { url?: string }).url).toBeUndefined();
  });

  it("a person gets through both: the email is sent and Google's address comes back", async () => {
    const db = await testDb();
    const { auth, outside } = signInAuth(db);
    verdict.check.mockResolvedValue(HUMAN);
    expect((await auth.handler(askForLink())).status).toBe(200);
    expect(outside).toEqual(["https://api.resend.com/emails"]);
    const google = await auth.handler(startGoogle());
    expect(google.status).toBe(200);
    expect(new URL(((await google.json()) as { url: string }).url).host).toBe("accounts.google.com");
    expect(verdict.check).toHaveBeenCalledTimes(2);
  });

  it("fails closed: a check that throws (OIDC off) answers 500 and sends nothing", async () => {
    const db = await testDb();
    const { auth, outside } = signInAuth(db);
    verdict.check.mockRejectedValue(new Error("The 'x-vercel-oidc-token' header is missing from the request."));
    expect((await auth.handler(askForLink())).status).toBe(500);
    expect((await auth.handler(startGoogle())).status).toBe(500);
    expect(outside).toEqual([]);
    expect(await sends(db)).toBe(0);
  });

  it("a trailing or doubled slash is still checked", async () => {
    const db = await testDb();
    const { auth, outside } = signInAuth(db);
    verdict.check.mockResolvedValue(BOT);
    for (const path of ["/sign-in/magic-link/", "//sign-in/magic-link", "/sign-in//magic-link"]) {
      expect((await auth.handler(askForLink(path))).status, path).toBe(403);
    }
    expect(outside).toEqual([]);
  });

  it("checks only the two sign-in POSTs: the session, the link's verify and sign-out never call BotID", async () => {
    const { auth } = signInAuth(await testDb());
    verdict.check.mockResolvedValue(BOT);
    await auth.handler(new Request(`${ENV.BETTER_AUTH_URL}/api/auth/get-session`));
    await auth.handler(new Request(`${ENV.BETTER_AUTH_URL}/api/auth/magic-link/verify?token=t&callbackURL=%2Fstudy`));
    await auth.handler(post("/sign-out", {}));
    expect(verdict.check).not.toHaveBeenCalled();
  });
});

describe("the browser protects the same requests the server checks", () => {
  it("lists each checked Better Auth path, under /api/auth, as a POST", () => {
    expect(BOT_CHECKED).toEqual(["/sign-in/social", "/sign-in/magic-link"]);
    expect(BOT_PROTECTED).toEqual(BOT_CHECKED.map((path) => ({ path: `/api/auth${path}`, method: "POST" })));
  });

  it("the captcha plugin checks exactly BOT_CHECKED, with BotID", async () => {
    const plugin = authOptions(await testDb(), ENV).plugins.find((p) => p.id === "captcha");
    expect(plugin?.options).toMatchObject({ provider: "vercel-botid", endpoints: BOT_CHECKED });
  });

  it("instrumentation-client starts BotID with BOT_PROTECTED before the app runs", async () => {
    await import("@/instrumentation-client");
    expect(initBotId).toHaveBeenCalledWith({ protect: BOT_PROTECTED });
  });
});
