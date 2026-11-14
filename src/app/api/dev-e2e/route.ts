import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { TestHelpers } from "better-auth/plugins";
import { accessFor, isOwnerLearner, waitingCount } from "@/auth/access";
import { getAuth } from "@/auth/better-auth";
import { takeOutboxLink } from "@/auth/email-link";
import type { AuthUser } from "@/auth/google-learner";
import { addInvite, inviteEmail, removeInvite, signupOpen } from "@/auth/invites";
import { startOver } from "@/auth/learners";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, ACCESS_COOKIE_OPTIONS, OWNER_NAME, TOOLS_NAME, learnerToken } from "@/auth/passcode";
import { currentLearner } from "@/auth/session";
import { type CourseMap, loadCourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { finishForPlacement } from "@/behaviour/place";
import { importCaseData, type CaseDatasetInput } from "@/case-data/import";
import { getDb } from "@/db/client";
import { accessDenials, account, insightAttempts, learners, messages, reviewCards, sessions, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { e2eEnabled } from "@/dev/e2e-mode";
import { E2E_SCRIPTS, chooseE2eScript, isE2eScript } from "@/dev/e2e-tutor";
import { ensureTopicStarted, loadProgress, openCurrentTopic, saveCheckResult, saveJump } from "@/learner/memory";
import { saveOwnRule } from "@/learner/own-rule";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { reviewState } from "@/learner/review";
import { saveToNotes } from "@/learner/saved";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { answerQuickTry, enterStepItems } from "@/tutor/practice";
import { QUICK_TRY, type QuickTryData } from "@/tutor/session-item-kinds";
import { saveItemAfterLatest, stepDivider } from "@/tutor/session-items";
import { liveSession, saveShownSession, sessionForTurn } from "@/tutor/session-log";
import { storeOffTopic } from "@/tutor/off-topic";
import { storeTopicComplete } from "@/tutor/topic-complete";
import { runTutorTurn } from "@/tutor/turn";

export const runtime = "nodejs";

/**
 * The browser test bed's fixture route (spec 2026-11-05, T-00). `POST {state}` starts the tools Learner over and builds
 * a named state on the fresh Learner (signing this browser in as it); `POST {script}` picks the scripted Tutor's next
 * reply; `POST {reset: true}` is `{state: "fresh"}`; `GET` says which database is open.
 *
 * The sign-in fixtures (C1b, ADR 0014) sign this browser in as a Better Auth person, through a real session from Better
 * Auth's test helpers: `{googleLearner: true}` (Asha, invited, with her Learner), `{googleOwner: true}` (the owner) and
 * `{waitingUser: true}` (Noor, nobody's invite). `{invite: email}` puts an email on the invite list, and
 * `{emailLinkFor: email}` hands out the sign-in link the test bed kept for that address instead of mailing it.
 * Each is idempotent: the same person, in the same state, comes back.
 *
 * Closed (404) unless the test bed is on (`E2E=1`, never in production or on Vercel) AND the database is the in-memory
 * PGlite, so it can never write to Neon even if a flag leaks; 403 for any Learner but the tools Learner.
 * A ticket that needs another state adds it to STATES.
 */

/** The Topic every state opens: Percent, percentage points and basis points. */
const TOPIC = "num-percent-bps";

type Build = (db: Db, map: CourseMap, learnerId: number, now: Date) => Promise<void>;

async function drain(events: AsyncIterable<unknown>) {
  for await (const _ of events) void _;
}

/** Spine Topic 1 (spec 2026-11-12 Part C): what a business is worth, on Damodaran's Amazon of February 2000. */
const SPINE_ONE = "spine-01-worth";

/** Opens a Topic at its Story step with one live Session (the Percent Topic unless another is named). */
const storyOf =
  (topicId: string): Build =>
  async (db, map, learnerId, now) => {
    await saveJump(db, map, topicId, now, learnerId);
    await ensureTopicStarted(db, map, now, learnerId);
    await sessionForTurn(db, now, learnerId, topicId);
  };

/** Opens the Percent Topic at its Story step with one live Session. */
const story: Build = storyOf(TOPIC);

/**
 * Walks the Learner through a Topic as placeLearner does (src/behaviour/place.ts): each Check met is passed, Explore is
 * settled as told, a converted Your turn finishes as fluency would. Stops when the step is `until`, or the Topic is passed.
 */
async function walk(db: Db, map: CourseMap, learnerId: number, now: Date, topicId: string, until: (step: string) => boolean) {
  for (let i = 0; i < 60; i++) {
    const progress = await loadProgress(db, learnerId);
    if (progress.topics[topicId]?.status === "passed") return;
    const place = navigate(map, progress);
    if (!place || place.topic.id !== topicId || until(place.step)) return;
    if (place.step === "check" && place.check) {
      await saveCheckResult(db, map, { checkId: place.check.id, passed: true, evidence: "Test bed fixture." }, now, learnerId);
      continue;
    }
    if (place.step === "explore" && !progress.topics[topicId]?.insight) {
      await db.insert(insightAttempts).values({ learnerId, topicId, reported: "asked_to_be_told", released: "told", words: "", toolCallId: `e2e-${topicId}-${learnerId}` });
    }
    const move = await finishForPlacement(db, map, place.step, learnerId);
    if (!move.ok) throw new Error(`The test bed could not finish ${place.step} of ${topicId}: ${move.reason}`);
  }
  throw new Error(`The test bed could not walk ${topicId} to the state asked for.`);
}

/** Plays one scripted Tutor Turn, as if the Learner sent `message`. */
async function turn(db: Db, map: CourseMap, learnerId: number, script: keyof typeof E2E_SCRIPTS, message: string) {
  const { client } = scriptedClient(structuredClone(E2E_SCRIPTS[script].replies) as ScriptedReply[]);
  await drain(runTutorTurn({ db, client, map, learnerId }, message));
}

const STATES: Record<string, Build> = {
  /** A new tools Learner; no Topic open. */
  fresh: async () => {},
  story,
  /**
   * Spine Topic 1 at its Story step with one empty live Session, for a whole play of the Topic through the page
   * (e2e/spine-01.spec.ts): the page starts its opener, and every step after is taken in the browser.
   */
  "spine-01-start": storyOf(SPINE_ONE),
  /** The Topic at Concept, with one Widget shown by a scripted turn. */
  "concept-widget": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "concept");
    await turn(db, map, learnerId, "concept-reply-widget", "What is a basis point?");
  },
  /**
   * The Topic at Concept, with its step divider, the Learner's question, the scripted reply and its Widget: one page that
   * shows every piece of the conversation's reading block (spec 2026-11-11, C1).
   */
  reading: async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "concept");
    const session = await sessionForTurn(db, now, learnerId, TOPIC);
    await saveItemAfterLatest(db, learnerId, session.id, stepDivider(map, await loadProgress(db, learnerId), TOPIC)!, now);
    await turn(db, map, learnerId, "concept-reply-widget", "What is a basis point?");
  },
  /** The Topic at its first quiz Check, with the quiz open. */
  "quiz-open": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "check");
    if (!(await openQuiz(db, map, now, learnerId))) throw new Error(`${TOPIC}'s first Check is not a quiz.`);
  },
  /** The Topic at Your turn of its first Check, with the first Quick try shown and open (D1a). */
  "your-turn": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "your_turn");
    const session = await sessionForTurn(db, now, learnerId, TOPIC);
    await enterStepItems(db, map, learnerId, session.id, now);
  },
  /** The Topic at its Reveal step, every Check passed (E4a: a Widget with every reply at the reveal). */
  reveal: async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "reveal");
  },
  /** The first quiz Check with a written question, missed once, so that question is enrolled and one Review is due (D1a). */
  "review-due": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    // Only a written question is enrolled for Review (a template draw is not), so stop at the first quiz that has one.
    for (let i = 0; i < 10; i++) {
      await walk(db, map, learnerId, now, TOPIC, (step) => step === "check");
      const at = navigate(map, await loadProgress(db, learnerId));
      if (!at?.check || (at.check.kind === "quiz" && at.check.questions.length > 0)) break;
      await saveCheckResult(db, map, { checkId: at.check.id, passed: true, evidence: "Test bed fixture." }, now, learnerId);
    }
    const open = await openQuiz(db, map, now, learnerId);
    if (!open) throw new Error(`${TOPIC} has no quiz Check with a written question.`);
    const submitted = await submitQuiz(db, map, open.attemptId, {}, now, learnerId);
    if (!submitted.ok) throw new Error(`The test bed could not submit ${TOPIC}'s first quiz: ${submitted.reason}`);
    // Only a passed quiz Check enrols its questions, so the fixture passes it after the missed attempt.
    await saveCheckResult(db, map, { checkId: open.checkId, passed: true, evidence: "Test bed fixture." }, now, learnerId);
    await reviewState(db, map, now, learnerId);
    await db.update(reviewCards).set({ due: new Date(now.getTime() - 86_400_000) }).where(eq(reviewCards.learnerId, learnerId));
    if (!(await reviewState(db, map, now, learnerId)).question) throw new Error(`${TOPIC}'s quiz enrolled no question for Review.`);
  },
  /**
   * The Topic passed; the next Topic is recommended. As a real pass does (src/tutor/check-results.ts), the passed Topic's
   * Session gets its Topic complete card and stays on screen until the Learner chooses where to go (#479). It holds the
   * Reveal reply first, so the card ends a real conversation.
   */
  "topic-complete": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "reveal");
    await turn(db, map, learnerId, "reveal-reply", "What did the Fed do?");
    await walk(db, map, learnerId, now, TOPIC, () => false);
    const session = await liveSession(db, learnerId, TOPIC);
    if (!session) throw new Error(`${TOPIC} has no live Session.`);
    if (!(await storeTopicComplete(db, map, learnerId, session.id, now))) throw new Error(`${TOPIC} stored no Topic complete card.`);
    await saveShownSession(db, learnerId, session.id);
  },
  /**
   * F1 matrix (#481, §8.3 "reply with Story scene"): a Story reply that code gives the step's written-ahead scene. The
   * Learner presses a Choice: an own question's reply gets no Companion Widget (B6, ADR 0019).
   */
  "story-scene": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await turn(db, map, learnerId, "story-reply", "What happened next?");
  },
  /**
   * F1 matrix (#481, §8.3 "Lingo card"): at Concept, a reply that takes the step's scene, then one about percent change,
   * which code gives the Lingo card for "percent change" (as e2e/widget-when-it-fits.spec.ts plays them).
   */
  lingo: async (db, map, learnerId, now) => {
    await STATES["concept-widget"](db, map, learnerId, now);
    // Choices pressed: an own question's reply gets no Companion Widget (B6, ADR 0019).
    await turn(db, map, learnerId, "concept-two-ways", "Show me.");
    await turn(db, map, learnerId, "concept-percent-change", "What does that word mean?");
  },
  /**
   * F1 matrix (#481, §8.3 "a wrong-choice mix-up fix"): Your turn's first Quick try with its Known mistake tapped. As in a
   * real Session, the try follows a Tutor reply (the Concept turn of concept-widget): a Session of items only would make
   * the page start its opener, which would stream a reply below the answered try.
   */
  "mix-up": async (db, map, learnerId, now) => {
    await STATES["concept-widget"](db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "your_turn");
    const session = await sessionForTurn(db, now, learnerId, TOPIC);
    const tries = (await enterStepItems(db, map, learnerId, session.id, now)).filter((i) => i.kind === QUICK_TRY).map((i) => i.data as QuickTryData);
    const wrong = tries[0]?.choices?.find((c) => c.text === "Rates rose half a percent");
    if (!wrong) throw new Error(`${TOPIC}'s first Quick try has no "Rates rose half a percent" choice.`);
    const answered = await answerQuickTry(db, map, learnerId, tries[0].key, wrong.id, now);
    if (!answered.ok) throw new Error(`The test bed could not answer ${TOPIC}'s Quick try: ${answered.error}`);
  },
  /**
   * Spec 2026-11-11 A10a: concept-widget's reply, then an Off-Topic answer block ("Off-Topic answer · Back to <Topic>",
   * with the arrow Icon). No scripted turn stores one yet, so the state stores it as the Tutor's tool would.
   */
  "off-topic": async (db, map, learnerId, now) => {
    await STATES["concept-widget"](db, map, learnerId, now);
    const session = await liveSession(db, learnerId, TOPIC);
    if (!session) throw new Error(`${TOPIC} has no live Session.`);
    if (!(await storeOffTopic(db, map, learnerId, session.id, now))) throw new Error(`${TOPIC} stored no Off-Topic answer block.`);
  },
  /** Three Topics passed and two in progress, for the Course Map, Notebook and Settings. */
  "many-topics": async (db, map, learnerId, now) => {
    const path = map.topics.map((t) => t.id).filter((id) => id !== TOPIC);
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, () => false);
    for (const id of path.slice(0, 2)) await passTopic(db, map, learnerId, now, id);
    for (const id of path.slice(2, 4)) {
      await saveJump(db, map, id, now, learnerId);
      await ensureTopicStarted(db, map, now, learnerId);
      await sessionForTurn(db, now, learnerId, id);
    }
    await openCurrentTopic(db, learnerId);
  },
  /** many-topics plus one Older session, so the Notebook's Older sessions section shows (B2a fix round). */
  "notebook-older": async (db, map, learnerId, now) => {
    await STATES["many-topics"](db, map, learnerId, now);
    const at = new Date(now.getTime() - 30 * 86_400_000);
    const [older] = await db
      .insert(sessions)
      .values({ learnerId, topicId: null, older: true, instructions: "Test bed fixture.", tools: [], model: "test-bed", effort: "medium", fingerprint: "test-bed", createdAt: at })
      .returning();
    const title = map.topics[0]?.title ?? "Percent";
    await db.insert(messages).values([
      { sessionId: older.id, seq: 0, role: "user", content: [{ type: "text", text: `Topic: ${title} (Foundation Stage).\nTeaching Step: concept` }, { type: "text", text: "Explain it." }], createdAt: at },
      { sessionId: older.id, seq: 1, role: "assistant", content: [{ type: "text", text: "Here is the idea." }], createdAt: at },
    ]);
  },
  /**
   * many-topics plus twelve more Topics with a Session, so the Notebook runs well below the fold at 1512×982 and the
   * current Topic (the last one opened) has its row near the bottom (B2b: following "Open Notebook" scrolls to that row).
   */
  "notebook-long": async (db, map, learnerId, now) => {
    await STATES["many-topics"](db, map, learnerId, now);
    const path = map.topics.map((t) => t.id).filter((id) => id !== TOPIC);
    for (const id of path.slice(4, 16)) {
      await saveJump(db, map, id, now, learnerId);
      await ensureTopicStarted(db, map, now, learnerId);
      await sessionForTurn(db, now, learnerId, id);
    }
    await openCurrentTopic(db, learnerId);
  },
  /**
   * Restart (B3b): Percent passed with one message, a saved reply, an Own rule and a due Review card; the next Topic in
   * progress with a live Session. The two Topics a Learner starts over from the Topic bar and from Settings.
   */
  "restart-topics": async (db, map, learnerId, now) => {
    await STATES["review-due"](db, map, learnerId, now);
    const session = await sessionForTurn(db, now, learnerId, TOPIC);
    await turn(db, map, learnerId, "plain-reply", "Tell me more.");
    const saved = await saveToNotes(db, map, { kind: "reply", sessionId: session.id, turnSeq: 0 }, now, learnerId);
    if (!saved.ok) throw new Error(`The test bed could not save a reply: ${JSON.stringify(saved)}`);
    await saveOwnRule(db, { learnerId, topicId: TOPIC, sessionId: session.id, turnSeq: 0, text: "A point is not a percent.", skillId: null }, now);
    await walk(db, map, learnerId, now, TOPIC, () => false);
    const next = map.topics.map((t) => t.id).find((id) => id !== TOPIC);
    if (!next) throw new Error("The Course Map has a single Topic.");
    await saveJump(db, map, next, now, learnerId);
    await ensureTopicStarted(db, map, now, learnerId);
    await sessionForTurn(db, now, learnerId, next);
    await openCurrentTopic(db, learnerId);
  },
};

