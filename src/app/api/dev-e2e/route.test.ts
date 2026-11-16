import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Learner, signInAs } from "@/auth/learners";
import { learners, messages, noteItems, OWNER_LEARNER_ID, reviewCards, sessionItems, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { E2E_PEOPLE, E2E_PERSON_COOKIE, e2eIdentityFromCookie } from "@/dev/e2e-identity";
import { loadProgress } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { loadCourseMap } from "@/course/map";
import { spinePassed } from "@/course/navigator";
import { OFF_TOPIC } from "@/tutor/session-item-kinds";
import { liveSession, shownInWorkspace } from "@/tutor/session-log";
import { STEP_DIVIDER } from "@/tutor/session-item-kinds";
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

    // Spec 2026-11-11 A10a: the Off-Topic answer's "Back to <Topic>" line, which no scripted turn stores yet.
    it("off-topic: a Concept reply followed by an Off-Topic answer block back to the Topic", async () => {
      const { items } = await seed("off-topic");
      expect([items.at(-1)?.kind, items.at(-1)?.data.topicId]).toEqual([OFF_TOPIC, "num-percent-bps"]);
    });

    it("lingo: a Concept reply with the Lingo card for percent change last", async () => {
      const { learnerId, items } = await seed("lingo");
      expect((await loadProgress(as.db, learnerId)).topics["num-percent-bps"]?.step).toBe("concept");
      const last = widgets(items).at(-1);
      expect([last?.recipe, last?.companion, last?.title]).toEqual(["lingo_card", "lingo", "Lingo: percent change"]);
    });

    // C1 (spec 2026-11-11): one page that shows every piece of the reading block.
    it("reading: a Concept step with a divider, a Learner message, the reply and its Widget", async () => {
      const { learnerId, session, items } = await seed("reading");
      expect((await loadProgress(as.db, learnerId)).topics["num-percent-bps"]?.step).toBe("concept");
      const rows = session ? await as.db.select().from(messages).where(eq(messages.sessionId, session.id)).orderBy(messages.seq) : [];
      // What the page draws: the Learner's typed message and the Tutor's text reply (a show_widget call and its result are
      // stored as messages too, and drawn as nothing), and the step divider and Widget items.
      const said = (r: (typeof rows)[number]) => Array.isArray(r.content) && r.content.some((p: { type?: string }) => p.type === "text");
      const learner = rows.filter((r) => r.role === "user" && said(r)).map((r) => r.seq);
      const tutor = rows.filter((r) => r.role === "assistant" && said(r)).map((r) => r.seq);
      const dividers = items.filter((i) => i.kind === STEP_DIVIDER).map((i) => i.afterSeq);
      const shown = items.filter((i) => i.kind === WIDGET_SHOWN).map((i) => i.afterSeq);
      expect([dividers.length, learner.length, tutor.length, shown.length]).toEqual([1, 1, 1, 1]);
      // An item stored after message s sits after it and before message s + 1 (src/tutor/session-items.ts): the divider
      // comes before the Learner's message, the reply after it, and the Widget, shown during the reply's turn, after it too.
      expect(dividers[0]).toBeLessThan(learner[0]);
      expect(tutor[0]).toBeGreaterThan(learner[0]);
      expect(shown[0]).toBeGreaterThanOrEqual(learner[0]);
      expect(shown[0]).toBeLessThan(tutor[0]);
    });

    it("mix-up: Your turn with a wrong Quick try choice marked, showing its mix-up fix", async () => {
      const { learnerId, items } = await seed("mix-up");
      expect((await loadProgress(as.db, learnerId)).topics["num-percent-bps"]?.step).toBe("your_turn");
      const result = items.find((i) => i.kind === "quick_try_result")?.data;
      expect(result).toEqual(expect.objectContaining({ verdict: "known_mistake", line: "Half a percent is a share of the old rate. The gap between two rates is in points." }));
    });

    it("mix-up: a Tutor reply is stored before the try, so the page starts no opener under the answered try", async () => {
      const { session, items } = await seed("mix-up");
      // The page starts an opener when every line it loads is an item (src/app/turn-stream.ts): a real Your turn is
      // entered after Tutor replies, so the try follows one.
      const rows = await as.db.select().from(messages).where(eq(messages.sessionId, session!.id)).orderBy(messages.seq);
      const tutor = rows.filter((r) => r.role === "assistant").map((r) => r.seq);
      const tried = items.find((i) => i.kind === "quick_try");
      expect(tutor.length).toBeGreaterThan(0);
      expect(tried).toBeDefined();
      expect(Math.min(...tutor)).toBeLessThanOrEqual(tried!.afterSeq);
    });
  });

  // The test bed's sign-in people (issue #33): Clerk is off in the test bed, so a signed `fa_e2e_person` cookie stands in
  // for a Clerk session, and the person's Learner is linked to their (made-up) Clerk user id, as a first sign-in links it.
  describe("the sign-in people", () => {
    const SECRET = "e2e-secret-e2e-secret-e2e-secret!!";
    const openTestBed = () => {
      vi.stubEnv("E2E", "1");
      vi.stubEnv("SESSION_SECRET", SECRET);
      globalThis.__faE2eIsPglite = true;
    };

    /** The `fa_e2e_person` cookie a response set, whole (value and attributes). */
    const personCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith(`${E2E_PERSON_COOKIE}=`));
    const cookieValue = (res: Response) => decodeURIComponent(personCookie(res)!.split(";")[0].split("=")[1]);
    const clerkLinked = () => as.db.select().from(learners).where(isNotNull(learners.clerkUserId));

    it("{person} is closed outside the test bed, and to anyone but the tools Learner", async () => {
      vi.stubEnv("E2E", undefined);
      globalThis.__faE2eIsPglite = true;
      expect((await post({ person: "owner" })).status).toBe(404);

      openTestBed();
      as.learner = await signInAs(as.db, "owner");
      const refused = await post({ person: "owner" });
      expect(refused.status).toBe(403);
      expect(personCookie(refused)).toBeUndefined();
      expect(await clerkLinked()).toEqual([]);
    });

    it("{person: owner} signs this browser in as the test bed's admin, with a Learner of their own; again, the same one", async () => {
      openTestBed();
      const first = await post({ person: "owner" });
      expect(first.status, await first.clone().text()).toBe(200);
      const body = (await first.json()) as { person: string; email: string; learnerId: number };
      expect(body).toEqual({ person: "owner", email: E2E_PEOPLE.owner.email, learnerId: expect.any(Number) });
      // A fresh start (issue #33): an account never holds the migrations' owner Learner.
      expect(body.learnerId).not.toBe(OWNER_LEARNER_ID);
      expect(await clerkLinked()).toEqual([expect.objectContaining({ id: body.learnerId, clerkUserId: E2E_PEOPLE.owner.userId, archivedAt: null })]);

      const cookie = personCookie(first)!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).toMatch(/Path=\/(;|$)/);
      expect(cookie).not.toMatch(/Domain=/i);
      expect(await e2eIdentityFromCookie(cookieValue(first), SECRET, { E2E: "1" })).toEqual(E2E_PEOPLE.owner);

      const again = await post({ person: "owner" });
      expect(((await again.json()) as { learnerId: number }).learnerId).toBe(body.learnerId);
      expect(await clerkLinked()).toHaveLength(1);
    });

    it("{person: asha} is a Learner who is not the admin; anyone else is refused with the people there are", async () => {
      openTestBed();
      const asha = await post({ person: "asha" });
      expect(asha.status).toBe(200);
      expect(await e2eIdentityFromCookie(cookieValue(asha), SECRET, { E2E: "1" })).toEqual({ ...E2E_PEOPLE.asha, admin: false });

      for (const person of ["noor", "", 1, "__proto__"]) {
        const refused = await post({ person });
        expect({ person, status: refused.status }).toEqual({ person, status: 400 });
        expect(await refused.json()).toMatchObject({ people: Object.keys(E2E_PEOPLE) });
        expect(personCookie(refused)).toBeUndefined();
      }
      expect(await clerkLinked()).toHaveLength(1);
    });

    it("{person: ravi} is a Learner with every Spine Topic passed, so the Assignment is open (spec #68)", async () => {
      openTestBed();
      const ravi = await post({ person: "ravi" });
      expect(ravi.status, await ravi.clone().text()).toBe(200);
      const { learnerId } = (await ravi.json()) as { learnerId: number };
      const map = loadCourseMap();
      expect(spinePassed(map, await loadProgress(as.db, learnerId))).toBe(true);
      expect((await post({ person: "ravi" })).status).toBe(200);
    });
  });
});
