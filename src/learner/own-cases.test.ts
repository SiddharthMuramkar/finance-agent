import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { learners, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { openingEstimate, type OwnCaseInputs } from "@/finance/own-case";
import { testDb } from "@/test/pglite";
import { assignmentOpen, loadOwnCaseNotes, saveOwnCase } from "./own-cases";

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

  it("bad figures come back as a readable sentence and save nothing", async () => {
    const db = await testDb();
    await passSpine(db, OWNER_LEARNER_ID);
    expect(await saveOwnCase(db, map, OWNER_LEARNER_ID, { ...TATA, shares: 0 }, openingEstimate("food"), NOW)).toEqual({ ok: false, status: 400, error: "The share count must be above zero." });
    expect(await saveOwnCase(db, map, OWNER_LEARNER_ID, { ...TATA, industry: "banks" as never }, openingEstimate("food"), NOW)).toEqual({ ok: false, status: 400, error: "Pick the company's industry." });
    expect(await loadOwnCaseNotes(db, OWNER_LEARNER_ID)).toEqual([]);
  });

  it("a US Own Case's note is in dollars, from its 10-K (#113)", async () => {
    const db = await testDb();
    await passSpine(db, OWNER_LEARNER_ID);
    const apple: OwnCaseInputs = {
      company: "Apple Inc.",
      market: "US",
      reportDate: "2025-09-27",
      industry: "market",
      sales: 416_161,
      operatingProfit: 133_050,
      taxPercent: 21,
      debt: 98_657,
      cash: 35_934,
      shares: 14_776_353_000,
      price: 255.46,
    };
    const saved = await saveOwnCase(db, map, OWNER_LEARNER_ID, apple, openingEstimate("market", "US"), NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.note).toContain("Apple Inc., the US. Annual report of 27 Sep 2025. Industry: Any other firm (not a bank or insurer).");
    expect(saved.note).toContain("14,776,353,000 shares, price $255 on 27 Sep 2025");
    expect(saved.note).toContain("$1.43 of sales for each $1 invested");
    expect(saved.note).not.toContain("₹");
  });
});