/** Passes any Topic by opening it and walking it to the end. */
async function passTopic(db: Db, map: CourseMap, learnerId: number, now: Date, topicId: string) {
  await saveJump(db, map, topicId, now, learnerId);
  await ensureTopicStarted(db, map, now, learnerId);
  await sessionForTurn(db, now, learnerId, topicId);
  await walk(db, map, learnerId, now, topicId, () => false);
}

function open(): boolean {
  return e2eEnabled(process.env) && globalThis.__faE2eIsPglite === true;
}

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET() {
  if (!open()) return notFound();
  return NextResponse.json({ db: "pglite" });
}

/** The test bed's Google-linked Learner (C1b): invited, so she gets in. */
const ASHA: AuthUser = { id: "e2e-google-asha", email: "asha@e2e.example", name: "Asha E2E" };

/** The test bed's owner (ADR 0014): a Google account linked to the owner Learner, as `invites add <email> --learner owner` links it. */
const OWNER: AuthUser = { id: "e2e-google-owner", email: "owner@e2e.example", name: "Owner E2E" };

/** Someone who signed in with nobody's invite, so they wait for the owner. No Google account: she came by email link. */
const NOOR: AuthUser = { id: "e2e-waiting-noor", email: "noor@e2e.example", name: "Noor E2E" };

