import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Learner, signInAs } from "@/auth/learners";
import { learners, noteItems, reviewCards, sessionItems, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { loadCourseMap } from "@/course/map";
import { liveSession, shownInWorkspace } from "@/tutor/session-log";
import { TOPIC_COMPLETE } from "@/tutor/topic-complete-card";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";

// The request's database and signed-in Learner; only those are swapped in. The route itself is real.
const as = vi.hoisted(() => ({ db: undefined as unknown as Db, learner: null as Learner | null }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearner: async () => as.learner }));

const route = await import("./route");

const post = (body: unknown) =>
  route.POST(new Request("http://localhost:3100/api/dev-e2e", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("the fixture route", () => {
  beforeEach(async () => {
    as.db = await testDb();
    as.learner = await signInAs(as.db, "tools");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.__faE2eIsPglite = undefined;
  });

  it("the fixture route is closed unless the test database is open", async () => {
    vi.stubEnv("E2E", undefined);
    globalThis.__faE2eIsPglite = true;
    expect((await post({ state: "story" })).status).toBe(404);
    expect((await route.GET()).status).toBe(404);

    vi.stubEnv("E2E", "1");
    globalThis.__faE2eIsPglite = undefined;
    expect((await post({ state: "story" })).status).toBe(404);
    expect((await route.GET()).status).toBe(404);

    globalThis.__faE2eIsPglite = true;
    expect(await (await route.GET()).json()).toEqual({ db: "pglite" });
    as.learner = await signInAs(as.db, "owner");
    expect((await post({ state: "story" })).status).toBe(403);
  });

  it("seeds the story state and starts the tools Learner over with fresh", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("SESSION_SECRET", "e2e-secret-e2e-secret-e2e-secret!!");
    globalThis.__faE2eIsPglite = true;
    const old = as.learner!;

    const story = await post({ state: "story" });
    expect(story.status).toBe(200);
    const { learnerId } = (await story.json()) as { learnerId: number };
    const progress = await loadProgress(as.db, learnerId);
    expect(progress.currentTopicId).toBe("num-percent-bps");
    expect(progress.topics["num-percent-bps"]?.step).toBe("story");
    expect(await as.db.select().from(sessions).where(eq(sessions.learnerId, learnerId))).toHaveLength(1);
    // The browser is signed in as the Learner the state was built on.
    expect(story.headers.get("set-cookie")).toMatch(new RegExp(`fa_access=${learnerId}\\.`));

    as.learner = (await as.db.select().from(learners).where(eq(learners.id, learnerId)))[0];
    const fresh = await post({ state: "fresh" });
    expect(fresh.status).toBe(200);
    const after = (await fresh.json()) as { learnerId: number };
    const [active] = await as.db.select().from(learners).where(and(eq(learners.name, "tools"), isNull(learners.archivedAt)));
    expect(active.id).toBe(after.learnerId);
    expect(active.id).not.toBe(learnerId);
    const [archived] = await as.db.select().from(learners).where(eq(learners.id, old.id));
    expect(archived.archivedAt).not.toBeNull();
    expect((await loadProgress(as.db, after.learnerId)).currentTopicId).toBeNull();
  });

  it("builds every other state the spec names", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("SESSION_SECRET", "e2e-secret-e2e-secret-e2e-secret!!");
    globalThis.__faE2eIsPglite = true;
    const seed = async (state: string) => {
      const res = await post({ state });
      expect({ state, status: res.status }).toEqual({ state, status: 200 });
      const { learnerId } = (await res.json()) as { learnerId: number };
      as.learner = (await as.db.select().from(learners).where(eq(learners.id, learnerId)))[0];
      return { learnerId, progress: await loadProgress(as.db, learnerId) };
    };
    expect((await seed("concept-widget")).progress.topics["num-percent-bps"]?.step).toBe("concept");
    expect((await seed("quiz-open")).progress.topics["num-percent-bps"]?.step).toBe("check");
    expect((await seed("topic-complete")).progress.topics["num-percent-bps"]?.status).toBe("passed");
    const many = Object.values((await seed("many-topics")).progress.topics);
    expect(many.filter((t) => t.status === "passed")).toHaveLength(3);
    expect(many.filter((t) => t.status === "in_progress")).toHaveLength(2);
    const restart = await seed("restart-topics");
    const topics = Object.entries(restart.progress.topics);
    expect(topics.filter(([, t]) => t.status === "passed").map(([id]) => id)).toEqual(["num-percent-bps"]);
    expect(topics.filter(([, t]) => t.status === "in_progress")).toHaveLength(1);
    expect(await as.db.select().from(noteItems).where(eq(noteItems.learnerId, restart.learnerId))).toHaveLength(2);
    expect(await as.db.select().from(reviewCards).where(eq(reviewCards.learnerId, restart.learnerId))).not.toHaveLength(0);
  });

  // The seeded states the F1 preview matrix shoots, built as the real app builds them (#479, #481).
  describe("the matrix states", () => {
    const seed = async (state: string) => {
      vi.stubEnv("E2E", "1");
      vi.stubEnv("SESSION_SECRET", "e2e-secret-e2e-secret-e2e-secret!!");
      globalThis.__faE2eIsPglite = true;
      const res = await post({ state });
      expect({ state, status: res.status }).toEqual({ state, status: 200 });
      const { learnerId } = (await res.json()) as { learnerId: number };
      const session = await liveSession(as.db, learnerId, "num-percent-bps");
      const items = session ? await as.db.select().from(sessionItems).where(eq(sessionItems.sessionId, session.id)).orderBy(sessionItems.afterSeq, sessionItems.id) : [];
      return { learnerId, session, items };
    };

    // #479: a real pass (src/tutor/check-results.ts) stores the Topic complete card and keeps the passed Topic's Session
    // on screen; the fixture does the same, so /study shows Percent's own Session ending in its card.
    it("topic-complete shows the passed Topic's Session, ending in its Topic complete card", async () => {
      const { learnerId, session, items } = await seed("topic-complete");
      expect(session).toBeDefined();
      expect(await shownInWorkspace(as.db, loadCourseMap(), learnerId)).toEqual({ sessionId: session!.id });
      expect(items.at(-1)?.kind).toBe(TOPIC_COMPLETE);
    });

    // #481, spec §8.3: "reply with Story scene, Lingo card, Choices, Course Map, Notebook, a wrong-choice mix-up fix".
    const widgets = (items: { kind: string; data: Record<string, unknown> }[]) => items.filter((i) => i.kind === WIDGET_SHOWN).map((i) => i.data);

    it("story-scene: a Story reply with the step's written-ahead scene", async () => {
      const { learnerId, items } = await seed("story-scene");
      expect((await loadProgress(as.db, learnerId)).topics["num-percent-bps"]?.step).toBe("story");
      expect(widgets(items).map((w) => [w.recipe, w.companion, w.companionKey])).toEqual([["story_scene", "scene", "fed-opening"]]);
    });

    it("lingo: a Concept reply with the Lingo card for percent change last", async () => {
      const { learnerId, items } = await seed("lingo");
      expect((await loadProgress(as.db, learnerId)).topics["num-percent-bps"]?.step).toBe("concept");
      const last = widgets(items).at(-1);
      expect([last?.recipe, last?.companion, last?.title]).toEqual(["lingo_card", "lingo", "Lingo: percent change"]);
    });

    it("mix-up: Your turn with a wrong Quick try choice marked, showing its mix-up fix", async () => {
      const { learnerId, items } = await seed("mix-up");
      expect((await loadProgress(as.db, learnerId)).topics["num-percent-bps"]?.step).toBe("your_turn");
      const result = items.find((i) => i.kind === "quick_try_result")?.data;
      expect(result).toEqual(expect.objectContaining({ verdict: "known_mistake", line: "That is basis points. Points are the new rate minus the old rate." }));
    });
  });
});
