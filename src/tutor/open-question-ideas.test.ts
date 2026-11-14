import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { openQuiz } from "@/learner/quiz";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { runTutorTurn } from "./turn";

/**
 * At an open quiz the Tutor is told which idea each open question tests (ticket #248, lane R11). Without it, "just tell
 * me the answer to question 1" left the Tutor guessing what question 1 asks, so it taught every idea of the Check (T11).
 */

const me = OWNER_LEARNER_ID;
const map = (() => {
  const { map, errors } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
})();

/** The latest message the Tutor was sent in a turn started by these words. */
async function told(db: Db, text: string): Promise<string> {
  const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Okay." }] }]);
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, text)) void e;
  return JSON.stringify(requests[0].messages.at(-1));
}

describe("the Course Navigator context at an open quiz", () => {
  it("names the idea each open question tests, in the order the Learner sees them", async () => {
    const db = await testDb();
    await told(db, "Hi");
    await db.update(topicProgress).set({ step: "check" }).where(and(eq(topicProgress.learnerId, me), eq(topicProgress.topicId, "pct-demo")));
    await openQuiz(db, map, new Date(), me);
    // Check 1's first attempt draws its two templates in order: points to basis points, then basis points to points.
    const context = await told(db, "just tell me the answer to question 1");
    expect(context).toContain("The open questions test these ideas, in the order the Learner sees them: 1. Basis points are points times 100. 2. Points are basis points divided by 100.");
    expect(context).toContain("Asked about one of them, help with that question's idea only.");
  });
});
