import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { E2E_PEOPLE } from "@/dev/e2e-identity";

/**
 * Who a Clerk user is, for /admin's Spend (issue #33): Clerk's Backend API is mocked at its seam (`clerkClient`), so no
 * key and no network is needed. In the browser test bed the registry of test people answers instead.
 */
type FakeUser = { id: string; primaryEmailAddress: { emailAddress: string } | null; emailAddresses: { emailAddress: string }[]; banned: boolean };
const clerk = vi.hoisted(() => ({
  users: [] as FakeUser[],
  calls: [] as { userId?: string[]; limit?: number }[],
  fail: false,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUserList: async (params: { userId?: string[]; limit?: number }) => {
        clerk.calls.push(params);
        if (clerk.fail) throw new Error("Clerk is down");
        const data = clerk.users.filter((u) => params.userId?.includes(u.id));
        return { data, totalCount: data.length };
      },
    },
  }),
}));

const { clerkDirectory, CLERK_LOOKUP_BATCH } = await import("./clerk-directory");

const KEYS = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", CLERK_SECRET_KEY: "sk_test_x" };
const user = (id: string, email: string | null, banned = false): FakeUser => ({
  id,
  primaryEmailAddress: email ? { emailAddress: email } : null,
  emailAddresses: email ? [{ emailAddress: email }] : [],
  banned,
});

beforeEach(() => {
  clerk.users = [];
  clerk.calls = [];
  clerk.fail = false;
  vi.stubEnv("E2E", "");
  for (const [name, value] of Object.entries(KEYS)) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("clerkDirectory", () => {
  it("reads each person's primary email and ban from Clerk", async () => {
    clerk.users = [user("user_asha", "asha@gmail.com"), user("user_spam", "spam@x.com", true)];
    const dir = await clerkDirectory(["user_asha", "user_spam"]);
    expect(dir.answered).toBe(true);
    expect(dir.people.get("user_asha")).toEqual({ email: "asha@gmail.com", banned: false });
    expect(dir.people.get("user_spam")).toEqual({ email: "spam@x.com", banned: true });
  });

  it("falls back to any email the user has when none is primary, and to null with none", async () => {
    clerk.users = [{ ...user("user_a", null), emailAddresses: [{ emailAddress: "a@x.com" }] }, user("user_b", null)];
    const dir = await clerkDirectory(["user_a", "user_b"]);
    expect(dir.people.get("user_a")?.email).toBe("a@x.com");
    expect(dir.people.get("user_b")?.email).toBeNull();
  });

  it("leaves out a user Clerk no longer has, while still counting as answered", async () => {
    clerk.users = [user("user_asha", "asha@gmail.com")];
    const dir = await clerkDirectory(["user_asha", "user_gone"]);
    expect(dir.answered).toBe(true);
    expect(dir.people.has("user_gone")).toBe(false);
  });

  it("asks for at most 100 ids at a time (Clerk's cap on the userId filter), each id once", async () => {
    expect(CLERK_LOOKUP_BATCH).toBe(100);
    const ids = Array.from({ length: 205 }, (_, i) => `user_${i}`);
    clerk.users = ids.map((id) => user(id, `${id}@x.com`));
    const dir = await clerkDirectory([...ids, "user_0", "user_1"]);
    expect(clerk.calls.map((c) => c.userId?.length)).toEqual([100, 100, 5]);
    for (const call of clerk.calls) expect(call.limit).toBe(call.userId?.length);
    expect(new Set(clerk.calls.flatMap((c) => c.userId))).toHaveProperty("size", 205);
    expect(dir.people.size).toBe(205);
  });

  it("does not call Clerk when there is nobody to look up", async () => {
    const dir = await clerkDirectory([]);
    expect(dir).toMatchObject({ answered: true });
    expect(dir.people.size).toBe(0);
    expect(clerk.calls).toEqual([]);
  });

  it("is unanswered, with nobody in it, when Clerk fails, so the page still draws", async () => {
    clerk.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dir = await clerkDirectory(["user_asha"]);
    expect(dir.answered).toBe(false);
    expect(dir.people.size).toBe(0);
  });

  it("is unanswered without calling Clerk while Clerk is off", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const dir = await clerkDirectory(["user_asha"]);
    expect(dir.answered).toBe(false);
    expect(clerk.calls).toEqual([]);
  });

  it("answers from the test people in the browser test bed, never calling Clerk", async () => {
    vi.stubEnv("E2E", "1");
    const { owner, asha } = E2E_PEOPLE;
    const dir = await clerkDirectory([owner.userId, asha.userId, "user_unknown"]);
    expect(dir.answered).toBe(true);
    expect(dir.people.get(owner.userId)).toEqual({ email: owner.email, banned: false });
    expect(dir.people.get(asha.userId)).toEqual({ email: asha.email, banned: false });
    expect(dir.people.has("user_unknown")).toBe(false);
    expect(clerk.calls).toEqual([]);
  });
});
