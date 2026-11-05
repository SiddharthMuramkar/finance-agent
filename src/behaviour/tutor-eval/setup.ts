/**
 * Sets a live case's Learner state up on a throwaway database through the real code paths (ticket #236), and
 * reads back what a Tutor Turn showed. Placement saves progress as the course does (finished steps, passed
 * Checks); a quiz attempt is opened by the Check tab's own code and, for a pinned case, given the case's
 * questions; a missed attempt is submitted through the quiz submit; Skill state is recorded answer by answer;
 * earlier turns are replayed through the real Tutor Turn with a scripted model, so they cost nothing.
 */
import { and, eq, gt, max, sql } from "drizzle-orm";
import { loadCourseMap, type Check, type CourseMap, type Topic } from "@/course/map";
import { navigate, type Place } from "@/course/navigator";
import { WIDGET_OPENED, writtenAheadWidgets } from "@/course/written-ahead";
import { choicesFor, plainExact, type DrawnItem, type FixedItem } from "@/teaching";
import { choiceForTyped } from "@/teaching/typed-to-choice";
import { questionLookup } from "@/bank/lookup";
import { insightAttempts, noteItems, quizAttempts, sessionItems, settings, toolCalls, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { freshToolsLearner } from "@/dev/tools-learner";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveJump } from "@/learner/memory";
import { finishForPlacement } from "@/behaviour/place";
import { checkTabNow } from "@/learner/quiz";
import { noteMethodUsed, recordAnswer, skillStates } from "@/learner/skill-state";
import { scriptedClient } from "@/test/scripted-client";
import { submitQuizAnswers } from "@/tutor/check-results";
import { ENGINE_TOOLS, TUTOR_TOOLS } from "@/tutor/instructions";
import { answerQuickTry, nextQuickTry, quickTryItem } from "@/tutor/practice";
import { QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData, type QuickTryResultData } from "@/tutor/session-item-kinds";
import { liveSession } from "@/tutor/session-log";
import type { OpenItem, ReplyCheckContext, StepKind } from "@/tutor/reply-checks";
import { loadSessionItems, saveItemAfterLatest } from "@/tutor/session-items";
import { runTutorTurn, type TurnEvent } from "@/tutor/turn";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { recipeById } from "@/widgets/recipes";
import type { LiveCase } from "./case";
import { seen, type SeenReply, type SeenWidget } from "./grading";

/** The model, effort and widget engine the Tutor runs on in this throwaway database. */
export type TutorSettings = { model: string; effort: string; widgetEngine: "on" | "off" };

export type Prepared = {
  learnerId: number;
  topic: Topic;
  place: Place;
  /** The open quiz attempt's questions, with their answers (kept on the server). */
  openItems: OpenItem[];
  ctx: ReplyCheckContext;
  /** Where the Learner is, in words, for the grader. */
  stateNote: string;
};

/** Why a case cannot run yet on today's code and Topic files; null when it can. */
export function pendingReason(c: LiveCase, map: CourseMap): string | null {
  if (c.pending) return c.pending;
  const topic = map.topic(c.topic);
  if (!topic) return `There is no Topic "${c.topic}" on the Course Map.`;
  const skills = skillIdsOf(topic);
  const needed = [...(c.state.skills ?? []).map((s) => s.skill), ...(c.answer ? [c.answer.skill] : [])];
  const missing = [...new Set(needed.filter((s) => !skills.includes(s)))];
  if (missing.length) return `${topic.id} lists no Skill ${missing.join(", ")} yet, so its Skill state cannot be set up (the Topic is converted by its own ticket).`;
  if (c.state.check > topic.checks.length) return `${topic.id} has ${topic.checks.length} Check(s), not a Check ${c.state.check}.`;
  // A Quick try a case names must be a fixed try of the case's Check (and, for the answer, on the answer's Skill).
  const check = topic.checks[c.state.check - 1];
  const fixedTry = (id: string) => check.quickTries.find((q) => "id" in q && q.id === id) as { skill?: string } | undefined;
  if (c.answer?.try) {
    const found = fixedTry(c.answer.try);
    if (!found) return `Check ${c.state.check} of ${topic.id} (${check.id}) has no fixed Quick try "${c.answer.try}".`;
    if (found.skill !== c.answer.skill) return `Quick try ${c.answer.try} is on the Skill ${found.skill}, not ${c.answer.skill}.`;
  }
  const missingTry = (c.state.answeredTries ?? []).find((t) => !fixedTry(t.try));
  if (missingTry) return `Check ${c.state.check} of ${topic.id} (${check.id}) has no fixed Quick try "${missingTry.try}".`;
  return null;
}

