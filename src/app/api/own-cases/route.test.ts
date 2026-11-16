import { describe, expect, it, vi } from "vitest";
import { loadCourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, ownCases, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { openingEstimate } from "@/finance/own-case";
import { testDb } from "@/test/pglite";

// POST /api/own-cases (#107; review F25): what the Learner typed is bounded, a report link is http(s) only, and saving
// the same company's same report again updates its one note instead of adding a second.

const as = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => OWNER_LEARNER_ID }));

const { POST } = await import("./route");

const TATA = { company: "Tata Consumer Products", market: "IN", reportDate: "2025-04-23", industry: "food", sales: 17_618, operatingProfit: 2_413, taxPercent: 25.168, debt: 3_300, cash: 2_900, shares: 989_434_000, price: 1_090 };
const post = (inputs: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/own-cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inputs, estimate: openingEstimate("food") }) }));

async function spinePassed() {
  as.db = await testDb();
  for (const t of loadCourseMap().topics.filter((t) => t.stage === "spine")) await as.db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: t.id, step: "principle", status: "passed" });
}

describe("POST /api/own-cases", () => {
  it("refuses a company name past 200 characters, and a report link that is not http(s)", async () => {
    await spinePassed();
    expect((await post({ ...TATA, company: "x".repeat(201) })).status).toBe(400);
    expect((await post({ ...TATA, reportUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await post({ ...TATA, reportUrl: `https://example.com/${"a".repeat(2000)}` })).status).toBe(400);
    expect(await as.db.select().from(ownCases)).toEqual([]);
    expect((await post({ ...TATA, reportUrl: "https://www.tataconsumer.com/investors/annual-report-2024-25.pdf" })).status).toBe(200);
  });

  it("saving the same company's same report twice keeps one Own Case, with the newer figures", async () => {
    await spinePassed();
    const first = (await (await post(TATA)).json()) as { id: number };
    const again = (await (await post({ ...TATA, company: " Tata Consumer Products ", price: 1_100 })).json()) as { id: number; note: string };
    expect(again.id).toBe(first.id);
    expect(again.note).toContain("price ₹1,100 on 23 Apr 2025");
    expect(await as.db.select({ id: ownCases.id }).from(ownCases)).toEqual([{ id: first.id }]);
    const other = (await (await post({ ...TATA, reportDate: "2024-04-24" })).json()) as { id: number };
    expect(other.id).not.toBe(first.id);
  });
});
