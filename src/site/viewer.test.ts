import { describe, expect, it, vi } from "vitest";
import type { SignIn } from "@/auth/session";
import type { Learner } from "@/auth/learners";
import { viewerFor } from "./viewer";

// Signal spec §7.1's three viewer states, from the app's sign-in states. Nothing here may read the database.
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("no database in this test");
  },
}));
vi.mock("@/auth/session", () => ({ currentSignIn: async () => ({ kind: "signed-out" }) }));

const learner = { id: 7, name: "tools" } as Learner;
const user = { id: "u1", email: "a@example.com", name: "Asha" };
const noButton = async () => {
  throw new Error("a visitor or applicant read a Learner");
};

describe("the site's viewer states", () => {
  it("is a visitor when signed out or denied, and reads no Learner", async () => {
    expect(await viewerFor({ kind: "signed-out" }, noButton)).toEqual({ state: "visitor" });
    expect(await viewerFor({ kind: "denied", user }, noButton)).toEqual({ state: "visitor" });
  });

  it("is an applicant while the account waits for the owner", async () => {
    expect(await viewerFor({ kind: "waiting", user }, noButton)).toEqual({ state: "applicant" });
  });

  it("is a member with their Continue button and name", async () => {
    const button = vi.fn(async () => ({ kind: "resume" as const, topic: "Present value" }));
    const account: SignIn = { kind: "learner", learner, via: "account", user };
    expect(await viewerFor(account, button)).toEqual({ state: "member", button: { kind: "resume", topic: "Present value" }, name: "Asha" });
    expect(button).toHaveBeenCalledWith(7);
    expect(await viewerFor({ kind: "learner", learner, via: "passcode" }, button)).toMatchObject({ state: "member", name: "tools" });
  });
});
