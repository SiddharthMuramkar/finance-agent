import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { learners, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { addInvite } from "./invites";
import { learnerToken } from "./passcode";

/**
 * `currentLearner` reads Better Auth first and the passcode cookie second (C1b, ADR 0011). Better Auth
 * is mocked at its seam (`getAuth`/`api.getSession`, as other tests mock `@/auth/session`), the
 * database is PGlite, and Learner linking (`learnerForAuthUser`) is the real code.
 */
const jar = vi.hoisted(() => ({ db: undefined as unknown as Db, cookie: undefined as string | undefined, googleUser: null as null | { id: string; email: string; name: string } }));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && jar.cookie !== undefined ? { name, value: jar.cookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/auth/better-auth", () => {
  const on = (env: Record<string, string | undefined> = process.env) => Boolean(env.BETTER_AUTH_SECRET?.trim() && env.GOOGLE_CLIENT_ID?.trim());
  return {
    googleSignInOn: on,
    getAuth: (env: Record<string, string | undefined> = process.env) =>
      on(env) ? { api: { getSession: async () => (jar.googleUser ? { session: { id: "s1" }, user: jar.googleUser } : null) } } : null,
  };
});

const { currentLearner } = await import("./session");

const SECRET = "test-secret";

async function toolsLearner() {
  const [tools] = await jar.db.insert(learners).values({ name: "tools" }).returning();
  return tools;
}

describe("currentLearner: Better Auth first, passcode second", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.cookie = undefined;
    jar.googleUser = null;
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "tools:tools-pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-of-at-least-32-characters!");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns the Google user's Learner, made from their invite on first use", async () => {
    await jar.db.insert(user).values({ id: "g1", name: "Asha", email: "a@x.com", emailVerified: true });
    await addInvite(jar.db, "a@x.com");
    jar.googleUser = { id: "g1", email: "a@x.com", name: "Asha" };
    const learner = await currentLearner();
    expect(learner?.name).toBe("Asha");
    expect(learner?.authUserId).toBe("g1");
    expect((await currentLearner())?.id).toBe(learner?.id);
  });

  it("falls back to fa_access only when there is no Better Auth session", async () => {
    const tools = await toolsLearner();
    jar.cookie = await learnerToken(tools.id, SECRET);
    expect((await currentLearner())?.id).toBe(tools.id);
  });

  it("is null for a Google session with no Learner while closed, even beside a valid fa_access", async () => {
    await jar.db.insert(user).values({ id: "g2", name: "Stranger", email: "s@x.com", emailVerified: true });
    jar.googleUser = { id: "g2", email: "s@x.com", name: "Stranger" };
    const tools = await toolsLearner();
    jar.cookie = await learnerToken(tools.id, SECRET);
    expect(await currentLearner()).toBeNull();
  });

  it("returns a Google-linked Learner although PASSCODES lists only tools", async () => {
    await jar.db.insert(user).values({ id: "g1", name: "Asha", email: "a@x.com", emailVerified: true });
    const [asha] = await jar.db.insert(learners).values({ name: "Asha", authUserId: "g1" }).returning();
    jar.googleUser = { id: "g1", email: "a@x.com", name: "Asha" };
    expect((await currentLearner())?.id).toBe(asha.id);
  });

  it("refuses an fa_access cookie for a Learner whose name is not on the passcode list", async () => {
    const [asha] = await jar.db.insert(learners).values({ name: "Asha" }).returning();
    jar.cookie = await learnerToken(asha.id, SECRET);
    expect(await currentLearner()).toBeNull();
  });

  it("prefers the Google Learner when both cookies are present", async () => {
    await jar.db.insert(user).values({ id: "g1", name: "Asha", email: "a@x.com", emailVerified: true });
    const [asha] = await jar.db.insert(learners).values({ name: "Asha", authUserId: "g1" }).returning();
    const tools = await toolsLearner();
    jar.cookie = await learnerToken(tools.id, SECRET);
    jar.googleUser = { id: "g1", email: "a@x.com", name: "Asha" };
    expect((await currentLearner())?.id).toBe(asha.id);
  });

  it("skips Better Auth entirely while Google sign-in is off", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    jar.googleUser = { id: "g1", email: "a@x.com", name: "Asha" };
    expect(await currentLearner()).toBeNull();
    const tools = await toolsLearner();
    jar.cookie = await learnerToken(tools.id, SECRET);
    expect((await currentLearner())?.id).toBe(tools.id);
  });
});
