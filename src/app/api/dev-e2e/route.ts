import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { startOver } from "@/auth/learners";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, ACCESS_COOKIE_OPTIONS, TOOLS_NAME, learnerToken } from "@/auth/passcode";
import { currentLearner } from "@/auth/session";
import { type CourseMap, loadCourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { finishForPlacement } from "@/behaviour/place";
import { getDb } from "@/db/client";
import { insightAttempts, messages, reviewCards, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { e2eEnabled } from "@/dev/e2e-mode";
import { E2E_SCRIPTS, chooseE2eScript, isE2eScript } from "@/dev/e2e-tutor";
import { ensureTopicStarted, loadProgress, openCurrentTopic, saveCheckResult, saveJump } from "@/learner/memory";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { reviewState } from "@/learner/review";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { enterStepItems } from "@/tutor/practice";
import { sessionForTurn } from "@/tutor/session-log";
import { runTutorTurn } from "@/tutor/turn";

export const runtime = "nodejs";

/**
 * The browser test bed's fixture route (spec 2026-11-05, T-00). `POST {state}` starts the tools Learner over and builds
 * a named state on the fresh Learner (signing this browser in as it); `POST {script}` picks the scripted Tutor's next
 * reply; `POST {reset: true}` is `{state: "fresh"}`; `GET` says which database is open.
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

/** Opens the Topic at its Story step with one live Session. */
const story: Build = async (db, map, learnerId, now) => {
  await saveJump(db, map, TOPIC, now, learnerId);
  await ensureTopicStarted(db, map, now, learnerId);
  await sessionForTurn(db, now, learnerId, TOPIC);
};

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
  /** The Topic at Concept, with one Widget shown by a scripted turn. */
  "concept-widget": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, (step) => step === "concept");
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
  /** The Topic passed; the next Topic is recommended. */
  "topic-complete": async (db, map, learnerId, now) => {
    await story(db, map, learnerId, now);
    await walk(db, map, learnerId, now, TOPIC, () => false);
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

export async function POST(request: Request) {
  if (!open()) return notFound();
  const learner = await currentLearner();
  if (!learner || learner.name !== TOOLS_NAME) return NextResponse.json({ error: "Only the tools Learner may seed the test bed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { state?: unknown; script?: unknown; reset?: unknown };

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
