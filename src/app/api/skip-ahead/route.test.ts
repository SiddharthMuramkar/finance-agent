import { describe, expect, it, vi } from "vitest";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted, loadProgress } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { startTurn } from "@/tutor/turn-status";

/**
 * Skip ahead through the route the Topic Start card calls (spec 2026-11-12 A8): `{ topicId }` opens the quiz without its
 * key, `{ attemptId, answers }` marks it on the server; refused while a turn is running, like choosing a Topic.
 */

const as = vi.hoisted(() => ({ db: undefined as unknown as Db, map: undefined as unknown as CourseMap }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => OWNER_LEARNER_ID }));
vi.mock("@/course/map", async (original) => {
  const real = await original<typeof import("@/course/map")>();
  return { ...real, loadCourseMap: () => as.map };
});

const { POST } = await import("./route");

const question = (n: number) => `
  - id: q${n}
    prompt: Question ${n}?
    choices: [{ id: a, text: Right ${n} }, { id: b, text: Wrong ${n} }]
    answer: a
    explanation: Because ${n}.
    source: Source ${n}`;

const TOPIC = `
id: t
title: T
stage: foundation
path: 1
cases: [{ id: c, title: C, asOf: 2018-10-24, story: S, reveal: R }]
concept: C
principle: P
questions:${[1, 2, 3, 4].map(question).join("")}
checks:
  - id: quiz
    kind: quiz
    questions: [q1, q2, q3, q4]
    passRule: { correct: 2 }
`;

async function setUp() {
  as.db = await testDb();
  as.map = parseCourseMap([{ name: "t.yaml", text: TOPIC }]).map!;
  await ensureTopicStarted(as.db, as.map, new Date(), OWNER_LEARNER_ID);
}

const post = (body: unknown) => POST(new Request("https://app.example/api/skip-ahead", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/skip-ahead", () => {
  it("opens the quiz without its key, then marks it and passes the Topic with at most one miss", async () => {
    await setUp();
    const opened = await post({ topicId: "t" });
    expect(opened.status).toBe(200);
    const { quiz } = await opened.json();
    expect(quiz.questions).toHaveLength(4);
    expect(JSON.stringify(quiz)).not.toMatch(/"answer"|Because/);

    const answers = { q1: "b", q2: "a", q3: "a", q4: "a" };
    const marked = await post({ attemptId: quiz.attemptId, answers });
    expect(marked.status).toBe(200);
    expect(await marked.json()).toMatchObject({ ok: true, passed: true, correctCount: 3, shown: 4, needed: 3, next: null });
    expect((await loadProgress(as.db, OWNER_LEARNER_ID)).topics.t.status).toBe("passed");
  });

  it("answers 400 to a body that is neither, and 409 while a turn is running", async () => {
    await setUp();
    expect((await post({ nothing: true })).status).toBe(400);
    await startTurn(as.db, new Date(), "Still thinking.", OWNER_LEARNER_ID);
    const busy = await post({ topicId: "t" });
    expect(busy.status).toBe(409);
    expect((await busy.json()).error).toMatch(/A turn is in progress/);
  });
});
