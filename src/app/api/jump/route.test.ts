import { stringify } from "yaml";
import { describe, expect, it, vi } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveJump } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { shownInWorkspace } from "@/tutor/session-log";
import { runTutorTurn } from "@/tutor/turn";
import { startTurn } from "@/tutor/turn-status";

/**
 * Choosing a Topic (spec #119, "Choosing and opening a Topic"), through the routes the pages call: the
 * Course Map's Study this Topic and Back to the default path, What comes next, and Home's Resume. Each
 * sets the current Topic and shows its Session at once; while a turn runs, choosing answers "turn in progress".
 */

const as = vi.hoisted(() => ({ db: undefined as unknown as Db, map: undefined as CourseMap | undefined }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => OWNER_LEARNER_ID }));
vi.mock("@/course/map", async (original) => {
  const real = await original<typeof import("@/course/map")>();
  return { ...real, loadCourseMap: () => as.map ?? real.loadCourseMap() };
});

const { POST: choose } = await import("./route");
const { POST: open } = await import("../open/route");

function twoTopics(): CourseMap {
  const base = presentValueOnly({ real: loadCourseMap(), withoutQuiz: true, withoutInsight: true });
  const pv = base.topic("present-value")!;
  const bonds = {
    ...pv,
    id: "bonds",
    title: "Bond prices",
    path: 30,
    prerequisites: [],
    cases: pv.cases.map((c) => ({ ...c, id: "bonds-case" })),
    checks: [{ id: "bonds-check", kind: "conversation", prompt: "Why do prices fall?", passCriteria: "Discounting." }],
    questions: undefined,
    connections: [],
  };
  const { map, errors } = parseCourseMap([
    { name: "present-value.yaml", text: stringify(pv) },
    { name: "bonds.yaml", text: stringify(bonds) },
  ]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const post = (body: unknown) => choose(new Request("https://app.example/api/jump", { method: "POST", body: JSON.stringify(body) }));
const say = (text: string) => ({ content: [{ type: "text", text }] });

async function setUp() {
  as.db = await testDb();
  as.map = twoTopics();
  await saveJump(as.db, as.map!, "present-value");
  const { client } = scriptedClient([say("Picture October 2018.")]);
  for await (const event of runTutorTurn({ db: as.db, client, map: as.map! }, { opener: true })) void event;
  return (await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)) as { sessionId: number };
}

describe("choosing a Topic", () => {
  it("Study this Topic sets the current Topic and shows it at once, before its first turn", async () => {
    await setUp();
    const res = await post({ topicId: "bonds" });
    expect(res.status).toBe(200);
    expect((await loadProgress(as.db)).currentTopicId).toBe("bonds");
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual({ topicId: "bonds" });
  });

  it("Back to the default path shows the default path's Topic's own Session at once", async () => {
    const pv = await setUp();
    await post({ topicId: "bonds" });
    expect((await post({ topicId: null })).status).toBe(200);
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual(pv);
  });

  it("What comes next leaves a passed Topic's Session for the current Topic", async () => {
    const pv = await setUp();
    // As a turn that passed present value leaves it: the passed Session still shown, the place moved on.
    await as.db.update(topicProgress).set({ status: "passed", step: "principle" });
    await saveJump(as.db, as.map!, "bonds");
    await as.db.execute(`update learner_state set shown_session_id = ${pv.sessionId}`);
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual(pv);
    expect((await post({ next: true })).status).toBe(200);
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual({ topicId: "bonds" });
  });

  it("Home's Resume opens the current Topic and goes to the Study Workspace", async () => {
    const pv = await setUp();
    await as.db.update(topicProgress).set({ status: "passed", step: "principle" });
    await saveJump(as.db, as.map!, "bonds");
    await as.db.execute(`update learner_state set shown_session_id = ${pv.sessionId}`);
    const res = await open(new Request("https://app.example/api/open", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.example/study");
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual({ topicId: "bonds" });
  });

  const openTopic = (topic: string) => {
    const form = new FormData();
    form.set("topic", topic);
    return open(new Request("https://app.example/api/open", { method: "POST", body: form }));
  };

  it("a Progress row opens its Topic: an unpassed one becomes the current Topic and shows at once", async () => {
    await setUp();
    const res = await openTopic("bonds");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.example/study");
    expect((await loadProgress(as.db)).currentTopicId).toBe("bonds");
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual({ topicId: "bonds" });
  });

  it("a Progress row for a passed Topic shows that Topic's own Session, leaving the current Topic as it was", async () => {
    const pv = await setUp();
    await as.db.update(topicProgress).set({ status: "passed", step: "principle" });
    await saveJump(as.db, as.map!, "bonds");
    await as.db.execute(`update learner_state set shown_session_id = null`);
    const res = await openTopic("present-value");
    expect(res.headers.get("location")).toBe("https://app.example/study");
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual(pv);
    expect((await loadProgress(as.db)).currentTopicId).toBe("bonds");
  });

  it("while a turn is running, every way of choosing answers \"turn in progress\" and changes nothing", async () => {
    const pv = await setUp();
    await startTurn(as.db, new Date(), "Still thinking.");
    for (const body of [{ topicId: "bonds" }, { topicId: null }, { next: true }]) {
      const res = await post(body);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/A turn is in progress/);
    }
    // Resume goes to the Study Workspace, which shows the turn in progress; nothing was chosen.
    expect((await open(new Request("https://app.example/api/open", { method: "POST" }))).status).toBe(303);
    expect((await openTopic("bonds")).status).toBe(303);
    expect((await loadProgress(as.db)).currentTopicId).toBe("present-value");
    expect(await shownInWorkspace(as.db, as.map!, OWNER_LEARNER_ID)).toEqual(pv);
  });
});
