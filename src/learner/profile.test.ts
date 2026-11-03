import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { dismissProfileOffer, hasProfile, loadProfile, profileBlock, profileInput, saveProfile, shouldOfferProfile } from "./profile";

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
    expect(await loadProfile(db)).toEqual({ work: null, location: null, loan: null, savingFor: null, offerDismissed: false });
    await saveProfile(db, parse({ work: "Nurse", location: "Pune" }));
    await saveProfile(db, parse({ work: "Teacher" }));
    expect(await loadProfile(db)).toMatchObject({ work: "Teacher", location: null });
  });

  it("offers the card until the Learner saves or says Not now, and then never again", async () => {
    const db = await testDb();
    expect(shouldOfferProfile(await loadProfile(db))).toBe(true);
    await dismissProfileOffer(db);
    expect(shouldOfferProfile(await loadProfile(db))).toBe(false);

    const other = await testDb();
    await saveProfile(other, parse({}));
    expect(hasProfile(await loadProfile(other))).toBe(false);
    expect(shouldOfferProfile(await loadProfile(other))).toBe(false);
  });

  it("Not now keeps answers that were already saved", async () => {
    const db = await testDb();
    await saveProfile(db, parse({ loan: "Car loan" }));
    await dismissProfileOffer(db);
    expect((await loadProfile(db)).loan).toBe("Car loan");
  });

  it("builds the Tutor's block from the shared answers only, and none when nothing is shared", async () => {
    const db = await testDb();
    expect(await profileBlock(db)).toBeNull();
    await saveProfile(db, parse({ work: "Nurse", savingFor: "School fees" }));
    const block = (await profileBlock(db))!;
    expect(block).toContain("Learner Profile");
    expect(block).toContain("only to choose everyday examples");
    expect(block).toContain("never as advice");
    expect(block).toContain("- Work: Nurse");
    expect(block).toContain("- What you are saving for: School fees");
    expect(block).not.toContain("Where you live");
  });
});
