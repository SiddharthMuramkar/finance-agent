import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { hasProfile, loadProfile, profileBlock, profileInput, saveProfile } from "./profile";
import { OWNER_LEARNER_ID } from "@/db/schema";

const parse = (v: unknown) => profileInput.parse(v);

describe("Learner Profile", () => {
  it("trims each answer, treats an empty one as not shared, and allows every field to be missing", () => {
    expect(parse({ work: "  nurse  ", location: "", loan: "   ", savingFor: null })).toEqual({ work: "nurse", location: null, loan: null, savingFor: null });
    expect(parse({})).toEqual({ work: null, location: null, loan: null, savingFor: null });
  });

  it("accepts exactly 200 characters and refuses 201", () => {
    expect(parse({ work: "a".repeat(200) }).work).toHaveLength(200);
    expect(profileInput.safeParse({ work: "a".repeat(201) }).success).toBe(false);
    // Spaces around the text do not count toward the limit.
    expect(profileInput.safeParse({ work: ` ${"a".repeat(200)} ` }).success).toBe(true);
  });

  it("is one row: saving twice replaces the first", async () => {
    const db = await testDb();
    expect(await loadProfile(db, OWNER_LEARNER_ID)).toEqual({ work: null, location: null, loan: null, savingFor: null, offerDismissed: false });
    await saveProfile(db, parse({ work: "Nurse", location: "Pune" }), new Date(), OWNER_LEARNER_ID);
    await saveProfile(db, parse({ work: "Teacher" }), new Date(), OWNER_LEARNER_ID);
    expect(await loadProfile(db, OWNER_LEARNER_ID)).toMatchObject({ work: "Teacher", location: null });
  });

  it("has no profile when every answer is left empty", async () => {
    const db = await testDb();
    await saveProfile(db, parse({}), new Date(), OWNER_LEARNER_ID);
    expect(hasProfile(await loadProfile(db, OWNER_LEARNER_ID))).toBe(false);
  });

  it("builds the Tutor's block from the shared answers only, and none when nothing is shared", async () => {
    const db = await testDb();
    expect(await profileBlock(db, OWNER_LEARNER_ID)).toBeNull();
    await saveProfile(db, parse({ work: "Nurse", savingFor: "School fees" }), new Date(), OWNER_LEARNER_ID);
    const block = (await profileBlock(db, OWNER_LEARNER_ID))!;
    expect(block).toContain("Learner Profile");
    expect(block).toContain("only when the Learner asks how an idea applies to them");
    expect(block).toContain("never as advice");
    expect(block).toContain("- Work: Nurse");
    expect(block).toContain("- What you are saving for: School fees");
    expect(block).not.toContain("Where you live");
  });
});
