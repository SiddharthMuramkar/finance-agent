import { betterAuth } from "better-auth";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessFor, approveAccess, denyAccess, peopleWithAccess, waitingRequests } from "@/auth/access";
import { authOptions } from "@/auth/better-auth";
import type { AuthUser } from "@/auth/google-learner";
import { type Learner, signInAs } from "@/auth/learners";
import { account, invites, learners, messages, noteItems, OWNER_LEARNER_ID, reviewCards, sessionItems, sessions, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { loadCourseMap } from "@/course/map";
import { OFF_TOPIC } from "@/tutor/session-item-kinds";
import { liveSession, shownInWorkspace } from "@/tutor/session-log";
import { STEP_DIVIDER } from "@/tutor/session-item-kinds";
import { TOPIC_COMPLETE } from "@/tutor/topic-complete-card";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";

// The request's database, signed-in Learner and Better Auth instance; only those are swapped in. The route itself is real.
const as = vi.hoisted(() => ({ db: undefined as unknown as Db, learner: null as Learner | null, auth: null as TestAuth | null }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearner: async () => as.learner }));
vi.mock("@/auth/better-auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/auth/better-auth")>()), getAuth: () => as.auth }));

/** Better Auth as the test bed runs it (playwright.config.ts): test helpers mounted, email links into the outbox. */
const TEST_BED = { E2E: "1", BETTER_AUTH_SECRET: "e2e-better-auth-secret-012345678", BETTER_AUTH_URL: "http://localhost:3100", GOOGLE_CLIENT_ID: "e2e-not-real", GOOGLE_CLIENT_SECRET: "e2e-not-real" };
const testBedAuth = (db: Db) => betterAuth(authOptions(db, TEST_BED));
type TestAuth = ReturnType<typeof testBedAuth>;

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

  // ADR 0014's people, each signed in through a real Better Auth session (the test helpers), as the e2e specs use them.
  describe("the sign-in fixtures", () => {
    const FIXTURES = [{ googleOwner: true }, { waitingUser: true }, { invite: "mia@e2e.example" }, { emailLinkFor: "mia@e2e.example" }];

    beforeEach(() => {
      as.auth = testBedAuth(as.db);
    });
    afterEach(() => {
      globalThis.__faE2eOutbox = undefined;
      vi.unstubAllGlobals();
    });

    const openTestBed = () => {
      vi.stubEnv("E2E", "1");
      vi.stubEnv("SESSION_SECRET", "e2e-secret-e2e-secret-e2e-secret!!");
      globalThis.__faE2eIsPglite = true;
    };

    /** The Better Auth user a fixture's response signed the browser in as, read back through the session cookie it set. */
    async function sessionUser(res: Response): Promise<AuthUser | null> {
      const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .filter((c) => c.includes("session_token="))
        .join("; ");
      const found = await as.auth!.api.getSession({ headers: new Headers({ cookie }) });
      return found && { id: found.user.id, email: found.user.email, name: found.user.name };
    }

    it("the sign-in fixtures are closed outside the test bed, and to anyone but the tools Learner", async () => {
      vi.stubEnv("E2E", undefined);
      globalThis.__faE2eIsPglite = true;
      for (const body of FIXTURES) expect({ body, status: (await post(body)).status }).toEqual({ body, status: 404 });

      openTestBed();
      as.learner = await signInAs(as.db, "owner");
      for (const body of FIXTURES) expect({ body, status: (await post(body)).status }).toEqual({ body, status: 403 });
      expect(await as.db.select().from(user)).toEqual([]);
      expect(await as.db.select().from(invites)).toEqual([]);
    });

    it("googleOwner signs this browser in as the owner, a Google account linked to the owner Learner; again, the same one", async () => {
      openTestBed();
      const first = await post({ googleOwner: true });
      expect(first.status, await first.clone().text()).toBe(200);
      const body = (await first.json()) as { learnerId: number; email: string; waiting: number };
      // The migrations' Learner 1, so the owner's progress is where they left it.
      expect(body.learnerId).toBe(OWNER_LEARNER_ID);
      const signedIn = await sessionUser(first);
      expect(signedIn?.email).toBe(body.email);
      expect(await accessFor(as.db, signedIn!)).toMatchObject({ state: "approved", learner: { id: OWNER_LEARNER_ID, name: "owner", authUserId: signedIn!.id } });
      expect(await peopleWithAccess(as.db)).toEqual([expect.objectContaining({ email: body.email, isOwner: true, via: "google" })]);
      expect(body.waiting).toBe(0);

      const again = await post({ googleOwner: true });
      expect(again.status).toBe(200);
      expect(((await again.json()) as { learnerId: number }).learnerId).toBe(OWNER_LEARNER_ID);
      expect((await sessionUser(again))?.id).toBe(signedIn!.id);
      expect(await as.db.select().from(user)).toHaveLength(1);
      expect(await as.db.select().from(account)).toHaveLength(1);
      expect(await as.db.select().from(invites)).toHaveLength(1);
    });

    it("waitingUser signs in a verified person nobody invited, who waits; after an approval or a denial, they wait again", async () => {
      openTestBed();
      const first = await post({ waitingUser: true });
      expect(first.status, await first.clone().text()).toBe(200);
      const body = (await first.json()) as { email: string; waiting: number };
      const noor = await sessionUser(first);
      expect(noor?.email).toBe(body.email);
      expect(await accessFor(as.db, noor!)).toEqual({ state: "waiting" });
      expect((await waitingRequests(as.db)).map((r) => r.email)).toEqual([body.email]);
      expect(body.waiting).toBe(1);

      // An earlier test let her in: the fixture puts her back in Waiting.
      expect(await approveAccess(as.db, noor!.id)).toMatchObject({ authUserId: noor!.id });
      const afterApproval = await post({ waitingUser: true });
      expect(((await afterApproval.json()) as { waiting: number }).waiting).toBe(1);
      expect(await accessFor(as.db, noor!)).toEqual({ state: "waiting" });

      // An earlier test denied her: the same.
      expect(await denyAccess(as.db, noor!.id, { ownerUserId: "someone-else" })).toBe("denied");
      const afterDenial = await post({ waitingUser: true });
      expect((await sessionUser(afterDenial))?.id).toBe(noor!.id);
      expect(await accessFor(as.db, noor!)).toEqual({ state: "waiting" });
      expect(await as.db.select().from(user)).toHaveLength(1);
    });

    it("invite puts an email on the invite list once, and refuses a non-email", async () => {
      openTestBed();
      const first = await post({ invite: " Mia@E2E.example " });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ invite: "mia@e2e.example" });
      expect((await post({ invite: "mia@e2e.example" })).status).toBe(200);
      expect(await as.db.select().from(invites)).toEqual([expect.objectContaining({ email: "mia@e2e.example", learnerName: null })]);
      expect((await post({ invite: "not an email" })).status).toBe(400);
    });

    it("emailLinkFor hands out the sign-in link the test bed kept instead of mailing it, once", async () => {
      openTestBed();
      const mail = vi.fn(async () => Response.json({ id: "never" }));
      vi.stubGlobal("fetch", mail);
      const asked = await as.auth!.handler(
        new Request(`${TEST_BED.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: TEST_BED.BETTER_AUTH_URL },
          body: JSON.stringify({ email: "Mia@e2e.example", callbackURL: "/study" }),
        }),
      );
      expect(asked.status, await asked.clone().text()).toBe(200);
      expect(mail).not.toHaveBeenCalled();

      const res = await post({ emailLinkFor: "mia@E2E.example" });
      expect(res.status).toBe(200);
      const link = new URL(((await res.json()) as { link: string }).link);
      expect(link.origin + link.pathname).toBe(`${TEST_BED.BETTER_AUTH_URL}/login`);
      expect(link.searchParams.get("link")).toMatch(/\S{16,}/);
      expect(link.searchParams.get("next")).toBe("/study");

      // Handed out once: a second ask finds nothing until another link is sent.
      expect((await post({ emailLinkFor: "mia@e2e.example" })).status).toBe(404);
    });
  });
});
