import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { E2E_PEOPLE, E2E_PERSON_COOKIE, e2eIdentityFromCookie, e2ePersonToken } from "@/dev/e2e-identity";
import { clerkOn } from "./gates";

/**
 * Who an account is (issue #33): Clerk's `auth()` is mocked at its seam, so no key and no network is needed; the test
 * bed's stand-in reads a mocked cookie jar.
 */
const clerk = vi.hoisted(() => ({
  calls: 0,
  session: null as null | { userId: string; sessionClaims: Record<string, unknown> | null },
}));
const jar = vi.hoisted(() => ({ cookie: undefined as string | undefined }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => {
    clerk.calls++;
    return clerk.session
      ? { isAuthenticated: true, userId: clerk.session.userId, sessionClaims: clerk.session.sessionClaims }
      : { isAuthenticated: false, userId: null, sessionClaims: null };
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === E2E_PERSON_COOKIE && jar.cookie !== undefined ? { name, value: jar.cookie } : undefined) }),
}));

const { currentIdentity, identityFromClaims } = await import("./identity");

const SECRET = "test-secret";
const KEYS = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", CLERK_SECRET_KEY: "sk_test_x" };

function clerkKeys() {
  for (const [name, value] of Object.entries(KEYS)) vi.stubEnv(name, value);
}

describe("clerkOn", () => {
  it("needs both keys, and is off in the test bed whatever the keys", () => {
    expect(clerkOn({ ...KEYS, NODE_ENV: "development" })).toBe(true);
    expect(clerkOn({ ...KEYS, NODE_ENV: "production", VERCEL: "1" })).toBe(true);
    expect(clerkOn({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" })).toBe(false);
    expect(clerkOn({ CLERK_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(clerkOn({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: " ", CLERK_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(clerkOn({ ...KEYS, E2E: "1", NODE_ENV: "development" })).toBe(false);
  });
});

describe("identityFromClaims", () => {
  it("reads email, first name and the admin role from the custom claims", () => {
    expect(identityFromClaims("user_1", { email: "o@x.com", firstName: " Sid ", metadata: { role: "admin" } })).toEqual({
      userId: "user_1",
      email: "o@x.com",
      firstName: "Sid",
      admin: true,
    });
  });

  it("reads a missing or malformed claim as null, and anything but role admin as not admin", () => {
    expect(identityFromClaims("user_2", null)).toEqual({ userId: "user_2", email: null, firstName: null, admin: false });
    expect(identityFromClaims("user_2", { email: 3, firstName: "", metadata: "admin" } as never)).toEqual({ userId: "user_2", email: null, firstName: null, admin: false });
    expect(identityFromClaims("user_2", { metadata: { role: "Admin" } }).admin).toBe(false);
    expect(identityFromClaims("user_2", { metadata: {} }).admin).toBe(false);
  });
});

describe("currentIdentity", () => {
  beforeEach(() => {
    clerk.calls = 0;
    clerk.session = null;
    jar.cookie = undefined;
    vi.stubEnv("SESSION_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is null without calling Clerk while Clerk is off (no keys: CI)", async () => {
    clerk.session = { userId: "user_1", sessionClaims: {} };
    expect(await currentIdentity()).toBeNull();
    expect(clerk.calls).toBe(0);
  });

  it("is the verified Clerk session while Clerk is on, and null when it is signed out", async () => {
    clerkKeys();
    expect(await currentIdentity()).toBeNull();
    clerk.session = { userId: "user_1", sessionClaims: { email: "a@x.com", firstName: "Asha", metadata: {} } };
    expect(await currentIdentity()).toEqual({ userId: "user_1", email: "a@x.com", firstName: "Asha", admin: false });
    expect(clerk.calls).toBe(2);
  });

  it("in the test bed is the signed person's cookie, and never Clerk, keys or not", async () => {
    clerkKeys();
    vi.stubEnv("E2E", "1");
    clerk.session = { userId: "user_1", sessionClaims: {} };
    expect(await currentIdentity()).toBeNull();
    jar.cookie = await e2ePersonToken("owner", SECRET);
    expect(await currentIdentity()).toEqual(E2E_PEOPLE.owner);
    jar.cookie = await e2ePersonToken("asha", SECRET);
    expect(await currentIdentity()).toMatchObject({ userId: "user_e2e_asha", admin: false });
    expect(clerk.calls).toBe(0);
  });
});

describe("the test bed's person cookie", () => {
  const env = { E2E: "1", NODE_ENV: "development" };

  it("names a person only with the right signature, and only while the test bed is on", async () => {
    const token = await e2ePersonToken("owner", SECRET);
    expect(await e2eIdentityFromCookie(token, SECRET, env)).toEqual(E2E_PEOPLE.owner);
    expect(await e2eIdentityFromCookie(token, "another-secret", env)).toBeNull();
    expect(await e2eIdentityFromCookie(token.replace(/^owner/, "asha"), SECRET, env)).toBeNull();
    expect(await e2eIdentityFromCookie(`nobody.${token.split(".")[1]}`, SECRET, env)).toBeNull();
    expect(await e2eIdentityFromCookie(token, "", env)).toBeNull();
    expect(await e2eIdentityFromCookie(undefined, SECRET, env)).toBeNull();
    expect(await e2eIdentityFromCookie(token, SECRET, { ...env, NODE_ENV: "production" })).toBeNull();
    expect(await e2eIdentityFromCookie(token, SECRET, { ...env, VERCEL: "1" })).toBeNull();
    expect(await e2eIdentityFromCookie(token, SECRET, { NODE_ENV: "development" })).toBeNull();
  });

  it("hands out a copy, so nobody can change the registry", async () => {
    const found = await e2eIdentityFromCookie(await e2ePersonToken("asha", SECRET), SECRET, env);
    found!.admin = true;
    expect(E2E_PEOPLE.asha.admin).toBe(false);
  });
});
