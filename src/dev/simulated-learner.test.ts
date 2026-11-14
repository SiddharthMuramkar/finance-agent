import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseMap } from "@/course/map";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { addLine, loadNotes } from "@/learner/notes";
import { loadProfile, saveProfile } from "@/learner/profile";
import { signInAs } from "@/auth/learners";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient } from "@/test/scripted-client";
import { listSessions, loadSession } from "@/tutor/transcript";
import { runTutorTurn } from "@/tutor/turn";
import { signInAsToolsLearner, toolsPasscode, toolsState, type Query } from "./simulated-learner";

/**
 * The test tools run as their own Learner (spec #119, "Owner tooling › Test tools"). The simulated learner and
 * the browser check sign in over HTTP with the tools passcode and start that Learner over; here their requests
 * reach the real login and Start over routes. Only the database (in-memory Postgres with the real migrations),
 * the Course Map, the cookie jar and the Tutor's model are swapped in.
 */

const as = vi.hoisted(() => ({ db: undefined as unknown as Db, map: undefined as CourseMap | undefined, cookie: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && as.cookie !== undefined ? { name, value: as.cookie } : undefined) }),
}));

const { POST: login } = await import("@/app/api/login/route");
const { POST: startOver } = await import("@/app/api/start-over/route");

const BASE = "https://app.example";
const PASSCODES = "owner:correct horse battery, test:staple gun, tools:tool shed";

/** The app as the scripts reach it over HTTP: each request goes to its real route, with the cookie it carries. */
async function app(url: string, init: RequestInit): Promise<Response> {
  const request = new Request(url, init);
  as.cookie = /fa_access=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const path = new URL(url).pathname;
  if (path === "/api/login") return login(request);
  if (path === "/api/start-over") return startOver(request);
  return new Response("not found", { status: 404 });
}

/** The script's raw query function, over the in-memory database. */
function queryOf(db: Db): Query {
  const client = (db as unknown as { $client: { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> } }).$client;
  return async (text, params = []) => (await client.query(text, params)).rows;
}

const say = (text: string) => ({ content: [{ type: "text", text }] });

/** A Learner with a Session, progress, a Topic Note line and a Learner Profile. */
async function rowsFor(learnerId: number, who: string) {
  const map = as.map!;
  const { client } = scriptedClient([say(`${who}'s reply.`)]);
  for await (const _ of runTutorTurn({ db: as.db, client, map, learnerId }, `${who}'s question`)) void _;
  await saveFinishedStep(as.db, map, "story", new Date(), learnerId);
  await addLine(as.db, map, "present-value", `${who}'s note line`, new Date(), learnerId);
  await saveProfile(as.db, { work: `${who}'s work`, location: null, loan: null, savingFor: null }, new Date(), learnerId);
}

/** Everything a Learner owns, read the way the app reads it for that Learner. */
async function everythingOf(learnerId: number) {
  const map = as.map!;
  const listed = await listSessions(as.db, learnerId);
  return {
    sessions: listed,
    lines: await Promise.all(listed.map((s) => loadSession(as.db, s.id, map, learnerId))),
    progress: await loadProgress(as.db, learnerId),
    notes: await loadNotes(as.db, map, learnerId),
    profile: await loadProfile(as.db, learnerId),
  };
}

beforeEach(async () => {
  as.db = await testDb();
  as.map = presentValueOnly();
  as.cookie = undefined;
  vi.stubEnv("SESSION_SECRET", "test-secret");
  vi.stubEnv("PASSCODES", PASSCODES);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("The test tools' sign-in", () => {
  it("signs in as the tools Learner and starts it over: a fresh, empty tools Learner, the old one archived with its rows, and the owner's and the test Learner's rows unchanged", async () => {
    await rowsFor(OWNER_LEARNER_ID, "The owner");
    const testLearner = await signInAs(as.db, "test");
    await rowsFor(testLearner.id, "The test Learner");
    const earlierTools = await signInAs(as.db, "tools");
    await rowsFor(earlierTools.id, "An earlier run");
    const before = { owner: await everythingOf(OWNER_LEARNER_ID), test: await everythingOf(testLearner.id), tools: await everythingOf(earlierTools.id) };

    const signedIn = await signInAsToolsLearner(BASE, { PASSCODES }, app);

    const [fresh] = await as.db.select().from(learners).where(eq(learners.id, signedIn.learnerId));
    expect(fresh).toMatchObject({ name: "tools", archivedAt: null });
    expect(signedIn.cookie).toMatch(new RegExp(`^fa_access=${signedIn.learnerId}\\.`));
    // The fresh Learner starts empty.
    const now = await everythingOf(signedIn.learnerId);
    expect(now.sessions).toEqual([]);
    expect(now.progress.topics).toEqual({});
    expect(now.profile.work).toBeNull();
    // The earlier run's Learner is archived, not deleted: its rows read back as they were.
    const [archived] = await as.db.select().from(learners).where(eq(learners.id, earlierTools.id));
    expect(archived.archivedAt).not.toBeNull();
    expect(await everythingOf(earlierTools.id)).toEqual(before.tools);
    // Nobody else's rows moved.
    expect(await everythingOf(OWNER_LEARNER_ID)).toEqual(before.owner);
    expect(await everythingOf(testLearner.id)).toEqual(before.test);
  });

  it("uses only the tools passcode: with no tools pair listed it refuses to run, never falling back to the owner's or the test passcode", async () => {
    expect(toolsPasscode({ PASSCODES })).toBe("tool shed");
    expect(() => toolsPasscode({ PASSCODES: "owner:correct horse battery, test:staple gun" })).toThrow(/tools:<passcode>/);
    expect(() => toolsPasscode({ PASSCODE: "correct horse battery" })).toThrow(/tools:<passcode>/);
    await expect(signInAsToolsLearner(BASE, { PASSCODE: "correct horse battery" }, app)).rejects.toThrow(/tools:<passcode>/);
    expect(await as.db.select().from(learners).where(eq(learners.name, "tools"))).toEqual([]);
  });

  it("stops when the app turns the tools passcode away, before starting anyone over", async () => {
    vi.stubEnv("PASSCODES", "owner:correct horse battery, test:staple gun");
    await expect(signInAsToolsLearner(BASE, { PASSCODES }, app)).rejects.toThrow(/sign-in/i);
    const [owner] = await as.db.select().from(learners).where(eq(learners.id, OWNER_LEARNER_ID));
    expect(owner.archivedAt).toBeNull();
  });
});

describe("What the simulated learner reads", () => {
  it("reads the step, status, passes and Sessions of the tools Learner only, never the owner's", async () => {
    await rowsFor(OWNER_LEARNER_ID, "The owner");
    await saveFinishedStep(as.db, as.map!, "concept", new Date(), OWNER_LEARNER_ID);
    const { learnerId } = await signInAsToolsLearner(BASE, { PASSCODES }, app);
    const query = queryOf(as.db);

    expect(await toolsState(query, learnerId, "present-value")).toEqual({ step: "story", status: "not_started", revealShown: false, passedChecks: [], sessions: 0 });

    const { client } = scriptedClient([say("The tools Learner's reply.")]);
    for await (const _ of runTutorTurn({ db: as.db, client, map: as.map!, learnerId }, "The tools Learner's question")) void _;
    const state = await toolsState(query, learnerId, "present-value");
    expect(state).toMatchObject({ step: "story", status: "in_progress", sessions: 1 });
  });
});
