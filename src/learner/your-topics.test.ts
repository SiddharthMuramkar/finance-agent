import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { learners, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { loadYourTopics } from "./your-topics";

// Settings → Your Topics lists only the Topics with progress, in course order, and only the Learner's own.

const map = loadCourseMap();

describe("Your Topics", () => {
  it("lists the Topics with progress in course order, with their status, and nothing of another Learner's", async () => {
    const db = await testDb();
    const [first, second, third] = map.topics.map((t) => t.id);
    const [other] = await db.insert(learners).values({ name: "second" }).returning();
    await db.insert(topicProgress).values([
      { learnerId: OWNER_LEARNER_ID, topicId: third, step: "concept", status: "in_progress" },
      { learnerId: OWNER_LEARNER_ID, topicId: first, step: "principle", status: "passed" },
      { learnerId: other.id, topicId: second, step: "concept", status: "in_progress" },
    ]);
    expect(await loadYourTopics(db, map, OWNER_LEARNER_ID)).toEqual([
      { id: first, title: map.topic(first)!.title, status: "passed" },
      { id: third, title: map.topic(third)!.title, status: "in_progress" },
    ]);
  });

  it("is empty before any Topic is started", async () => {
    expect(await loadYourTopics(await testDb(), map, OWNER_LEARNER_ID)).toEqual([]);
  });
});
