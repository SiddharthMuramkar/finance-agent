import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { cleanName, learnerForClerkUser, nameFromEmail, reservedNames } from "./clerk-learner";
import { startOver } from "./learners";

/** Linking a Clerk user to their Learner (issue #33), on PGlite with the real unique indexes. */
const RESERVED = reservedNames({ PASSCODES: "tools:t, Test:x" });

const activeFor = async (db: Awaited<ReturnType<typeof testDb>>, clerkUserId: string) =>
  db
    .select()
    .from(learners)
    .where(and(eq(learners.clerkUserId, clerkUserId), isNull(learners.archivedAt)));

describe("learnerForClerkUser", () => {
  it("makes a Learner under the first name on the first request, and finds the same one after", async () => {
    const db = await testDb();
    const made = await learnerForClerkUser(db, { userId: "user_asha", firstName: "Asha" }, RESERVED);
    expect(made).toMatchObject({ name: "Asha", clerkUserId: "user_asha", authUserId: null, archivedAt: null });
    expect((await learnerForClerkUser(db, { userId: "user_asha", firstName: "Renamed" }, RESERVED)).id).toBe(made.id);
  });

  it("takes '<name> (2)' when another active Learner has the name, and skips reserved names in any case", async () => {
    const db = await testDb();
    await db.insert(learners).values({ name: "Asha" });
    expect((await learnerForClerkUser(db, { userId: "user_a2", firstName: "Asha" }, RESERVED)).name).toBe("Asha (2)");
    expect((await learnerForClerkUser(db, { userId: "user_o", firstName: "OWNER" }, RESERVED)).name).toBe("OWNER (2)");
    expect((await learnerForClerkUser(db, { userId: "user_t", firstName: "tools" }, RESERVED)).name).toBe("tools (2)");
    expect((await learnerForClerkUser(db, { userId: "user_x", firstName: "test" }, RESERVED)).name).toBe("test (2)");
  });

  it("with no first name, takes the name from the email address, as the email link did before Clerk", async () => {
    // Production signs in by email link only, and its sign-up asks for no name, so the token's first_name is empty.
    const db = await testDb();
    const made = await learnerForClerkUser(db, { userId: "user_k", firstName: null, email: "asha.kumar+x@icloud.com" }, RESERVED);
    expect(made).toMatchObject({ name: "Asha Kumar", clerkUserId: "user_k" });
    // The first name still wins when the token has one, and the email's name follows makeLearner's rules.
    expect((await learnerForClerkUser(db, { userId: "user_f", firstName: "Asha", email: "someone@x.com" }, RESERVED)).name).toBe("Asha");
    expect((await learnerForClerkUser(db, { userId: "user_k2", firstName: null, email: "asha_kumar@x.com" }, RESERVED)).name).toBe("Asha Kumar (2)");
    expect((await learnerForClerkUser(db, { userId: "user_t2", firstName: null, email: "tools@x.com" }, RESERVED)).name).toBe("Tools (2)");
  });

  it("is never null: no first name and no usable email, or every suffix taken, gives 'Learner <hex>'", async () => {
    const db = await testDb();
    const nameless = await learnerForClerkUser(db, { userId: "user_n", firstName: null }, RESERVED);
    expect(nameless.name).toMatch(/^Learner [0-9a-f]{8}$/);
    for (const email of [null, "+tag@x.com", "@x.com"]) {
      const made = await learnerForClerkUser(db, { userId: `user_e${String(email)}`, firstName: null, email }, RESERVED);
      expect(made.name, String(email)).toMatch(/^Learner [0-9a-f]{8}$/);
    }
    const everySuffix = new Set(["ravi", ...Array.from({ length: 49 }, (_, i) => `ravi (${i + 2})`)]);
    const taken = await learnerForClerkUser(db, { userId: "user_r", firstName: "Ravi" }, everySuffix);
    expect(taken.name).toMatch(/^Learner [0-9a-f]{8}$/);
    expect(taken.clerkUserId).toBe("user_r");
  });

  it("makes one Learner when two first requests race", async () => {
    const db = await testDb();
    const both = await Promise.all([1, 2, 3].map(() => learnerForClerkUser(db, { userId: "user_race", firstName: "Mia" }, RESERVED)));
    expect(new Set(both.map((l) => l.id)).size).toBe(1);
    expect(await activeFor(db, "user_race")).toHaveLength(1);
  });

  it("after Start over, finds the fresh Learner, which keeps the link and the name", async () => {
    const db = await testDb();
    const first = await learnerForClerkUser(db, { userId: "user_s", firstName: "Sam" }, RESERVED);
    const fresh = await startOver(db, first.id);
    expect(fresh).toMatchObject({ name: "Sam", clerkUserId: "user_s" });
    expect((await learnerForClerkUser(db, { userId: "user_s", firstName: "Sam" }, RESERVED)).id).toBe(fresh!.id);
  });
});

describe("nameFromEmail", () => {
  it("makes a display name from the address's own part, without a +tag, or null when nothing is left", () => {
    expect(nameFromEmail("asha.kumar+x@icloud.com")).toBe("Asha Kumar");
    expect(nameFromEmail("j_doe-99@x.com")).toBe("J Doe 99");
    expect(nameFromEmail("NOOR@x.com")).toBe("Noor");
    expect(nameFromEmail("+tag@x.com")).toBeNull();
    expect(nameFromEmail("...@x.com")).toBeNull();
    expect(nameFromEmail(null)).toBeNull();
  });
});

describe("cleanName", () => {
  it("collapses spaces, keeps at most 60 characters, and is never empty", () => {
    expect(cleanName("  Asha \n K ")).toBe("Asha K");
    expect(cleanName("x".repeat(80))).toHaveLength(60);
    expect(cleanName("   ")).toBe("Learner");
    expect(cleanName(null)).toBe("Learner");
  });
});
