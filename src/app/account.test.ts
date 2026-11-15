import { describe, expect, it } from "vitest";
import type { Learner } from "@/auth/learners";
import { accountFor } from "./account";

const learner = (name: string) => ({ id: 7, name }) as Learner;
const identity = (over: Partial<{ email: string | null; admin: boolean }> = {}) => ({ userId: "user_1", email: "asha@example.com", firstName: "Asha", admin: false, ...over });

describe("accountFor (the header's account menu and the Settings Account card, issue #33)", () => {
  it("an account shows the email its session carries", () => {
    expect(accountFor({ kind: "learner", learner: learner("Asha"), via: "account", identity: identity() })).toEqual({ name: "Asha", email: "asha@example.com" });
  });

  it("an account whose token carries no email shows only the name, and never says passcode", () => {
    expect(accountFor({ kind: "learner", learner: learner("Asha"), via: "account", identity: identity({ email: null }) })).toEqual({ name: "Asha" });
  });

  it("a passcode Learner has no email, and is marked so Settings says Signed in with a passcode", () => {
    expect(accountFor({ kind: "learner", learner: learner("Ravi"), via: "passcode" })).toEqual({ name: "Ravi", passcode: true });
  });

  it("only an account whose session says admin gets the Admin row", () => {
    expect(accountFor({ kind: "learner", learner: learner("owner"), via: "account", identity: identity({ admin: true }) })).toEqual({
      name: "owner",
      email: "asha@example.com",
      admin: true,
    });
    // The owner's Learner name opens nothing: a passcode for "owner" is no admin.
    expect(accountFor({ kind: "learner", learner: learner("owner"), via: "passcode" })).not.toHaveProperty("admin");
  });
});
