import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { placeLearner } from "@/behaviour/place";
import { loadCourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep, saveJump } from "@/learner/memory";
import { addLine, loadNotes } from "@/learner/notes";
import { loadProfile, saveProfile } from "@/learner/profile";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { listSessions, loadSession } from "@/tutor/transcript";
import { runTutorTurn } from "@/tutor/turn";
import { freshToolsLearner } from "./tools-learner";

/**
 * The comparison and behaviour runs (spec #119, "Owner tooling › Test tools") play their Learner as the tools
 * Learner, started over before each run, through the real Tutor Turn (here with the scripted client).
 */

const map = loadCourseMap();
const say = (text: string) => ({ content: [{ type: "text", text }] });

async function turn(db: Db, learnerId: number, message: string, reply: string) {
  const { client } = scriptedClient([say(reply)]);
  let text = "";
  for await (const e of runTutorTurn({ db, client, map, learnerId }, message)) if (e.type === "text") text += e.text;
  return text;
}

async function everythingOf(db: Db, learnerId: number) {
  const listed = await listSessions(db, learnerId);
  return {
    sessions: listed,
    lines: await Promise.all(listed.map((s) => loadSession(db, s.id, map, learnerId))),
    progress: await loadProgress(db, learnerId),
    notes: await loadNotes(db, map, learnerId),
    profile: await loadProfile(db, learnerId),
  };
}

it("a run places and teaches the tools Learner, started over first, and leaves the owner's Sessions, progress, Topic Notes and Learner Profile as they were", async () => {
  const db = await testDb();
  await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
  await turn(db, OWNER_LEARNER_ID, "The owner's question", "The owner's reply.");
  await saveFinishedStep(db, map, "story", new Date(), OWNER_LEARNER_ID);
  await addLine(db, map, "present-value", "The owner's note line", new Date(), OWNER_LEARNER_ID);
  await saveProfile(db, { work: "a teacher in Mumbai", location: null, loan: null, savingFor: null }, new Date(), OWNER_LEARNER_ID);
  const owner = await everythingOf(db, OWNER_LEARNER_ID);

  const earlier = await freshToolsLearner(db);
  await turn(db, earlier.id, "An earlier run's question", "An earlier run's reply.");
  const earlierRows = await everythingOf(db, earlier.id);

  const tools = await freshToolsLearner(db);
  expect(tools).toMatchObject({ name: "tools", archivedAt: null });
  expect(tools.id).not.toBe(earlier.id);
  expect(await everythingOf(db, tools.id)).toMatchObject({ sessions: [], progress: { currentTopicId: null, topics: {} }, profile: { work: null } });

  await saveJump(db, map, "present-value", new Date(), tools.id);
  const place = await placeLearner(db, map, "check", tools.id);
  expect(place.step).toBe("check");
  expect(navigate(map, await loadProgress(db, tools.id))?.step).toBe("check");
  expect(await turn(db, tools.id, "The tools Learner's question", "The tools Learner's reply.")).toContain("The tools Learner's reply.");
  expect((await everythingOf(db, tools.id)).sessions).toHaveLength(1);

  // The earlier tools Learner is archived, never deleted; the owner's rows read back exactly as before.
  const [archived] = await db.select().from(learners).where(eq(learners.id, earlier.id));
  expect(archived.archivedAt).not.toBeNull();
  expect(await everythingOf(db, earlier.id)).toEqual(earlierRows);
  expect(await everythingOf(db, OWNER_LEARNER_ID)).toEqual(owner);
});
