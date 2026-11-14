import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { learners, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { addInvite } from "./invites";
import { startOver } from "./learners";
import { learnerToken } from "./passcode";

/**
 * Who the owner is (ADR 0014): the Better Auth session whose active Learner is the `owner` Learner.
 * Better Auth is mocked at its seam, as in session.test.ts; the database and the Learner rules are real.
 */
const jar = vi.hoisted(() => ({ db: undefined as unknown as Db, cookie: undefined as string | undefined, account: null as null | { id: string; email: string; name: string } }));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && jar.cookie !== undefined ? { name, value: jar.cookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/auth/better-auth", () => {
  const on = (env: Record<string, string | undefined> = process.env) => Boolean(env.BETTER_AUTH_SECRET?.trim() && env.GOOGLE_CLIENT_ID?.trim());
  return {
    googleSignInOn: on,
    betterAuthOn: on,
    getAuth: (env: Record<string, string | undefined> = process.env) =>
      on(env) ? { api: { getSession: async () => (jar.account ? { session: { id: "s1" }, user: jar.account } : null) } } : null,
  };
});

const { isOwnerLearner, signedInOwner } = await import("./owner");

const SECRET = "test-secret";
const owner = { id: "u-owner", email: "owner@x.com", name: "Siddharth" };

/** The owner's account, linked to Learner 1 (named owner) as setup step 5 does. */
async function linkOwner() {
  await jar.db.insert(user).values({ ...owner, emailVerified: true });
  await addInvite(jar.db, owner.email, { learnerName: "owner" });
}

describe("signedInOwner", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.cookie = undefined;
    jar.account = null;
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "owner:owner-pass, tools:tools-pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-of-at-least-32-characters!");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is only the owner Learner through a Better Auth session", async () => {
    await linkOwner();
    jar.account = owner;
    const found = await signedInOwner();
    expect(found?.learner).toMatchObject({ id: 1, name: "owner", authUserId: owner.id });
    expect(found?.user).toEqual(owner);
    expect(isOwnerLearner(found!.learner)).toBe(true);
  });

  it("the passcode for Learner 1, a Learner named 'owner (2)' and a waiting user are not the owner", async () => {
    await linkOwner();
    // The owner's passcode opens Learner 1, but a passcode never counts.
    jar.cookie = await learnerToken(1, SECRET);
    expect(await signedInOwner()).toBeNull();
    jar.cookie = undefined;

    await jar.db.insert(user).values({ id: "u2", email: "o2@x.com", name: "owner", emailVerified: true });
    await jar.db.insert(learners).values({ name: "owner (2)", authUserId: "u2" });
    jar.account = { id: "u2", email: "o2@x.com", name: "owner" };
    expect(await signedInOwner()).toBeNull();

    await jar.db.insert(user).values({ id: "u3", email: "w@x.com", name: "Waiting", emailVerified: true });
    jar.account = { id: "u3", email: "w@x.com", name: "Waiting" };
    expect(await signedInOwner()).toBeNull();
  });

  it("Start over keeps the owner the owner", async () => {
    await linkOwner();
    jar.account = owner;
    const before = await signedInOwner();
    const fresh = await startOver(jar.db, before!.learner.id);
    expect((await signedInOwner())?.learner.id).toBe(fresh?.id);
  });

  it("nobody is the owner while sign-in is off", async () => {
    await linkOwner();
    jar.account = owner;
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(await signedInOwner()).toBeNull();
  });
});
