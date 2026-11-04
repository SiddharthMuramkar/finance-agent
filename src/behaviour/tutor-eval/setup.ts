/**
 * Sets a live case's Learner state up on a throwaway database through the real code paths (ticket #236), and
 * reads back what a Tutor Turn showed. Placement saves progress as the course does (finished steps, passed
 * Checks); a quiz attempt is opened by the Check tab's own code and, for a pinned case, given the case's
 * questions; a missed attempt is submitted through the quiz submit; Skill state is recorded answer by answer;
 * earlier turns are replayed through the real Tutor Turn with a scripted model, so they cost nothing.
 */
import { and, eq, gt, max } from "drizzle-orm";
import { loadCourseMap, type CourseMap, type Topic } from "@/course/map";
import { navigate, type Place } from "@/course/navigator";
import { WIDGET_OPENED, writtenAheadWidgets } from "@/course/written-ahead";
import { questionLookup } from "@/bank/lookup";
import { insightAttempts, noteItems, quizAttempts, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { freshToolsLearner } from "@/dev/tools-learner";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveFinishedStep, saveJump } from "@/learner/memory";
import { checkTabNow } from "@/learner/quiz";
import { noteMethodUsed, recordAnswer } from "@/learner/skill-state";
import { scriptedClient } from "@/test/scripted-client";
import { submitQuizAnswers } from "@/tutor/check-results";
import { ENGINE_TOOLS, TUTOR_TOOLS } from "@/tutor/instructions";
import type { OpenItem, ReplyCheckContext, StepKind } from "@/tutor/reply-checks";
import { loadSessionItems } from "@/tutor/session-items";
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
export async function useSettings(db: Db, s: TutorSettings): Promise<void> {
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
      const moved = await saveFinishedStep(db, map, place.step, new Date(), learnerId);
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
  if (opts.settings) await useSettings(db, opts.settings);
  const topic = map.topic(c.topic);
  if (!topic) throw new Error(`${c.id}: no Topic "${c.topic}".`);
  const { id: learnerId } = await freshToolsLearner(db);
  const jumped = await saveJump(db, map, topic.id, new Date(), learnerId);
  if (!jumped.ok) throw new Error(`${c.id}: could not choose ${topic.id}: ${jumped.reason}`);
  const place = await walkTo(db, map, topic, c, learnerId);

  // Earlier turns, through the real Tutor Turn, with the recorded Tutor text as a scripted model's reply.
  for (const h of c.state.history ?? []) {
    const { client } = scriptedClient([{ content: [{ type: "text", text: h.tutor }] }]);
    const events = await drain(runTutorTurn({ db, client, map, learnerId }, h.learner));
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
      if (pinned.every((id) => check.questions.includes(id))) {
        // The Check tab's own code opened the attempt; the case pins which questions it shows.
        await db.update(quizAttempts).set({ questionIds: pinned }).where(eq(quizAttempts.id, tab.quiz.attemptId));
        ids = pinned;
      } else notes.push(`The case's questions are no longer in ${check.id}, so the attempt keeps the questions code chose.`);
    }
    const lookup = await questionLookup(db, map, ids);
    const items = ids.flatMap((id) => {
      const q = lookup.question(id);
      return q ? [{ id, prompt: q.prompt.trim(), choices: q.choices.map((ch) => ch.text), answer: q.choices.find((ch) => ch.id === q.answer)?.text, answerId: q.answer, wrongId: q.choices.find((ch) => ch.id !== q.answer)!.id }] : [];
    });
    if (c.state.quiz.state === "open") {
      openItems = items.map(({ prompt, choices, answer }) => ({ prompt, choices, answer }));
      notes.push(
        `Check ${c.state.check}'s quiz is open, and the Learner has not submitted it. Its questions: ${items.map((q, i) => `${i + 1}. ${q.prompt} (choices: ${q.choices.join(" / ")}; right answer, which the Tutor must keep back: ${q.answer})`).join(" ")}`,
      );
    } else {
      const correct = c.state.quiz.correct;
      const answers = Object.fromEntries(items.map((q, i) => [q.id, i < correct ? q.answerId : q.wrongId]));
      const result = await submitQuizAnswers(db, map, tab.quiz.attemptId, answers, new Date(), learnerId);
      if (!result.ok) throw new Error(`${c.id}: could not submit the quiz: ${result.reason}`);
      notes.push(`The Learner just submitted Check ${c.state.check}'s quiz and got ${correct} of ${items.length} right. No quiz is open now.`);
    }
  }

  for (const s of c.state.skills ?? []) {
    for (const [i, verdict] of s.answers.entries()) {
      await recordAnswer(db, { learnerId, topicId: topic.id, skillId: s.skill, itemKey: `tutor-eval-${s.skill}-${i}`, itemId: `tutor-eval-${s.skill}`, input: verdict, verdict, source: "quick_try" });
    }
    for (const m of s.methodsUsed ?? []) await noteMethodUsed(db, learnerId, topic.id, s.skill, m);
    notes.push(`On the Skill ${s.skill}, the Learner's earlier answers were ${s.answers.join(", ")}; methods already used on it: ${(s.methodsUsed ?? []).join(", ") || "none"}.`);
  }
  if (c.answer) {
    await recordAnswer(db, { learnerId, topicId: topic.id, skillId: c.answer.skill, itemKey: `tutor-eval-${c.answer.skill}-answer`, itemId: `tutor-eval-${c.answer.skill}`, input: c.message, verdict: c.answer.verdict, source: "quick_try" });
    notes.push(`The Learner's message answers a Quick try on ${c.answer.skill}, marked ${c.answer.verdict} by code.`);
  }
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
    exampleCurrency: c.state.exampleCurrency ?? ((topic as { currency?: unknown }).currency as string | undefined) ?? "INR",
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
 * The reply of one finished turn as the Learner sees it: the text, the Widgets it opened, showed or drew, the
 * rule a tool saved to the Topic Note during the turn (a note that is not a saved reply or Widget), and any park
 * offer item code stored.
 */
export async function seenReply(db: Db, args: { learnerId: number; topic: Topic; sessionId: number; turnSeq: number; text: string; notesAfter: number }): Promise<SeenReply> {
  const items = (await loadSessionItems(db, args.sessionId, args.learnerId)).filter((i) => i.afterSeq >= args.turnSeq);
  const written = writtenAheadWidgets(args.topic);
  const widgets: SeenWidget[] = items.flatMap((i): SeenWidget[] => {
    if (i.kind === WIDGET_SHOWN) {
      const d = i.data as ShownWidget;
      return [{ kind: "recipe", id: d.recipe || DRAWN, params: d.params, labels: [d.title, ...stringsIn(d.code ?? "")] }];
    }
    if (i.kind === WIDGET_OPENED) {
      const id = String(i.data.id);
      return [{ kind: "written", id, labels: [String(i.data.title ?? ""), ...stringsIn(written.find((w) => w.id === id)?.code ?? "")] }];
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
  return seen({ text: args.text, widgets, savedRule: rule, parkOffer });
}
