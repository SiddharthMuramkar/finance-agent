import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { learners } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import type { Identity } from "./identity";
import { startOver } from "./learners";
import { learnerToken } from "./passcode";

/**
 * `currentSignIn` (issue #33): the account first (a Clerk session, mocked at its seam `currentIdentity`, tested in
 * identity.test.ts), then the passcode cookie while the door is open, else signed out. The database is PGlite and the
 * Learner linking (`learnerForClerkUser`) is the real code.
 */
const jar = vi.hoisted(() => ({ db: undefined as unknown as Db, cookie: undefined as string | undefined, identity: null as Identity | null }));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && jar.cookie !== undefined ? { name, value: jar.cookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/auth/identity", () => ({ currentIdentity: async () => jar.identity }));

const { currentLearner, currentSignIn, signedInLearner } = await import("./session");

const SECRET = "test-secret";
const ASHA: Identity = { userId: "user_asha", email: "asha@x.com", firstName: "Asha", admin: false };

async function toolsLearner() {
  const [tools] = await jar.db.insert(learners).values({ name: "tools" }).returning();
  return tools;
}

describe("currentSignIn: the account first, the passcode second", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.cookie = undefined;
    jar.identity = null;
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "tools:tools-pass, test:test-pass");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("an account signs in as its Learner, made on its first request under its first name, and found after", async () => {
    jar.identity = ASHA;
    const first = await currentSignIn();
    expect(first).toMatchObject({ kind: "learner", via: "account", identity: ASHA, learner: { name: "Asha", clerkUserId: "user_asha" } });
    const again = await currentSignIn();
    expect(again.kind === "learner" && again.learner.id).toBe(first.kind === "learner" && first.learner.id);
  });

  it("a passcode sign-in is via passcode and carries no identity; nobody is signed out", async () => {
    const tools = await toolsLearner();
    jar.cookie = await learnerToken(tools.id, SECRET);
    expect(await currentSignIn()).toEqual({ kind: "learner", learner: tools, via: "passcode" });
    jar.cookie = undefined;
    expect(await currentSignIn()).toEqual({ kind: "signed-out" });
  });

  it("prefers the account when both are present", async () => {
    const tools = await toolsLearner();
    jar.cookie = await learnerToken(tools.id, SECRET);
    jar.identity = ASHA;
    expect((await currentLearner())?.name).toBe("Asha");
  });

  it("refuses an fa_access cookie for a Learner whose name is not on the passcode list", async () => {
    const [asha] = await jar.db.insert(learners).values({ name: "Asha" }).returning();
    jar.cookie = await learnerToken(asha.id, SECRET);
    expect(await currentLearner()).toBeNull();
  });

  it("refuses an fa_access cookie for a Clerk user's Learner, even under a listed name", async () => {
    const [test] = await jar.db.insert(learners).values({ name: "test", clerkUserId: "user_tess" }).returning();
    jar.cookie = await learnerToken(test.id, SECRET);
    expect(await currentSignIn()).toEqual({ kind: "signed-out" });
  });

  it("refuses every fa_access cookie while the passcode door is shut (production, or Vercel)", async () => {
    const tools = await toolsLearner();
    jar.cookie = await learnerToken(tools.id, SECRET);
    expect(await currentLearner()).not.toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(await currentSignIn()).toEqual({ kind: "signed-out" });
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "1");
    expect(await currentSignIn()).toEqual({ kind: "signed-out" });
  });

  it("an account keeps the same person across Start over: the fresh Learner is theirs", async () => {
    jar.identity = ASHA;
    const before = await currentLearner();
    const fresh = await startOver(jar.db, before!.id);
    expect(fresh?.clerkUserId).toBe("user_asha");
    expect((await currentLearner())?.id).toBe(fresh?.id);
  });
});

describe("signedInLearner", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.cookie = undefined;
    jar.identity = null;
  });

  it("sends a signed-out request to /sign-in", async () => {
    await expect(signedInLearner()).rejects.toThrow("NEXT_REDIRECT /sign-in");
  });

  it("returns the account's Learner", async () => {
    jar.identity = ASHA;
    expect((await signedInLearner()).clerkUserId).toBe("user_asha");
  });
});