/** Better Auth's test helpers (mounted only in the test bed), or the response that says what is missing. */
async function testHelpers(): Promise<{ test: TestHelpers } | { refused: NextResponse }> {
  const auth = getAuth();
  if (!auth) return { refused: NextResponse.json({ error: "Sign-in is off in this test bed (set its fake secrets)." }, { status: 500 }) };
  const test = ((await auth.$context) as unknown as { test?: TestHelpers }).test;
  if (!test) return { refused: NextResponse.json({ error: "Better Auth test helpers are not mounted (the test bed mounts them)." }, { status: 500 }) };
  return { test };
}

/** Writes this person's verified Better Auth `user`, once; a second call finds it by email and changes nothing. */
async function savePerson(db: Db, test: TestHelpers, person: AuthUser) {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, person.email)).limit(1);
  if (!existing) await test.saveUser(test.createUser({ ...person, emailVerified: true }));
}

/** `body` as JSON, with a real Better Auth session cookie for this user, so the browser that asked is signed in as them. */
async function signedInAs(test: TestHelpers, userId: string, body: Record<string, unknown>) {
  const { cookies } = await test.login({ userId });
  const response = NextResponse.json(body);
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, {
      path: cookie.path || "/",
      httpOnly: cookie.httpOnly ?? true,
      sameSite: "lax",
      secure: cookie.secure ?? false,
      expires: cookie.expires ? new Date(cookie.expires * 1000) : undefined,
    });
  }
  return response;
}

