import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE, learnerToken } from "@/auth/passcode";
import { loadCourseMap } from "@/course/map";
import { checkResults, learners, learnerState, sessions, topicProgress, topicRestarts, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { RESTART_CONFIRM } from "@/learner/restart";
import { testDb } from "@/test/pglite";

/**
 * POST /api/topics/[topicId]/restart (B3a): same origin, signed in, confirmed, a known Topic, no turn running.
 * It only ever acts on the signed-in Learner's own rows. Real in-memory database; the cookie is the real one.
 */

const as = vi.hoisted(() => ({ db: undefined as unknown as Db, cookie: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && as.cookie !== undefined ? { name, value: as.cookie } : undefined) }),
}));

const { GET, POST } = await import("./route");

const SITE = "https://www.app.example";
const map = loadCourseMap();
const [P, Q] = map.topics.map((t) => t.id);

function post(topicId: string, init: { headers?: Record<string, string>; confirm?: string | null } = {}) {
  const body = new URLSearchParams();
  if (init.confirm !== null) body.set("confirm", init.confirm ?? RESTART_CONFIRM);
  return POST(
    new Request(`${SITE}/api/topics/${topicId}/restart`, {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded", ...init.headers },
      body,
    }),
    { params: Promise.resolve({ topicId }) },
  );
}

async function seedProgress(learnerId: number, topicId: string) {
  await as.db.insert(topicProgress).values({ learnerId, topicId, step: "check", status: "in_progress" });
  await as.db.insert(checkResults).values({ learnerId, topicId, checkId: "c", passed: true });
  await as.db
    .insert(sessions)
    .values({ learnerId, topicId, older: false, instructions: "i", tools: [], model: "m", effort: "low", fingerprint: "f" });
}

const rows = async () => ({
  progress: await as.db.select().from(topicProgress),
  checks: await as.db.select().from(checkResults),
  restarts: await as.db.select().from(topicRestarts),
});

let two: number;
beforeEach(async () => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.PASSCODES = "owner:pw1,second:pw2";
  as.db = await testDb();
  [{ id: two }] = await as.db.insert(learners).values({ name: "second" }).returning({ id: learners.id });
  as.cookie = await learnerToken(1, "test-secret");
});

describe("restarting a Topic over HTTP", () => {
  it("route rules", async () => {
    await seedProgress(1, P);
    await seedProgress(two, P);

    // wrong origin
    expect((await post(P, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    // no cookie
    const cookie = as.cookie;
    as.cookie = undefined;
    expect((await post(P)).status).toBe(401);
    as.cookie = cookie;
    // missing or wrong confirm
    expect((await post(P, { confirm: null })).status).toBe(400);
    expect((await post(P, { confirm: "yes" })).status).toBe(400);
    // unknown Topic
    expect((await post("no-such-topic")).status).toBe(404);
    // nothing changed so far
    expect((await rows()).restarts).toHaveLength(0);
    expect((await rows()).progress).toHaveLength(2);

    // a running turn
    await as.db.insert(turns).values({ learnerId: 1, status: "running", startedAt: new Date(), input: "x" });
    const busy = await post(P);
    expect(busy.status).toBe(409);
    expect((await rows()).restarts).toHaveLength(0);
    expect((await rows()).progress).toHaveLength(2);
    await as.db.delete(turns).where(eq(turns.learnerId, 1));

    // success
    const ok = await post(P);
    expect(ok.status).toBe(303);
    expect(new URL(ok.headers.get("location")!).pathname).toBe("/study");
    expect((await loadProgress(as.db, 1)).currentTopicId).toBe(P);
    expect((await rows()).restarts).toHaveLength(1);
    // Learner 2's rows are untouched
    expect((await rows()).progress.map((r) => r.learnerId)).toEqual([two]);
    expect((await rows()).checks.map((r) => r.learnerId)).toEqual([two]);

    // GET
    expect((await GET()).status).toBe(405);
  });

  it("a Learner cannot restart another Learner's Topic", async () => {
    await seedProgress(two, P);
    await as.db.insert(learnerState).values({ id: two, learnerId: two });
    const before = await rows();
    const res = await post(P);
    expect(res.status).toBe(303); // nothing_to_restart, still opens the Topic
    const after = await rows();
    expect(after.progress).toEqual(before.progress);
    expect(after.checks).toEqual(before.checks);
    expect(after.restarts).toHaveLength(0);
    expect(Q).toBeDefined();
    expect(ACCESS_COOKIE).toBe("fa_access");
  });
});
