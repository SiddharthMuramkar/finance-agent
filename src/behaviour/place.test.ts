import { expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { placeLearner } from "./place";
import { OWNER_LEARNER_ID } from "@/db/schema";

it("places a fresh Learner at a conversation Check past the explore step", async () => {
  const db = await testDb();
  const place = await placeLearner(db, loadCourseMap(), "check", OWNER_LEARNER_ID);
  expect(place.step).toBe("check");
  expect(place.check?.kind).toBe("conversation");
});
