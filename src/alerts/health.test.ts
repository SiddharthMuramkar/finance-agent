import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { learners, libraryRefreshRuns, OWNER_LEARNER_ID, sessions, turns, tutorIncidents } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { LOOKBACK_MS, reportHealth } from "./health";

const HEARTBEAT = "https://uptime.example/api/v1/heartbeat/token";
const NOW = new Date("2026-11-20T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** A stand-in for Better Stack: records each request the check sends. */
function fakeBetterStack(answer: () => Promise<Response> = async () => new Response("OK")) {
  const sent: { url: string; method: string; body: string | null }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null });
    return answer();
  }) as typeof globalThis.fetch;
  return { sent, fetch };
}

async function check(db: Db, { heartbeatUrl }: { heartbeatUrl?: string } = { heartbeatUrl: HEARTBEAT }) {
  const betterStack = fakeBetterStack();
  const report = await reportHealth({ db, now: NOW, heartbeatUrl, fetch: betterStack.fetch });
  return { report, sent: betterStack.sent };
}

async function aSession(db: Db): Promise<number> {
  const [s] = await db
    .insert(sessions)
    .values({ learnerId: OWNER_LEARNER_ID, instructions: "i", tools: [], model: "m", effort: "low", fingerprint: "f" })
    .returning({ id: sessions.id });
  return s.id;
}

describe("the health check", () => {
  it("sends the heartbeat when nothing went wrong", async () => {
    const db = await testDb();
    const betterStack = fakeBetterStack();
    const report = await reportHealth({ db, now: NOW, heartbeatUrl: HEARTBEAT, fetch: betterStack.fetch });
    expect(betterStack.sent).toEqual([{ url: HEARTBEAT, method: "GET", body: null }]);
    expect(report.ok).toBe(true);
  });

  it("reports a failed turn by its reference, even after Retry finished it, and never the Learner's text", async () => {
    const db = await testDb();
    // Retry sets the status back to running and then finished; only failure_ref stays.
    await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "finished", startedAt: minutesAgo(12), input: "my secret question", failureRef: "T7Q2" });
    const { report, sent } = await check(db);
    expect(report).toMatchObject({ ok: false, db: "answered", heartbeat: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: `${HEARTBEAT}/fail`, method: "POST" });
    expect(sent[0].body).toContain("T7Q2");
    expect(sent[0].body).not.toContain("secret");
  });

  it("forgets a failure once it is older than the lookback, so one problem does not hold the alert open", async () => {
    const db = await testDb();
    await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "failed", startedAt: new Date(NOW.getTime() - LOOKBACK_MS - 60_000), failureRef: "OLD1" });
    const { report, sent } = await check(db);
    expect(report.ok).toBe(true);
    expect(sent).toEqual([{ url: HEARTBEAT, method: "GET", body: null }]);
  });

  it("reports Tutor incidents by kind", async () => {
    const db = await testDb();
    const sessionId = await aSession(db);
    const incident = { learnerId: OWNER_LEARNER_ID, sessionId, kind: "replay_stripped_after_refusal", createdAt: minutesAgo(5) };
    await db.insert(tutorIncidents).values([incident, incident, { ...incident, createdAt: minutesAgo(LOOKBACK_MS / 60_000 + 5) }]);
    const { report, sent } = await check(db);
    expect(report.ok).toBe(false);
    expect(report.problems).toEqual(["Tutor incidents: replay_stripped_after_refusal ×2"]);
    expect(sent[0].url).toBe(`${HEARTBEAT}/fail`);
  });

  it("reports a turn the time limit killed (still marked running), but not one that is still running", async () => {
    const db = await testDb();
    const [other] = await db.insert(learners).values({ name: "Ravi" }).returning();
    await db.insert(turns).values({ learnerId: other.id, status: "running", startedAt: minutesAgo(1) });
    expect((await check(db)).report.ok).toBe(true);
    await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "running", startedAt: minutesAgo(7) });
    const { report } = await check(db);
    expect(report.problems).toEqual(["Killed turns (still marked running): 1"]);
  });

  it("reports a failed Library run, one cut off mid-run, and a missed week", async () => {
    const failed = await testDb();
    await failed.insert(libraryRefreshRuns).values({ startedAt: minutesAgo(30), finishedAt: minutesAgo(27), status: "failed" });
    expect((await check(failed)).report.problems).toEqual([expect.stringMatching(/^Library refresh failed/)]);

    const cutOff = await testDb();
    await cutOff.insert(libraryRefreshRuns).values({ startedAt: minutesAgo(15), status: "running" });
    expect((await check(cutOff)).report.problems).toEqual([expect.stringMatching(/^Library refresh cut off/)]);

    const missed = await testDb();
    await missed.insert(libraryRefreshRuns).values({ startedAt: minutesAgo(8 * 24 * 60 + 10), finishedAt: minutesAgo(8 * 24 * 60 + 7), status: "done" });
    expect((await check(missed)).report.problems).toEqual([expect.stringMatching(/^Library refresh missed/)]);

    const fine = await testDb();
    await fine.insert(libraryRefreshRuns).values({ startedAt: minutesAgo(30), finishedAt: minutesAgo(27), status: "done" });
    expect((await check(fine)).report.ok).toBe(true);
  });

  it("sends nothing when the database does not answer, so Better Stack alerts on the missed beat", async () => {
    const db = await testDb();
    await (db as unknown as { $client: PGlite }).$client.close();
    const { report, sent } = await check(db);
    expect(report).toMatchObject({ ok: false, db: "failed", heartbeat: "skipped" });
    expect(sent).toEqual([]);
  });

  it("sends nothing and still answers when no heartbeat URL is set", async () => {
    const db = await testDb();
    const { report, sent } = await check(db, {});
    expect(report).toMatchObject({ ok: true, db: "answered", heartbeat: "off" });
    expect(sent).toEqual([]);
  });

  it("does not throw when Better Stack cannot be reached", async () => {
    const db = await testDb();
    const betterStack = fakeBetterStack(async () => Promise.reject(new TypeError("fetch failed")));
    const report = await reportHealth({ db, now: NOW, heartbeatUrl: HEARTBEAT, fetch: betterStack.fetch });
    expect(report).toMatchObject({ ok: true, db: "answered", heartbeat: "unreachable" });
  });
});