/**
 * The Google-linked fixture (C1b): one invited Better Auth `user`, its Learner (made through `accessFor`, as every
 * request makes it) opened on Percent's Story step, and a real session cookie from Better Auth's test helpers
 * (mounted only in the test bed). Idempotent: the same user and Learner come back.
 */
async function googleLearner() {
  const helpers = await testHelpers();
  if ("refused" in helpers) return helpers.refused;
  const db = getDb();
  await addInvite(db, ASHA.email);
  await savePerson(db, helpers.test, ASHA);
  const access = await accessFor(db, ASHA);
  if (access.state !== "approved") return NextResponse.json({ error: `The Google fixture user got no Learner (${access.state}).` }, { status: 500 });
  await story(db, loadCourseMap(), access.learner.id, new Date());
  return signedInAs(helpers.test, ASHA.id, { googleLearner: true, learnerId: access.learner.id, email: ASHA.email });
}

/**
 * The owner (ADR 0014): a Better Auth user with a Google account, invited with `--learner owner` so it holds the owner
 * Learner (the migrations' Learner 1, progress and all), signed in. Only this session opens /admin. Answers with how many
 * people wait, the number beside Admin in the owner's account menu. Idempotent: the same user, account and Learner.
 */
async function googleOwner() {
  const helpers = await testHelpers();
  if ("refused" in helpers) return helpers.refused;
  const db = getDb();
  await addInvite(db, OWNER.email, { learnerName: OWNER_NAME });
  await savePerson(db, helpers.test, OWNER);
  await db
    .insert(account)
    .values({ id: `${OWNER.id}-google`, accountId: `${OWNER.id}-sub`, providerId: "google", userId: OWNER.id, updatedAt: new Date() })
    .onConflictDoNothing();
  const access = await accessFor(db, OWNER);
  if (access.state !== "approved" || !isOwnerLearner(access.learner)) {
    return NextResponse.json({ error: `The owner fixture holds no owner Learner (${access.state}).` }, { status: 500 });
  }
  return signedInAs(helpers.test, OWNER.id, { googleOwner: true, learnerId: access.learner.id, email: OWNER.email, waiting: await waitingCount(db) });
}

