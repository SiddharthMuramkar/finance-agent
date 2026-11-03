import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseMap } from "@/course/map";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { openQuiz } from "@/learner/quiz";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient } from "@/test/scripted-client";
import { listSessions } from "@/tutor/transcript";
import { runTutorTurn } from "@/tutor/turn";

/**
 * Any id the browser sends must belong to the signed-in Learner, or the answer is 404 (spec #119,
 * "Learners and sign-in"). The owner builds up a Session, a quiz attempt, a note line and a saved item
 * through real Tutor Turns and routes; then a second Learner sends those ids to the same routes and the
 * Session page. Scripted Tutor client, in-memory Postgres with the real migrations; only the database,
 * the Course Map and the request's current Learner are swapped in.
 */

// The request's database, Course Map and current Learner. presentValueOnly() reads the real Course Map, so the map is unset until each test.
const as = vi.hoisted(() => ({ db: undefined as unknown as Db, map: undefined as CourseMap | undefined, learnerId: 1 }));

vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => {
  const learner = async () => ({ id: as.learnerId, name: `learner-${as.learnerId}`, archivedAt: null, showDeveloperDetails: false, createdAt: new Date() });
  return { currentLearnerId: async () => as.learnerId, isSignedIn: async () => true, currentLearner: learner, signedInLearner: learner };
});
vi.mock("@/course/map", async (original) => {
  const real = await original<typeof import("@/course/map")>();
  return { ...real, loadCourseMap: () => as.map ?? real.loadCourseMap() };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const notes = await import("./api/notes/route");
const saved = await import("./api/notes/saved/route");
const quiz = await import("./api/quiz/route");
const { default: SessionPage } = await import("./sessions/[id]/page");

const json = (method: string, body: unknown) => new Request("https://app.example/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function drain(events: AsyncIterable<unknown>) {
  for await (const _ of events) void _;
}

/** The owner's things: a Session with one reply, an open quiz attempt, a note line and a saved reply. */
async function ownersThings() {
  const map = as.map!;
  as.learnerId = OWNER_LEARNER_ID;
  const { client } = scriptedClient([{ content: [{ type: "text", text: "The owner's reply." }] }]);
  await drain(runTutorTurn({ db: as.db, client, map, learnerId: OWNER_LEARNER_ID }, "The owner's question"));
  const [session] = await listSessions(as.db, OWNER_LEARNER_ID);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(as.db, map, step, new Date(), OWNER_LEARNER_ID);
  const attempt = (await openQuiz(as.db, map, new Date(), OWNER_LEARNER_ID))!;
  const line = (await (await notes.POST(json("POST", { topicId: "present-value", text: "The owner's line" }))).json()) as { id: number };
  const item = (await (await saved.POST(json("POST", { kind: "reply", sessionId: session.id, turnSeq: 0 }))).json()) as { id: number };
  return { sessionId: session.id, attemptId: attempt.attemptId, lineId: line.id, itemId: item.id };
}

describe("another Learner's ids answer 404", () => {
  beforeEach(async () => {
    as.db = await testDb();
    as.map = presentValueOnly();
  });

  it("the owner's Session page, quiz attempt, note line, saved item and Session to save from", async () => {
    const owners = await ownersThings();
    expect(owners.lineId).toEqual(expect.any(Number));
    expect(owners.itemId).toEqual(expect.any(Number));
    const [second] = await as.db.insert(learners).values({ name: "second" }).returning();
    as.learnerId = second.id;

    await expect(SessionPage({ params: Promise.resolve({ id: String(owners.sessionId) }) })).rejects.toMatchObject({ digest: expect.stringMatching(/;404$/) });
    expect((await quiz.POST(json("POST", { attemptId: owners.attemptId, answers: {} }))).status).toBe(404);
    expect((await notes.PATCH(json("PATCH", { id: owners.lineId, text: "Changed" }))).status).toBe(404);
    expect((await notes.DELETE(json("DELETE", { id: owners.lineId }))).status).toBe(404);
    expect((await saved.DELETE(json("DELETE", { id: owners.itemId }))).status).toBe(404);
    expect((await saved.POST(json("POST", { kind: "reply", sessionId: owners.sessionId, turnSeq: 0 }))).status).toBe(404);
    expect((await saved.POST(json("POST", { kind: "widget", sessionId: owners.sessionId, widgetIndex: -1 }))).status).toBe(404);

    // The owner still has every one of them, unchanged.
    as.learnerId = OWNER_LEARNER_ID;
    await expect(SessionPage({ params: Promise.resolve({ id: String(owners.sessionId) }) })).resolves.toBeTruthy();
    expect((await notes.PATCH(json("PATCH", { id: owners.lineId, text: "Still mine" }))).status).toBe(200);
    expect((await saved.DELETE(json("DELETE", { id: owners.itemId }))).status).toBe(200);
    expect((await quiz.POST(json("POST", { attemptId: owners.attemptId, answers: {} }))).status).toBe(200);
  });
});