/** The Skill ids a converted Topic's file lists; none for a Topic not yet converted. */
export function skillIdsOf(topic: Topic): string[] {
  const raw = (topic as { skills?: unknown }).skills;
  if (Array.isArray(raw)) return raw.flatMap((s) => (typeof s === "string" ? [s] : typeof (s as { id?: unknown })?.id === "string" ? [(s as { id: string }).id] : []));
  if (raw && typeof raw === "object") return Object.keys(raw);
  return [];
}

/** Writes the Tutor's model, effort and widget engine into the throwaway database, before any Session is made. */
export async function saveTutorSettings(db: Db, s: TutorSettings): Promise<void> {
  for (const [key, value] of [["model", s.model], ["effort", s.effort], ["widget_engine", s.widgetEngine]] as const) {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}

const STEP_KIND: Record<string, StepKind> = { story: "story", concept: "concept", explore: "explore", your_turn: "your_turn", check: "check", reveal: "reveal", principle: "principle" };

async function walkTo(db: Db, map: CourseMap, topic: Topic, c: LiveCase, learnerId: number): Promise<Place> {
  await ensureTopicStarted(db, map, new Date(), learnerId);
  for (let i = 0; i < 40; i++) {
    const place = navigate(map, await loadProgress(db, learnerId));
    if (!place || place.topic.id !== topic.id) throw new Error(`${c.id}: the Learner left ${topic.id} before reaching ${c.state.step} of Check ${c.state.check}.`);
    const checkNo = place.check ? topic.checks.indexOf(place.check) + 1 : 0;
    if (place.step === c.state.step && (checkNo === c.state.check || c.state.step === "story")) return place;
    if (place.step === "check" && place.check) {
      await saveCheckResult(db, map, { checkId: place.check.id, passed: true }, new Date(), learnerId);
    } else {
      // Explore only finishes once the Insight is settled, so walking past it records it as told (as placeLearner does).
      if (place.step === "explore") {
        await db.insert(insightAttempts).values({ learnerId, topicId: topic.id, reported: "asked_to_be_told", released: "told", words: "", toolCallId: `tutor-eval-${topic.id}-${learnerId}-${i}` });
      }
      const moved = await finishForPlacement(db, map, place.step, learnerId);
      if (!moved.ok) throw new Error(`${c.id}: could not finish ${place.step}: ${moved.reason}`);
    }
  }
  throw new Error(`${c.id}: could not place the Learner at ${c.state.step} of Check ${c.state.check}.`);
}

async function drain(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** Sets the case's state up for a fresh tools Learner and returns what the checks and the grader need. Call `pendingReason` first. */
export async function prepareCase(db: Db, c: LiveCase, opts: { map?: CourseMap; settings?: TutorSettings } = {}): Promise<Prepared> {
  const map = opts.map ?? loadCourseMap();
  if (opts.settings) await saveTutorSettings(db, opts.settings);
  const topic = map.topic(c.topic);
  if (!topic) throw new Error(`${c.id}: no Topic "${c.topic}".`);
  const { id: learnerId } = await freshToolsLearner(db);
  const jumped = await saveJump(db, map, topic.id, new Date(), learnerId);
  if (!jumped.ok) throw new Error(`${c.id}: could not choose ${topic.id}: ${jumped.reason}`);
  const place = await walkTo(db, map, topic, c, learnerId);

  // Earlier turns, through the real Tutor Turn, with the recorded Tutor text as a scripted model's reply.
  for (const h of c.state.history ?? []) {
    const { client } = scriptedClient([{ content: [{ type: "text", text: h.tutor }] }]);
    const events = await drain(runTutorTurn({ db, client, map, learnerId, checkReplies: false }, h.learner));
    if (events.at(-1)?.type !== "done") throw new Error(`${c.id}: replaying an earlier turn failed: ${JSON.stringify(events.at(-1))}`);
  }

  const notes: string[] = [];
  let openItems: OpenItem[] = [];
  const check = topic.checks[c.state.check - 1];
  if (c.state.quiz) {
    const tab = await checkTabNow(db, map, new Date(), learnerId);
    if (!tab.quiz) throw new Error(`${c.id}: Check ${c.state.check} of ${topic.id} opened no quiz.`);
    let ids = tab.quiz.questions.map((q) => q.id);
    const pinned = c.state.quiz.questions;
    if (pinned && check.kind === "quiz") {
      if (pinned.every((id) => (check.questions ?? []).includes(id))) {
        // The Check tab's own code opened the attempt; the case pins which questions it shows.
        await db.update(quizAttempts).set({ questionIds: pinned }).where(eq(quizAttempts.id, tab.quiz.attemptId));
        ids = pinned;
      } else notes.push(`The case's questions are no longer in ${check.id}, so the attempt keeps the questions code chose.`);
    }
    const lookup = await questionLookup(db, map, ids);
    const items = ids.flatMap((id) => {
      const q = lookup.question(id);
      if (!q) return [];
      const wrong = q.choices.find((ch) => ch.id !== q.answer);
      return [{ id, prompt: q.prompt.trim(), choices: q.choices.map((ch) => ch.text), answer: q.choices.find((ch) => ch.id === q.answer)?.text, answerId: q.answer, wrongId: wrong?.id ?? "" }];
    });
    if (c.state.quiz.state === "open") {
      openItems = items.map(({ prompt, choices, answer }) => ({ prompt, choices, answer }));
      notes.push(
        `Check ${c.state.check}'s quiz is open, and the Learner has not submitted it. Its questions: ${items.map((q, i) => `${i + 1}. ${q.prompt} (${q.choices.length ? `choices: ${q.choices.join(" / ")}` : "the Learner types the answer"}; right answer, which the Tutor must keep back: ${q.answer})`).join(" ")}`,
      );
    } else {
      const correct = c.state.quiz.correct;
      const answers = Object.fromEntries(items.map((q, i) => [q.id, i < correct ? q.answerId : q.wrongId]));
      const result = await submitQuizAnswers(db, map, tab.quiz.attemptId, answers, new Date(), learnerId);
      if (!result.ok) throw new Error(`${c.id}: could not submit the quiz: ${result.reason}`);
      if (result.correctCount !== correct) throw new Error(`${c.id}: the submitted quiz scored ${result.correctCount} right, not the ${correct} the case says.`);
      // What was typed on the questions that were missed, so the grader reads the slips the Tutor was told.
      const typed = result.questions.flatMap((q, i) => (q.templateId && !q.correct ? [`${i + 1}. they picked "${q.given}" (right: ${q.expected})`] : []));
      notes.push(`The Learner just submitted Check ${c.state.check}'s quiz and got ${correct} of ${items.length} right${typed.length ? `; ${typed.join("; ")}` : ""}. No quiz is open now.`);
    }
  }

  for (const s of c.state.skills ?? []) {
    for (const [i, verdict] of s.answers.entries()) {
      await recordAnswer(db, { learnerId, topicId: topic.id, skillId: s.skill, itemKey: `tutor-eval-${s.skill}-${i}`, itemId: `tutor-eval-${s.skill}`, input: verdict, verdict, source: "quick_try" });
    }
    for (const m of s.methodsUsed ?? []) await noteMethodUsed(db, learnerId, topic.id, s.skill, m);
    notes.push(`On the Skill ${s.skill}, the Learner's earlier answers were ${s.answers.join(", ")}; methods already used on it: ${(s.methodsUsed ?? []).join(", ") || "none"}.`);
  }
  // Tries answered since the Tutor's last reply go through the real Quick-try mark, so the Tutor is told of them next turn.
  for (const t of c.state.answeredTries ?? []) {
    const { data, result } = await showAndMark(db, map, c, { learnerId, topic }, { tryId: t.try, input: t.input }, new Date());
    if ((result?.verdict === "right") !== (t.verdict === "right")) throw new Error(`${c.id}: code marked "${t.input}" ${result?.verdict ?? "unmarked"} on ${t.try}, but the case expects ${t.verdict}.`);
    notes.push(`After the Tutor's last reply the Learner answered the Quick try "${askOf(data)}" with "${t.input}", and code marked it ${t.verdict === "right" ? "right" : "not right"} (the Tutor is told this with their next message).`);
  }
  if (c.answer) notes.push(`The Learner's message answers a Quick try on ${c.answer.skill}, marked by code (answerDrawnTry), which then asks for a follow-up turn.`);
  for (const h of c.state.history ?? []) notes.push(`Earlier in the Session. Learner: "${h.learner}" Tutor: "${h.tutor}"`);

  const widgets = writtenAheadWidgets(topic);
  const internalWords = [
    topic.id,
    ...topic.checks.map((ch) => ch.id),
    ...topic.questions.map((q) => q.id),
    ...widgets.map((w) => w.id),
    ...new Set([...TUTOR_TOOLS, ...ENGINE_TOOLS].map((t) => t.name)),
  ];
  const ctx: ReplyCheckContext = {
    step: STEP_KIND[place.step] ?? "none",
    replyKind: c.state.replyKind,
    exampleCurrency: c.state.exampleCurrency ?? topic.exampleCurrency,
    caseCurrencies: c.state.caseCurrencies ?? [],
    openItems,
    internalWords,
    widgetOk: (w) => {
      if (w.id === DRAWN) return "it was drawn during the chat; Widgets are ready-made (ADR 0007)";
      if (w.kind === "recipe") {
        const recipe = recipeById(w.id);
        if (!recipe) return `there is no recipe "${w.id}"`;
        const built = recipe.build(w.params ?? {});
        return built.ok ? null : built.error;
      }
      return widgets.some((x) => x.id === w.id) ? null : `this Topic has no written-ahead Widget "${w.id}"`;
    },
  };
  const stepName = place.step.replace("_", " ");
  const stateNote = [`Topic "${topic.title}", the ${stepName} step of Check ${c.state.check} of ${topic.checks.length}.`, ...notes].join(" ");
  return { learnerId, topic, place, openItems, ctx, stateNote };
}

/** The id given to a Widget the reply drew in an openui-lang fence, which ready-made Widgets never are. */
export const DRAWN = "(drawn in the chat)";

const stringsIn = (code: string) => [...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);

/** The latest note id, so the notes a turn adds can be told apart. */
export async function noteMark(db: Db, learnerId: number): Promise<number> {
  const [{ last }] = await db.select({ last: max(noteItems.id) }).from(noteItems).where(eq(noteItems.learnerId, learnerId));
  return last ?? 0;
}

/**
 * What the Tutor itself stored in one turn, from the turn's successful tool calls: the ids of the Widgets its show_widget
 * and compose_widget calls stored (a shown Widget's id is its tool call's id), and whether it opened a written-ahead one.
 * A Widget item that is not among them was stored by code (the Concept card's, the reveal's, a re-teach's).
 */
async function tutorStored(db: Db, sessionId: number, turnSeq: number): Promise<{ shown: Set<string>; opened: boolean }> {
  const calls = await db
    .select({ id: toolCalls.toolCallId, name: toolCalls.name })
    .from(toolCalls)
    .innerJoin(turns, eq(turns.id, toolCalls.turnId))
    .where(and(eq(turns.sessionId, sessionId), eq(turns.turnSeq, turnSeq), eq(toolCalls.isError, false)));
  return { shown: new Set(calls.filter((c) => c.name === "show_widget" || c.name === "compose_widget").map((c) => c.id)), opened: calls.some((c) => c.name === "open_widget") };
}

/**
 * The reply of one finished turn as the Learner sees it: the text, the Widgets it opened, showed or drew, the
 * rule a tool saved to the Topic Note during the turn (a note that is not a saved reply or Widget), and any park
 * offer item code stored. A Widget code stored itself in the turn is marked `byCode`, so the conditions about what the
 * Tutor showed leave it out.
 */
export async function seenReply(db: Db, args: { learnerId: number; topic: Topic; sessionId: number; turnSeq: number; text: string; notesAfter: number }): Promise<SeenReply> {
  const items = (await loadSessionItems(db, args.sessionId, args.learnerId)).filter((i) => i.afterSeq >= args.turnSeq);
  const written = writtenAheadWidgets(args.topic);
  const tutor = await tutorStored(db, args.sessionId, args.turnSeq);
  const widgets: SeenWidget[] = items.flatMap((i): SeenWidget[] => {
    if (i.kind === WIDGET_SHOWN) {
      const d = i.data as ShownWidget;
      return [{ kind: "recipe", id: d.recipe || DRAWN, params: d.params, labels: [d.title, ...stringsIn(d.code ?? "")], ...(tutor.shown.has(d.id) ? {} : { byCode: true }) }];
    }
    if (i.kind === WIDGET_OPENED) {
      const id = String(i.data.id);
      return [{ kind: "written", id, labels: [String(i.data.title ?? ""), ...stringsIn(written.find((w) => w.id === id)?.code ?? "")], ...(tutor.opened ? {} : { byCode: true }) }];
    }
    return [];
  });
  for (const m of args.text.matchAll(/```openui-lang\n([\s\S]*?)(?:\n```|$)/g)) widgets.push({ kind: "recipe", id: DRAWN, labels: stringsIn(m[1]) });
  const saved = await db
    .select({ text: noteItems.text, kind: noteItems.kind })
    .from(noteItems)
    .where(and(eq(noteItems.learnerId, args.learnerId), eq(noteItems.topicId, args.topic.id), gt(noteItems.id, args.notesAfter)));
  const rule = saved.find((n) => n.kind !== "reply" && n.kind !== "widget" && n.text)?.text ?? null;
  const parkOffer = items.some((i) => /park/i.test(i.kind));
  // The Quick try code put below the reply in this turn (after a re-teach, the next one), which a reply may point to ("the try below").
  const alsoShown = items.flatMap((i): string[] => (i.kind === QUICK_TRY ? [`a Quick try: "${askOf(i.data as unknown as QuickTryData)}"`] : []));
  return seen({ text: args.text, widgets, savedRule: rule, parkOffer, alsoShown });
}

/**
 * A fixed Quick try as the Session shows it: the same item `nextQuickTry` makes for a key (the answer stays on the server,
 * which finds the item again from the key).
 */
function shownTry(check: Check, key: string, found: { item: FixedItem | DrawnItem; halfDone?: string }): QuickTryData {
  const { item, halfDone } = found;
  const drawn = "templateId" in item;
  const set = choicesFor(item, key);
  return {
    key,
    checkId: check.id,
    skillId: item.skill,
    prompt: drawn ? item.prompt : item.ask,
    kind: drawn || item.kind !== "truth" ? "choice" : "truth",
    ...(set && { choices: set.choices.map(({ id, text }) => ({ id, text })) }),
    ...(halfDone && { halfDone }),
  };
}

/** A Quick try's words as the Learner reads them: the ask, then the first step shown done when it has one. */
const askOf = (t: QuickTryData) => [t.prompt, t.halfDone].filter(Boolean).join(" ");

/**
 * Takes out the Quick tries the case's earlier turns posted that nobody answered. A turn at Your turn posts the next try
 * as the app does, but the case's story is that the try it shows is the open one: with another still open, code would post
 * nothing below the Tutor's reply, and "the try below" would point at nothing.
 */
async function clearOpenTries(db: Db, sessionId: number, learnerId: number): Promise<void> {
  const items = await loadSessionItems(db, sessionId, learnerId);
  const answered = new Set(items.filter((i) => i.kind === QUICK_TRY_RESULT).map((i) => (i.data as unknown as QuickTryResultData).key));
  for (const i of items) {
    const key = (i.data as unknown as QuickTryData).key;
    if (i.kind === QUICK_TRY && !answered.has(key)) {
      await db.delete(sessionItems).where(and(eq(sessionItems.sessionId, sessionId), eq(sessionItems.learnerId, learnerId), eq(sessionItems.kind, QUICK_TRY), sql`${sessionItems.data}->>'key' = ${key}`));
    }
  }
}

/**
 * Shows a Quick try in the Session and has code mark an answer to it, the way the app does (`answerQuickTry`, no model
 * call). The try is the fixed try with `tryId` in the Check, so it is the one the case's earlier turns talk about; without
 * one, it is the next try code draws on `skill`. Throws when the try cannot be shown or the answer is refused.
 */
async function showAndMark(
  db: Db,
  map: CourseMap,
  c: LiveCase,
  p: { learnerId: number; topic: Topic },
  want: { tryId?: string; skill?: string; input: string },
  now: Date,
): Promise<{ data: QuickTryData; followUp: boolean; result: QuickTryResultData | undefined }> {
  const check = p.topic.checks[c.state.check - 1];
  const session = await liveSession(db, p.learnerId, p.topic.id);
  if (!session) throw new Error(`${c.id}: no Session to show the Quick try in; give the case a history.`);
  await clearOpenTries(db, session.id, p.learnerId);
  const shown = (await loadSessionItems(db, session.id, p.learnerId)).filter((i) => i.kind === QUICK_TRY).map((i) => i.data as unknown as QuickTryData);
  let data: QuickTryData | null;
  if (want.tryId) {
    const key = `qt:${session.id}:${shown.length}:${want.tryId}`;
    const found = quickTryItem(p.topic, key);
    data = found ? shownTry(check, key, found) : null;
  } else {
    data = nextQuickTry(p.topic, check, await skillStates(db, p.learnerId, p.topic.id), shown, { skillId: want.skill, session: session.id });
  }
  if (!data || (want.skill && data.skillId !== want.skill)) throw new Error(`${c.id}: no Quick try can be shown${want.skill ? ` on ${want.skill}` : ""}${want.tryId ? ` as "${want.tryId}"` : ""}.`);
  await saveItemAfterLatest(db, p.learnerId, session.id, { kind: QUICK_TRY, data: data as unknown as Record<string, unknown> }, now);
  const found = quickTryItem(p.topic, data.key);
  const out = await answerQuickTry(db, map, p.learnerId, data.key, found ? choiceForTyped(found.item, want.input) : want.input, now);
  if (!out.ok) throw new Error(`${c.id}: the Quick try answer was refused: ${out.error}`);
  return { data, followUp: out.followUp, result: out.items.find((i) => i.kind === QUICK_TRY_RESULT)?.data as unknown as QuickTryResultData | undefined };
}

/**
 * Answers a case's Quick try the way the app does: a try is shown in the Session (the fixed try the case names, so it is
 * the one the earlier turns talk about, else the next try code draws on the answer's Skill), then the case's message
 * goes through `answerQuickTry` (code marks it, with no model call). Returns whether the answer asks for a follow-up
 * turn, which the caller then runs as `{ quickTryFollowUp: true }`. Throws when it cannot, or when code marks the
 * answer right, since the case expects a miss. The try and its mark are added to `p.stateNote`, so the grader reads the
 * numbers the Tutor was shown.
 */
export async function answerDrawnTry(db: Db, map: CourseMap, c: LiveCase, p: Prepared, now = new Date()): Promise<boolean> {
  if (!c.answer) throw new Error(`${c.id}: the case has no answer.`);
  const { data, followUp, result } = await showAndMark(db, map, c, p, { tryId: c.answer.try, skill: c.answer.skill, input: c.message }, now);
  if (result?.verdict === "right") throw new Error(`${c.id}: code marked "${c.message}" right on the shown try, but the case expects a miss.`);
  const marked = result?.verdict === "known_mistake" ? `a Known mistake, and code showed its fix ("${result.line}")` : "not right";
  p.stateNote += ` Code showed the Learner the Quick try "${askOf(data)}" and marked their answer "${c.message}" as ${marked}.`;
  return followUp;
}