/**
 * Noor, a verified Better Auth user nobody invited, signed in: she waits for the owner (ADR 0014). Whatever an earlier
 * test did to her, she waits again: her invite (an approval writes one) and any denial go, and her Learner is archived,
 * so approving her makes a fresh one. Answers with how many people wait. Refused while sign-up is open, when nobody waits.
 */
async function waitingUser() {
  const helpers = await testHelpers();
  if ("refused" in helpers) return helpers.refused;
  const db = getDb();
  if (await signupOpen(db)) return NextResponse.json({ error: "Sign-up is open in this test bed, so nobody waits." }, { status: 409 });
  await removeInvite(db, NOOR.email);
  await db.delete(accessDenials).where(eq(accessDenials.userId, NOOR.id));
  await db
    .update(learners)
    .set({ archivedAt: new Date() })
    .where(and(eq(learners.authUserId, NOOR.id), isNull(learners.archivedAt)));
  await savePerson(db, helpers.test, NOOR);
  const access = await accessFor(db, NOOR);
  if (access.state !== "waiting") return NextResponse.json({ error: `The waiting fixture user is ${access.state}, not waiting.` }, { status: 500 });
  return signedInAs(helpers.test, NOOR.id, { waitingUser: true, email: NOOR.email, waiting: await waitingCount(db) });
}

