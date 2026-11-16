import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { runAssignmentTurn } from "@/tutor/assignment-turn";
import { ASSIGNMENT_FLAG_QUESTION, gradeAssignmentFlag, prepareAssignmentLearner } from "./assignment-flag";

// Review G39: "the Assignment Tutor names a flagged input" (#110), on the real reply path (runAssignmentTurn: the range
// check's flags in the context, the reply checks V9 and V10, the one retry, code's fallback), graded by the same code the
// live behaviour run uses (run.live.ts, `npm run behaviour`). Here the model is scripted; the live run asks the real one.

const map = loadCourseMap();
const NOW = new Date("2026-11-16T10:00:00Z");
const text = (t: string) => ({ content: [{ type: "text", text: t }] });

async function turn(...replies: string[]) {
  const db = await testDb();
  await prepareAssignmentLearner(db, map, OWNER_LEARNER_ID, NOW);
  const { client, requests } = scriptedClient(replies.map(text));
  const result = await runAssignmentTurn({ db, client, learnerId: OWNER_LEARNER_ID, map, now: () => NOW }, ASSIGNMENT_FLAG_QUESTION);
  return { result, requests };
}

describe("the Assignment Tutor names a flagged input", () => {
  it("tells the model which input the range check flagged, with its dated yardstick", async () => {
    const { requests } = await turn("Your operating margin of 45% is far above.\nWhat story does it assume?");
    const sent = JSON.stringify(requests[0].messages);
    expect(sent).toContain("Your operating margin of 45% is far above Food Processing's 7.26% in India (Jan 2026): more than double it.");
    expect(sent).toMatch(/Name each flagged input in your reply/);
  });

  it("passes a reply that names the operating margin and asks what story it assumes", async () => {
    const { result } = await turn("Your operating margin of 45% is more than double Food Processing's 7.26%.\nWhat story about the company does that margin assume?");
    expect(gradeAssignmentFlag(result)).toMatchObject({ verdict: "pass" });
  });

  it("sends back a draft that names no flagged input (V10), telling the retry which one, and passes the retry that names it", async () => {
    const { result, requests } = await turn("Your figures are in.\nWhat story do they tell?", "Your operating margin of 45% stands out.\nWhat story does that margin assume?");
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[1].messages)).toContain('Name the flagged input (\\"operating margin\\")');
    const graded = gradeAssignmentFlag(result);
    expect(graded).toMatchObject({ verdict: "pass" });
    expect(graded.reasons).toContain("The first draft broke V10");
  });

  it("fails when only code's fallback line names the input: the Tutor did not", async () => {
    const { result } = await turn("Your figures are in.\nWhat story do they tell?", "Looks cheap.\nWhat story do they tell?");
    expect(result).toMatchObject({ ok: true, fallback: true, reply: expect.stringMatching(/operating margin/) });
    expect(gradeAssignmentFlag(result)).toMatchObject({ verdict: "fail", reasons: expect.stringContaining("fallback") });
  });

  it("fails a reply with an advice word or no story question", () => {
    const base = { ok: true as const, sessionId: 1, failed: [], fallback: false };
    expect(gradeAssignmentFlag({ ...base, reply: "Your operating margin of 45% is high; you should sell the shares. What story does it assume?" }).verdict).toBe("fail");
    expect(gradeAssignmentFlag({ ...base, reply: "Your operating margin of 45% is high." }).verdict).toBe("fail");
    expect(gradeAssignmentFlag({ ok: false, status: 403, error: "The Assignment opens once you pass the Spine." }).verdict).toBe("fail");
  });
});
