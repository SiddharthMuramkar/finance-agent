import { and, eq } from "drizzle-orm";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { learners, messages, OWNER_LEARNER_ID, sessions, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveJump } from "@/learner/memory";
import { restartTopic } from "@/learner/restart";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { loadPastSession, loadPastSessions } from "./past-sessions";
import { runTutorTurn } from "./turn";

/**
 * Past Sessions (spec #119, "Pages › Past Sessions"): one row per Topic Session, newest first, and every
 * Session from before one Session per Topic in its own Older group. Real Tutor Turns with the scripted
 * client on in-memory Postgres with the real migrations; Older Sessions are inserted as the expand migration left them.
 */

/** The real present value Topic (no Insight, no quiz) plus a second Topic, "Bond prices". */
function withBonds(): CourseMap {
  const pv = presentValueOnly({ real: loadCourseMap(), withoutQuiz: true, withoutInsight: true }).topic("present-value")!;
  const bonds = {
    ...pv,
    id: "bonds",
    title: "Bond prices",
    path: 30,
    prerequisites: [],
    cases: pv.cases.map((c) => ({ ...c, id: "bonds-case" })),
    widgets: undefined,
    found: undefined,
    checks: [{ id: "bonds-check", kind: "conversation", prompt: "Why do prices fall?", passCriteria: "Discounting." }],
    questions: undefined,
    insight: undefined,
    explore: undefined,
    connections: [],
  };
  const { map, errors } = parseCourseMap([
    { name: "present-value.yaml", text: stringify(pv) },
    { name: "bonds.yaml", text: stringify(bonds) },
  ]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
const map = withBonds();

async function turn(db: Db, text: string, reply: string, learnerId = OWNER_LEARNER_ID) {
  const { client } = scriptedClient([{ content: [{ type: "text", text: reply }] }]);
  for await (const _ of runTutorTurn({ db, client, map, learnerId }, text)) void _;
}

/** A Session as the expand migration left it: Older, possibly holding several Topics. */
async function olderSession(db: Db, createdAt: Date, contents: { role: "user" | "assistant"; content: unknown }[], learnerId = OWNER_LEARNER_ID) {
  const [old] = await db
    .insert(sessions)
    .values({ learnerId, instructions: TUTOR_INSTRUCTIONS, tools: [], model: "claude-opus-5-5", effort: "medium", fingerprint: "old", createdAt })
    .returning();
  await db.insert(messages).values(contents.map((c, seq) => ({ sessionId: old.id, seq, ...c })));
  return old.id;
}

describe("the Past Sessions list", () => {
  it("has one row per Topic Session, the most recently worked on first, and the Older Sessions in their own group", async () => {
    const db = await testDb();
    const older = await olderSession(db, new Date("2026-09-05T08:00:00Z"), [
      { role: "user", content: "Topic: Present value (Foundation Stage).\nWhy discount?" },
      { role: "assistant", content: "Because money now earns." },
    ]);
    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Tell me about the lottery.", "Picture October 2018.");
    await saveJump(db, map, "bonds", new Date(), OWNER_LEARNER_ID);
    await turn(db, "And bonds?", "Prices fall when rates rise.");
    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Back to the lottery.", "Where were we?");

    const past = await loadPastSessions(db, map, OWNER_LEARNER_ID);
    expect(past.topics.map((t) => t.title)).toEqual(["Present value", "Bond prices"]);
    expect(past.topics[0].lastActive).toBeInstanceOf(Date);
    expect(past.older).toEqual([{ id: older, date: new Date("2026-09-05T08:00:00Z"), topics: ["Present value"] }]);
  });

  it("lists nothing of another Learner's", async () => {
    const db = await testDb();
    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Tell me about the lottery.", "Picture October 2018.");
    await olderSession(db, new Date("2026-09-05T08:00:00Z"), [{ role: "user", content: "Hi" }]);
    const [second] = await db.insert(learners).values({ name: "second" }).returning();
    expect(await loadPastSessions(db, map, second.id)).toEqual({ topics: [], older: [], earlier: [] });
  });
});

describe("an earlier attempt (a Topic started over)", () => {
  it("is listed as one, not as an Older session, and its header is kind earlier", async () => {
    const db = await testDb();
    await saveJump(db, map, "bonds", new Date(), OWNER_LEARNER_ID);
    await turn(db, "And bonds?", "Prices fall when rates rise.");
    const [row] = (await loadPastSessions(db, map, OWNER_LEARNER_ID)).topics;
    const at = new Date("2026-11-04T10:00:00Z");
    expect(await restartTopic(db, map, OWNER_LEARNER_ID, "bonds", at)).toMatchObject({ restarted: true, oldSessionId: row.id });

    const past = await loadPastSessions(db, map, OWNER_LEARNER_ID);
    expect(past.topics).toEqual([]);
    expect(past.older).toEqual([]);
    expect(past.earlier).toEqual([{ sessionId: row.id, topicId: "bonds", attemptNo: 1, date: at, status: "not_finished", checksPassed: 0, checksTotal: 1, found: [] }]);
    expect(await loadPastSession(db, map, row.id, OWNER_LEARNER_ID)).toEqual({ kind: "earlier", topicId: "bonds", title: "Bond prices", date: at, attemptNo: 1 });
  });
});

describe("one Past Session's header", () => {
  it("names a Topic Session's Topic and last activity, unpassed until the Topic passes", async () => {
    const db = await testDb();
    await saveJump(db, map, "bonds", new Date(), OWNER_LEARNER_ID);
    await turn(db, "And bonds?", "Prices fall when rates rise.");
    const [row] = (await loadPastSessions(db, map, OWNER_LEARNER_ID)).topics;

    expect(await loadPastSession(db, map, row.id, OWNER_LEARNER_ID)).toEqual({ kind: "topic", topicId: "bonds", title: "Bond prices", lastActive: row.lastActive, passed: false });
    // As a passed Check and Principle leave it.
    await db.update(topicProgress).set({ step: "principle", status: "passed" }).where(and(eq(topicProgress.learnerId, OWNER_LEARNER_ID), eq(topicProgress.topicId, "bonds")));
    expect(await loadPastSession(db, map, row.id, OWNER_LEARNER_ID)).toMatchObject({ kind: "topic", passed: true });
  });

  it("gives an Older Session its date and the Topics it touched, and nothing for another Learner's id", async () => {
    const db = await testDb();
    const id = await olderSession(db, new Date("2026-09-05T08:00:00Z"), [{ role: "user", content: "Just a question." }]);
    expect(await loadPastSession(db, map, id, OWNER_LEARNER_ID)).toEqual({ kind: "older", date: new Date("2026-09-05T08:00:00Z"), topics: [] });
    const [second] = await db.insert(learners).values({ name: "second" }).returning();
    expect(await loadPastSession(db, map, id, second.id)).toBeNull();
  });
});
