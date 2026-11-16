import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { learners, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { openingEstimate, valueOwnCase, type OwnCaseInputs } from "@/finance/own-case";
import { testDb } from "@/test/pglite";
import { assignmentOpen, loadOwnCaseNotes, ownCaseNote, saveOwnCase } from "./own-cases";

const map = loadCourseMap();
const NOW = new Date("2026-11-16T10:00:00Z");

const TATA: OwnCaseInputs = {
  company: "Tata Consumer Products",
  market: "IN",
  reportDate: "2025-03-31",
  industry: "food",
  sales: 17_618,
  operatingProfit: 2_413,
  taxPercent: 25,
  debt: 3_300,
  cash: 2_900,
  shares: 989_434_000,
  price: 1_090,
};

async function passSpine(db: Db, learnerId: number) {
  for (const t of map.topics.filter((t) => t.stage === "spine")) await db.insert(topicProgress).values({ learnerId, topicId: t.id, step: "principle", status: "passed" });
}

describe("Own Cases", () => {
  it("open only once the Spine is passed", async () => {
    const db = await testDb();
    expect(await assignmentOpen(db, map, OWNER_LEARNER_ID)).toBe(false);
    expect(await saveOwnCase(db, map, OWNER_LEARNER_ID, TATA, openingEstimate("food"), NOW)).toEqual({ ok: false, status: 403, error: "The Assignment opens once you pass the Spine." });
    await passSpine(db, OWNER_LEARNER_ID);
    expect(await assignmentOpen(db, map, OWNER_LEARNER_ID)).toBe(true);
  });

  it("a saved Own Case is valued and its one-page note kept for its Learner alone", async () => {
    const db = await testDb();
    await passSpine(db, OWNER_LEARNER_ID);
    const saved = await saveOwnCase(db, map, OWNER_LEARNER_ID, TATA, openingEstimate("food"), NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.note).toContain("Tata Consumer Products, India. Annual report of 31 Mar 2025. Industry: Food processors.");
    expect(saved.note).toContain("price ₹1,090 on 31 Mar 2025");
    expect(saved.note).toContain("The engine's value: ");
    expect(saved.note).not.toMatch(/your story|cheap|dear|undervalued|overvalued|\bbuy\b|\bsell\b/i);

    const notes = await loadOwnCaseNotes(db, OWNER_LEARNER_ID);
    expect(notes).toEqual([expect.objectContaining({ id: saved.id, company: "Tata Consumer Products", reportDate: "2025-03-31", note: saved.note })]);
    const [other] = await db.insert(learners).values({ name: "other" }).returning();
    expect(await loadOwnCaseNotes(db, other.id)).toEqual([]);
  });

  it("a value at or below zero reads ₹0 with nothing left for shareholders, never a negative price (F06)", () => {
    // Debt far above what the business is worth: the engine's value a share is below zero.
    const deep = { ...TATA, debt: 900_000 };
    const value = valueOwnCase(deep, openingEstimate("food"), NOW);
    if (!value.ok) throw new Error(value.error);
    expect(value.valuePerShare).toBeLessThan(0);
    const note = ownCaseNote(deep, openingEstimate("food"), value);
    expect(note).toContain("The engine's value: ₹0 a share, beside a price of ₹1,090 on 31 Mar 2025. Lenders take everything: nothing is left for shareholders.");
    expect(note).not.toMatch(/-₹/);
  });

  it("says in the note that employee stock options were not entered (F26)", async () => {
    const db = await testDb();
    await passSpine(db, OWNER_LEARNER_ID);
    const saved = await saveOwnCase(db, map, OWNER_LEARNER_ID, TATA, openingEstimate("food"), NOW);
    expect(saved.ok && saved.note).toContain("Employee stock options are not entered: the engine counts none.");
  });

  it("bad figures come back as a readable sentence and save nothing", async () => {
    const db = await testDb();
    await passSpine(db, OWNER_LEARNER_ID);
    expect(await saveOwnCase(db, map, OWNER_LEARNER_ID, { ...TATA, shares: 0 }, openingEstimate("food"), NOW)).toEqual({ ok: false, status: 400, error: "The share count must be above zero." });
    expect(await saveOwnCase(db, map, OWNER_LEARNER_ID, { ...TATA, industry: "banks" as never }, openingEstimate("food"), NOW)).toEqual({ ok: false, status: 400, error: "Pick the company's industry." });
    expect(await loadOwnCaseNotes(db, OWNER_LEARNER_ID)).toEqual([]);
  });
});
