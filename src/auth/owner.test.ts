import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import type { Identity } from "./identity";
import { startOver } from "./learners";
import { learnerToken } from "./passcode";

/**
 * Who the admin is (issue #33): an account sign-in whose session token says `role: "admin"`. The account is mocked at
 * its seam (`currentIdentity`), as in session.test.ts; the database and the Learner rules are real.
 */
const jar = vi.hoisted(() => ({ db: undefined as unknown as Db, cookie: undefined as string | undefined, identity: null as Identity | null }));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && jar.cookie !== undefined ? { name, value: jar.cookie } : undefined) }),
}));
vi.mock("@/auth/identity", () => ({ currentIdentity: async () => jar.identity }));

const { signedInAdmin } = await import("./owner");

const SECRET = "test-secret";
const OWNER: Identity = { userId: "user_owner", email: "owner@x.com", firstName: "Siddharth", admin: true };

describe("signedInAdmin", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.cookie = undefined;
    jar.identity = null;
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "owner:owner-pass, tools:tools-pass");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is the account whose session says admin, with its Learner and identity", async () => {
    jar.identity = OWNER;
    const found = await signedInAdmin();
    expect(found?.identity).toEqual(OWNER);
    expect(found?.learner).toMatchObject({ name: "Siddharth", clerkUserId: "user_owner" });
  });

  it("an account without the claim, the passcode for the owner Learner and nobody are not the admin", async () => {
    jar.identity = { ...OWNER, userId: "user_asha", firstName: "Asha", admin: false };
    expect(await signedInAdmin()).toBeNull();
    jar.identity = null;
    // The owner's passcode opens Learner 1, but a passcode never counts.
    jar.cookie = await learnerToken(OWNER_LEARNER_ID, SECRET);
    expect(await signedInAdmin()).toBeNull();
    jar.cookie = undefined;
    expect(await signedInAdmin()).toBeNull();
  });

  it("Start over keeps the admin the admin, under the fresh Learner", async () => {
    jar.identity = OWNER;
    const before = await signedInAdmin();
    const fresh = await startOver(jar.db, before!.learner.id);
    expect((await signedInAdmin())?.learner.id).toBe(fresh?.id);
  });
});
