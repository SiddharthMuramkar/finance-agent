import { afterAll, describe, expect, it } from "vitest";
import { learners, ownCases, topicProgress } from "./schema";
import { closeBeforeExpand, databaseBefore, migrateToLatest } from "@/test/before-expand";

/** The add-only migration for Own Cases (spec #68, ADR 0016): a new table, and every row from before kept as it was. */

afterAll(closeBeforeExpand);

describe("the Own Cases migration", () => {
  it("keeps the Learners' rows and starts every Learner with no Own Case", async () => {
    const { client, db } = await databaseBefore("_own_cases");
    await client.exec(`INSERT INTO topic_progress (learner_id, topic_id, step, status) VALUES (1, 'spine-01-worth', 'check', 'passed');`);
    const before = await db.select().from(learners);

    await migrateToLatest(client);

    expect(await db.select().from(learners)).toEqual(before);
    expect(await db.select({ topicId: topicProgress.topicId, status: topicProgress.status }).from(topicProgress)).toEqual([{ topicId: "spine-01-worth", status: "passed" }]);
    expect(await db.select().from(ownCases)).toEqual([]);

    const [row] = await db
      .insert(ownCases)
      .values({ learnerId: 1, company: "Coffee Day Enterprises", market: "IN", reportDate: "2015-10-21", inputs: { sales: 2479.36 }, estimate: { growthPercent: 15 } })
      .returning();
    expect(row).toMatchObject({ company: "Coffee Day Enterprises", reportDate: "2015-10-21", inputs: { sales: 2479.36 }, note: null });
    // Every Own Case is one Learner's: a row with no Learner, or a Learner that does not exist, is refused.
    await expect(client.exec(`INSERT INTO own_cases (company, market, report_date, inputs, estimate) VALUES ('x', 'IN', '2020-03-31', '{}', '{}')`)).rejects.toThrow();
    await expect(db.insert(ownCases).values({ learnerId: 99_999, company: "x", market: "IN", reportDate: "2020-03-31", inputs: {}, estimate: {} })).rejects.toThrow();
  });
});
