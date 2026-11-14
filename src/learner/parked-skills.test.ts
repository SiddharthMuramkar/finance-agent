import { describe, expect, it } from "vitest";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { parkedSkills, parkSkill, unparkSkill } from "./skill-state";

/** The Learner's parked Skills across Topics, for the Course Map and the Navigator (ticket #245). */
describe("parkedSkills", () => {
  it("lists only this Learner's parked Skills in the Topics asked for, with when each comes back", async () => {
    const db = await testDb();
    const now = new Date("2026-11-04T10:00:00Z");
    const [other] = await db.insert(learners).values({ name: "second" }).returning();
    await parkSkill(db, OWNER_LEARNER_ID, "pct-demo", "pts", now);
    await parkSkill(db, OWNER_LEARNER_ID, "pct-demo", "bp-to-pts", now);
    await unparkSkill(db, OWNER_LEARNER_ID, "pct-demo", "bp-to-pts", now);
    await parkSkill(db, OWNER_LEARNER_ID, "elsewhere", "x", now);
    await parkSkill(db, other.id, "pct-demo", "wording", now);

    expect(await parkedSkills(db, OWNER_LEARNER_ID, ["pct-demo"])).toEqual({ "pct-demo": { pts: new Date("2026-11-05T06:00:00Z") } });
  });

  it("reads nothing when no Topic is asked for", async () => {
    // No database at all: the query is skipped, as it is in production before any Topic is converted.
    expect(await parkedSkills(undefined as never, OWNER_LEARNER_ID, [])).toEqual({});
  });
});