/** The test bed's copy of the Mega Millions 2018 cash option ($877,784,124, before tax, as the Topic file states it). */
const HOME_CASH_OPTION: CaseDatasetInput = {
  caseId: "mega-millions-2018",
  id: "cash-option",
  label: "Cash option",
  unit: "USD",
  source: "Test bed fixture",
  sourceUrl: "https://www.reuters.com/article/lifestyle/south-carolina-lottery-winner-claims-record-877-million-cash-prize-idUSKCN1QM09L/",
  checkedOn: "2026-11-13",
  checkNote: "The figure course/topics/present-value.yaml states; the test bed only.",
  points: [{ date: "2018-10-23", value: 877_784_124 }],
};

export async function POST(request: Request) {
  if (!open()) return notFound();
  const learner = await currentLearner();
  if (!learner || learner.name !== TOOLS_NAME) return NextResponse.json({ error: "Only the tools Learner may seed the test bed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as {
    state?: unknown;
    script?: unknown;
    reset?: unknown;
    googleLearner?: unknown;
    googleOwner?: unknown;
    waitingUser?: unknown;
    invite?: unknown;
    emailLinkFor?: unknown;
    caseData?: unknown;
  };

  if (body.googleLearner === true) return googleLearner();
  if (body.googleOwner === true) return googleOwner();
  if (body.waitingUser === true) return waitingUser();

  if (body.invite !== undefined) {
    if (typeof body.invite !== "string" || !inviteEmail(body.invite).includes("@")) return NextResponse.json({ error: "invite needs an email." }, { status: 400 });
    await addInvite(getDb(), body.invite);
    return NextResponse.json({ invite: inviteEmail(body.invite) });
  }

  if (body.emailLinkFor !== undefined) {
    if (typeof body.emailLinkFor !== "string") return NextResponse.json({ error: "emailLinkFor needs an email." }, { status: 400 });
    const link = takeOutboxLink(body.emailLinkFor);
    if (!link) return NextResponse.json({ error: `No sign-in link is waiting for ${inviteEmail(body.emailLinkFor)}: ask for one on /login first.` }, { status: 404 });
    return NextResponse.json({ link });
  }

  // Spec 2026-11-12 E3: Case Data lives only in the private database, so the test bed seeds the one figure Home's
  // Explorable sets the jackpot against: the cash option, at the figure Present value's Topic file states.
  if (body.caseData === "home-cash-option") return NextResponse.json(await importCaseData(getDb(), [HOME_CASH_OPTION]));

  if (body.script !== undefined) {
    if (!isE2eScript(body.script)) return NextResponse.json({ error: `No script "${String(body.script)}".`, scripts: Object.keys(E2E_SCRIPTS) }, { status: 400 });
    chooseE2eScript(body.script);
    return NextResponse.json({ script: body.script });
  }

  const state = body.reset === true ? "fresh" : body.state;
  if (typeof state !== "string" || !Object.hasOwn(STATES, state)) {
    return NextResponse.json({ error: `No state "${String(state)}".`, states: Object.keys(STATES) }, { status: 400 });
  }
  const db = getDb();
  const fresh = await startOver(db, learner.id);
  if (!fresh) return NextResponse.json({ error: "The tools Learner was started over by something else at the same moment." }, { status: 409 });
  await STATES[state](db, loadCourseMap(), fresh.id, new Date());
  const response = NextResponse.json({ state, learnerId: fresh.id });
  response.cookies.set(ACCESS_COOKIE, await learnerToken(fresh.id, process.env.SESSION_SECRET ?? ""), { ...ACCESS_COOKIE_OPTIONS, maxAge: ACCESS_COOKIE_MAX_AGE });
  return response;
}
