import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { learnerForClerkUser } from "@/auth/clerk-learner";
import { startOver } from "@/auth/learners";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, ACCESS_COOKIE_OPTIONS, TOOLS_NAME, learnerToken } from "@/auth/passcode";
import { currentLearner } from "@/auth/session";
import { type CourseMap, loadCourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { finishForPlacement } from "@/behaviour/place";
import { importCaseData, type CaseDatasetInput } from "@/case-data/import";
import { getDb } from "@/db/client";
import { insightAttempts, libraryPassages, librarySources, messages, reviewCards, sessions } from "@/db/schema";
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
 * `POST {person: "owner" | "asha"}` (issue #33) signs this browser in as one of the test bed's people
 * (src/dev/e2e-identity.ts): Clerk is off in the test bed, so a signed `fa_e2e_person` cookie stands in for a Clerk
 * session, and the person's Learner is found or made as a first Clerk sign-in makes it. The owner is the admin.
 * Idempotent: the same person and Learner come back. `ravi` (spec #68) comes back with every Spine Topic passed.
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
  /** Spine Topic 1 at explore, the Insight not yet settled: its question with choices to tap (ticket #88, e2e/no-typing.spec.ts). */
  "spine-01-explore": async (db, map, learnerId, now) => {
    await storyOf(SPINE_ONE)(db, map, learnerId, now);
    await walk(db, map, learnerId, now, SPINE_ONE, (step) => step === "explore");
  },
  /** Spine Topic 1 at its judging Check (worth-talk), the quiz Check passed, with the judging quiz open (ticket #88). */
  "spine-01-judging": async (db, map, learnerId, now) => {
    await storyOf(SPINE_ONE)(db, map, learnerId, now);
    await walk(db, map, learnerId, now, SPINE_ONE, (step) => step === "check");
    await saveCheckResult(db, map, { checkId: "worth-check", passed: true, evidence: "Test bed fixture." }, now, learnerId);
    await walk(db, map, learnerId, now, SPINE_ONE, (step) => step === "check");
    if (navigate(map, await loadProgress(db, learnerId))?.check?.id !== "worth-talk") throw new Error(`${SPINE_ONE} is not at its judging Check.`);
    if (!(await openQuiz(db, map, now, learnerId))) throw new Error(`${SPINE_ONE}'s judging Check is not a quiz.`);
  },
  /** Spine Topics 2 and 3 at their Story steps, for their first turns played through the page (#89, e2e/spine-02-03.spec.ts). */
  "spine-02-start": storyOf("spine-02-money-later"),
  "spine-03-start": storyOf("spine-03-cash"),
  /** The annual report Topic at its Story step, for #93's three-turn play (e2e/spine-annual-report.spec.ts). */
  "spine-ar-start": storyOf("spine-annual-report"),
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
   * Learner presses a Choice: an own question's reply gets no Companion Widget (B6, ADR 0008).
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
    // Choices pressed: an own question's reply gets no Companion Widget (B6, ADR 0008).
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

/** Passes every Spine Topic not passed yet, walked as a Learner would (spec #68: the test bed's "Spine passed" person). */
async function passSpine(db: Db, map: CourseMap, learnerId: number, now: Date) {
  const progress = await loadProgress(db, learnerId);
  for (const t of map.topics.filter((t) => t.stage === "spine").sort((a, b) => (a.spine ?? 0) - (b.spine ?? 0))) {
    if (progress.topics[t.id]?.status !== "passed") await passTopic(db, map, learnerId, now, t.id);
  }
}

function open(): boolean {
  return e2eEnabled(process.env) && globalThis.__faE2eIsPglite === true;
}

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET() {
  if (!open()) return notFound();
  return NextResponse.json({ db: "pglite" });
}

/**
 * Signs this browser in as a test-bed person (issue #33): their Learner, found or made by the same `learnerForClerkUser`
 * a real Clerk sign-in goes through, and the signed `fa_e2e_person` cookie. e2e-identity.ts is loaded here, behind the
 * NODE_ENV test the build removes, so a production build never carries the test people.
 */
async function signInPerson(person: unknown): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") return notFound();
  const { E2E_PEOPLE, E2E_PERSON_COOKIE, E2E_PERSON_COOKIE_OPTIONS, e2ePersonToken, isE2ePerson } = await import("@/dev/e2e-identity");
  if (!isE2ePerson(person)) return NextResponse.json({ error: `No person "${String(person)}".`, people: Object.keys(E2E_PEOPLE) }, { status: 400 });
  const identity = E2E_PEOPLE[person];
  const learner = await learnerForClerkUser(getDb(), identity);
  if (person === "ravi") await passSpine(getDb(), loadCourseMap(), learner.id, new Date());
  const response = NextResponse.json({ person, email: identity.email, learnerId: learner.id });
  response.cookies.set(E2E_PERSON_COOKIE, await e2ePersonToken(person, process.env.SESSION_SECRET ?? ""), E2E_PERSON_COOKIE_OPTIONS);
  return response;
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

/**
 * A Library passage for the test bed (spec #68, #84: the passage page on a phone), with the long, unbroken web address in
 * its credit line that OpenStax asks for, the hardest thing on that page to fit at 360 px. Upserted, so a second call
 * answers the same passage.
 */
async function longCreditPassage(db: Db) {
  const credit =
    "Julie Dahlquist and Rainford Knight, Principles of Finance 2e (OpenStax, Houston, Texas, 2026), CC BY-NC-SA 4.0. Access for free at https://openstax.org/books/principles-finance-2e/pages/1-why-it-matters";
  const url = "https://openstax.org/books/principles-finance-2e/pages/1-1-what-is-finance";
  await db
    .insert(librarySources)
    .values({ id: "e2e-openstax", title: "Principles of Finance 2e (test bed)", kind: "timeless", licence: "CC BY-NC-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/", credit, url, fetchedOn: "2026-11-01" })
    .onConflictDoNothing();
  const [row] = await db
    .insert(libraryPassages)
    .values({
      sourceId: "e2e-openstax",
      ref: "1-1",
      heading: "What Is Finance?",
      url,
      text: "Finance is the study of money. It asks how people and businesses raise, spend and save it over time. A business is worth the cash it will make, discounted back to today.",
      licence: "CC BY-NC-SA 4.0",
      credit,
    })
    .onConflictDoUpdate({ target: [libraryPassages.sourceId, libraryPassages.ref], set: { heading: "What Is Finance?" } })
    .returning({ id: libraryPassages.id });
  return { passageId: row.id };
}

export async function POST(request: Request) {
  if (!open()) return notFound();
  const learner = await currentLearner();
  if (!learner || learner.name !== TOOLS_NAME) return NextResponse.json({ error: "Only the tools Learner may seed the test bed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as {
    state?: unknown;
    script?: unknown;
    reset?: unknown;
    person?: unknown;
    caseData?: unknown;
    passage?: unknown;
  };

  if (body.person !== undefined) return signInPerson(body.person);

  // Spec 2026-11-12 E3: Case Data lives only in the private database, so the test bed seeds the one figure Home's
  // Explorable sets the jackpot against: the cash option, at the figure Present value's Topic file states.
  if (body.caseData === "home-cash-option") return NextResponse.json(await importCaseData(getDb(), [HOME_CASH_OPTION]));
  if (body.passage === "long-credit") return NextResponse.json(await longCreditPassage(getDb()));

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
