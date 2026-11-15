import { describe, expect, it, vi } from "vitest";
import type { SignIn } from "@/auth/session";
import type { Learner } from "@/auth/learners";
import { viewerFor } from "./viewer";

// Signal spec §7.1's viewer states, from the app's sign-in states (issue #33: visitor and member; Clerk's Waitlist holds
// the prototype's applicant outside the app). Nothing here may read the database.
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("no database in this test");
  },
}));
vi.mock("@/auth/session", () => ({ currentSignIn: async () => ({ kind: "signed-out" }) }));

const learner = { id: 7, name: "Asha" } as Learner;
const identity = { userId: "user_1", email: "a@example.com", firstName: "Asha", admin: false };
const noButton = async () => {
  throw new Error("a visitor read a Learner");
};

describe("the site's viewer states", () => {
  it("is a visitor when signed out, and reads no Learner", async () => {
    expect(await viewerFor({ kind: "signed-out" }, noButton)).toEqual({ state: "visitor" });
  });

  it("is a member with their Continue button and their Learner's name, by an account or the passcode", async () => {
    const button = vi.fn(async () => ({ kind: "resume" as const, topic: "Present value" }));
    const account: SignIn = { kind: "learner", learner, via: "account", identity };
    expect(await viewerFor(account, button)).toEqual({ state: "member", button: { kind: "resume", topic: "Present value" }, name: "Asha" });
    expect(button).toHaveBeenCalledWith(7);
    expect(await viewerFor({ kind: "learner", learner: { ...learner, name: "tools" }, via: "passcode" }, button)).toMatchObject({ state: "member", name: "tools" });
  });
});
