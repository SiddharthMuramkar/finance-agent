import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { loadCaseData } from "@/case-data/case-data";
import { calculate } from "@/finance/calculators";
import type { CourseMap } from "@/course/map";
import { navigate, TEACHING_STEPS, type Place, type Progress } from "@/course/navigator";
import { exploreHeldBack } from "@/course/explore-widget";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { OWNER_LEARNER_ID, sessions, toolCalls, turns } from "@/db/schema";
import { widgetControls } from "@/widgets/check";
import { loadWrittenAhead } from "./written-ahead";
import type { Db } from "@/db/types";
import { loadProgress, saveCheckResult, saveFinishedStep, saveMisconception } from "@/learner/memory";
import { loadExploreInfo, saveInsightAttempt } from "@/learner/insight";
import { quizUnavailable } from "@/learner/quiz";
import { searchLibrary, searchResultBlocks, type QueryEmbedder } from "@/library/library";
import { stepContext, topicCompleteContext } from "./context";
import { verdictCard } from "./check-results";
import { pasteSummary } from "./pasted";
import { saveItemAfterLatest, stepDivider, type SessionItem } from "./session-items";
import type { ToolDefinition } from "./instructions";
import { JUST_TELL_ME } from "./chips";
import { isCodeWritten, OLD_CONTINUE_TEXT, turnKind } from "./turn-status";

export type ToolCode = Pick<BetaRunnableTool, "run" | "parse">;

/** What a tool told the Tutor, and whether it was a rejection (sent back as a tool error). */
type Outcome = {
  ok: boolean;
  text: string;
  /** The call moved the Learner onto a new Teaching Step. */
  began?: boolean;
  /** A Session item the call stored (a step divider), for the Learner to see at once. */
  item?: SessionItem;
};

/**
 * Shared with the Tutor Turn: whether a progress write failed, so it can tell the Learner, and the
 * Session items tool calls stored, which it streams to the browser as they are stored.
 */
export type ToolEffects = { saveFailed: boolean; items?: SessionItem[] };

/** The tool result when a write failed: the Tutor is told plainly that nothing was saved. */
export const NOTHING_RECORDED =
  "Nothing was recorded: the Learner's progress could not be saved because of a database error. Tell the Learner plainly that this was not saved, do not say it was, and do not move on as if it had been.";

/** Sent back when the Tutor tries to finish a step it only just reached in the same turn. */
export const PACING_REJECTION =
  "Cannot finish this step: it began during this turn. Teach it in your reply now, then stop and wait for the Learner to answer; you can finish it in your next turn.";

/** Sent back when the Tutor records a verdict at a Check step it only just reached, before the Learner could answer the prompt. */
export const VERDICT_PACING_REJECTION =
  "Cannot record a verdict: this Check step began during this turn, so the Learner has not answered the Check prompt yet. Put the prompt in your reply now, then stop and wait for the Learner's answer; record the verdict in a later turn.";

/** Sent back when the Tutor records an Insight attempt at an explore step it only just reached, before the Learner could try. */
export const INSIGHT_PACING_REJECTION =
  "Cannot record an attempt: the explore step began during this turn, so the Learner has not seen the Insight question yet. Put the question in your reply now, then stop and wait for the Learner's own words; record their attempt in a later turn.";

/** Sent back when the message is a help chip's words or a note code wrote: neither is ever an attempt. */
export const NOT_THE_LEARNERS_ATTEMPT =
  "Not recorded: this message is a chip the Learner pressed or a note code wrote, which is never an attempt at the Insight. Answer what it asks, invite the Learner to say what they notice in their own words, then wait.";

/** The closing instruction of every Insight result: the reply's last words come after the tool result. */
const WRITE_AFTER = "Write your reply to the Learner now, after this result, and make it the final text of your reply.";

/** What the Learner sees when a progress write failed. */
export const SAVE_FAILED_MESSAGE = "Your progress could not be saved just now. The Tutor has been told nothing was recorded.";

/** The Course Navigator's context for the Learner's place, with the Case Data the as-of rule allows them right now. */
export async function navigatorContext(db: Db, map: CourseMap, place: Place | null, turnId?: number, learnerId = OWNER_LEARNER_ID): Promise<string> {
  const sessionId = turnId === undefined ? null : (await db.select({ s: turns.sessionId }).from(turns).where(eq(turns.id, turnId)))[0]?.s;
  return stepContext(
    place,
    await caseDataFor(db, map, place, learnerId),
    await pasteSummary(db, sessionId, learnerId),
    false,
    await loadExploreInfo(db, place, turnId, learnerId),
  );
}

/** The Case Data of the place's Cases, under the as-of rule for this Learner's progress. */
export async function caseDataFor(db: Db, map: CourseMap, place: Place | null, learnerId = OWNER_LEARNER_ID) {
  if (!place) return [];
  const progress = await loadProgress(db, learnerId);
  const all = await Promise.all(place.topic.cases.map((c) => loadCaseData(db, map, progress, c.id)));
  return all.filter((d) => d !== undefined);
}

/**
 * The code behind each tool, by name. Every tool that writes runs through `once`; the read-only
 * `search_library` and the pure `calculate` write nothing, so they don't:
 * the effect and the saved result share one transaction keyed by the tool call ID, so a
 * repeated call, or a call re-run after a cut-off, returns the saved result and has no
 * second effect. If the write fails, the transaction rolls back (the Course Navigator
 * does not advance) and the Tutor is told nothing was recorded. search_library only reads, so
 * it simply runs again if repeated.
 */
/** The turn the tools run in, and the Learner whose memory they read and write. */
export type ToolTurn = { id: number; learnerId: number };

export function toolCode(
  db: Db,
  map: CourseMap,
  now: () => Date,
  model: string,
  effects: ToolEffects,
  turn: ToolTurn,
  embedQuery?: QueryEmbedder,
): Record<string, ToolCode> {
  const { id: turnId, learnerId } = turn;
  const finishInput = z.object({ step: z.enum(TEACHING_STEPS) });
  const verdictInput = z.object({ check_id: z.string(), verdict: z.enum(["pass", "not_yet"]), reasons: z.string().min(1) });
  const misconceptionInput = z.object({ description: z.string().min(1), topic_id: z.string().optional() });
  const searchInput = z.object({ query: z.string().min(1), source: z.string().optional() });
  const insightInput = z.object({ outcome: z.enum(["found", "not_yet", "asked_to_be_told"]), learner_words: z.string().min(1) });

  /**
   * Pacing rule: whether the Learner's current step began during this turn, so it has not yet been
   * taught in a reply the Learner answered. A step begins in a turn when a tool call in it moved the
   * Learner on, or when it began before the turn without being taught (the turn started the Topic,
   * or a quiz pass marked by code moved the Learner on).
   */
  async function stepBeganThisTurn(tx: Db): Promise<boolean> {
    const [began] = await tx.select().from(toolCalls).where(and(eq(toolCalls.turnId, turnId), eq(toolCalls.beganStep, true)));
    const [thisTurn] = await tx.select().from(turns).where(eq(turns.id, turnId));
    return Boolean(began || thisTurn?.freshStep);
  }

  /**
   * The context after a step finished or a Check was recorded. When the move passed the Topic the Learner
   * was in (its Principle, or its last Due Check), the Tutor is told to stop there, with no context for
   * another Topic, and nothing more is started: the Learner chooses where to go. Otherwise, the new place's.
   */
  async function contextAfterMove(tx: Db, before: Place | null): Promise<string> {
    const progress = await loadProgress(tx, learnerId);
    const after = navigate(map, progress);
    if (before && progress.topics[before.topic.id]?.status === "passed" && after?.topic.id !== before.topic.id) return topicCompleteContext(before.topic.title);
    return navigatorContext(tx, map, after, turnId, learnerId);
  }

  /** Stores the divider for the Learner's new step in the turn's Session, when they are still in the Topic they were in. */
  async function storeStepDivider(tx: Db, before: Place | null, progress: Progress): Promise<SessionItem | null> {
    const after = navigate(map, progress);
    if (!before || after?.topic.id !== before.topic.id) return null;
    return storeAfterLatest(tx, stepDivider(map, progress, after.topic.id));
  }

  /** Stores a Session item after the latest message of the turn's Session; null when there is no item or no Session yet. */
  async function storeAfterLatest(tx: Db, item: SessionItem | null): Promise<SessionItem | null> {
    const [turn] = await tx.select({ sessionId: turns.sessionId }).from(turns).where(eq(turns.id, turnId));
    if (!item || turn?.sessionId == null) return null;
    await saveItemAfterLatest(tx, learnerId, turn.sessionId, item, now());
    return item;
  }

  async function once(toolCallId: string | undefined, name: string, effect: (tx: Db) => Promise<Outcome>): Promise<string> {
    if (!toolCallId) throw new Error("Missing tool call ID.");
    let outcome: Outcome;
    try {
      outcome = await db.transaction(async (transaction) => {
        const tx = transaction as unknown as Db;
        const [done] = await tx.select().from(toolCalls).where(eq(toolCalls.toolCallId, toolCallId));
        // A repeat has no second effect, so it stores no second item either.
        if (done) return { ok: !done.isError, text: done.result };
        const result = await effect(tx);
        await tx.insert(toolCalls).values({ toolCallId, name, result: result.text, isError: !result.ok, turnId, beganStep: result.began ?? false, createdAt: now() });
        return result;
      });
    } catch (error) {
      console.error(`Tool ${name} could not save`, error);
      effects.saveFailed = true;
      throw new Error(NOTHING_RECORDED);
    }
    if (outcome.item) (effects.items ??= []).push(outcome.item);
    if (!outcome.ok) throw new Error(outcome.text);
    return outcome.text;
  }

  const openInput = z.object({ id: z.string().min(1) });
  const calculateInput = z.object({ calculator: z.string(), inputs: z.unknown(), currency: z.enum(["usd", "inr"]).optional() });

  return {
    search_library: {
      parse: (input) => searchInput.parse(input),
      run: async ({ query, source }) => searchResultBlocks(await searchLibrary({ db, map, embedQuery, learnerId }, query, { source })),
    },
    // Pure: it writes nothing, so it does not go through `once`; the same inputs always give the same answer.
    calculate: {
      parse: (input) => calculateInput.parse(input),
      run: async ({ calculator, inputs, currency }) => {
        const result = calculate(calculator, inputs, currency);
        if (!result.ok) throw new Error(result.error);
        return `${result.title}\n${result.results.map((r) => `${r.label}: ${r.text}`).join("\n")}\n(Computed by code from the tested formula "${result.id}".)`;
      },
    },
    record_misconception: {
      parse: (input) => misconceptionInput.parse(input),
      run: ({ description, topic_id }, context) =>
        once(context?.toolUse.id, "record_misconception", async (tx) => {
          const place = navigate(map, await loadProgress(tx, learnerId));
          // A topic_id that isn't on the Course Map is kept under the current Topic rather than lost.
          const known = topic_id && map.topic(topic_id) ? topic_id : undefined;
          const topicId = known ?? place?.topic.id;
          if (!topicId) return { ok: false, text: "No current Topic; give the topic_id of a Topic on the Course Map." };
          const checkId = place && topicId === place.topic.id ? (place.check?.id ?? null) : null;
          const saved = await saveMisconception(tx, map, { topicId, checkId, description, model, toolCallId: context!.toolUse.id }, now(), learnerId);
          if (!saved.ok) return { ok: false, text: saved.reason };
          const note = topic_id && !known ? ` "${topic_id}" is not a Topic ID on the Course Map, so it was recorded under the current Topic.` : "";
          return { ok: true, text: `Recorded by code: misconception noted for Topic ${topicId}.${note}` };
        }),
    },
    record_check_verdict: {
      parse: (input) => verdictInput.parse(input),
      run: ({ check_id, verdict, reasons }, context) =>
        once(context?.toolUse.id, "record_check_verdict", async (tx) => {
          // A quiz Check is marked only by code, from the Learner's submitted answers; never by a Tutor verdict.
          // The one exception: a quiz that cannot be shown, which the Tutor checks in conversation instead.
          const quiz = map.check(check_id);
          if (quiz?.kind === "quiz" && !(await quizUnavailable(tx, map, quiz)))
            return { ok: false, text: `Check ${check_id} is a quiz, so it is marked by code from the Learner's answers. Nothing was recorded; ask the Learner to submit the quiz.` };
          // Pacing rule, for the Check that is being taken; any other verdict gets the Course Navigator's own reason below.
          const at = navigate(map, await loadProgress(tx, learnerId));
          if (at?.step === "check" && at.check?.id === check_id && (await stepBeganThisTurn(tx))) return { ok: false, text: VERDICT_PACING_REJECTION };
          const passed = verdict === "pass";
          const before = navigate(map, await loadProgress(tx, learnerId));
          const saved = await saveCheckResult(tx, map, { checkId: check_id, passed, evidence: reasons, model, toolCallId: context!.toolUse.id }, now(), learnerId);
          if (!saved.ok) return { ok: false, text: saved.reason };
          const recorded = passed
            ? `Recorded by code: pass for Check ${check_id}.`
            : `Recorded by code: not yet for Check ${check_id}. The Learner stays at this Check and can try again.`;
          // The Learner sees the result in the conversation: a card after the reply that recorded it, never sent to the model.
          const card = await storeAfterLatest(tx, verdictCard(map, check_id, passed));
          return { ok: true, began: passed, text: `${recorded}\n\n${await contextAfterMove(tx, before)}`, ...(card && { item: card }) };
        }),
    },
    record_insight_attempt: {
      parse: (input) => insightInput.parse(input),
      run: ({ outcome, learner_words }, context) =>
        once(context?.toolUse.id, "record_insight_attempt", async (tx) => {
          const [turn] = await tx.select().from(turns).where(eq(turns.id, turnId));
          const message = turn?.input ?? "";
          // An old "Continue.", a note code wrote (Finish this reply's among them) or a help chip is never an attempt,
          // whatever words the Tutor offers; the Just tell me chip only ever asks to be told (ADR 0001).
          const justTellMe = message.trim() === JUST_TELL_ME;
          if (message.trim() === OLD_CONTINUE_TEXT || isCodeWritten(message) || (turn && turnKind(turn) === "chip" && !justTellMe)) {
            return { ok: false, text: NOT_THE_LEARNERS_ATTEMPT };
          }
          // Pacing rule: the Learner must have seen the question before an attempt can count.
          if (navigate(map, await loadProgress(tx, learnerId))?.step === "explore" && (await stepBeganThisTurn(tx))) return { ok: false, text: INSIGHT_PACING_REJECTION };
          const saved = await saveInsightAttempt(
            tx,
            map,
            { reported: justTellMe ? "asked_to_be_told" : outcome, words: learner_words, learnerMessage: message, toolCallId: context!.toolUse.id, model, turnId },
            now(),
            learnerId,
          );
          if (!saved.ok) return { ok: false, text: saved.reason };
          const written = `Written Insight: ${saved.insight.written.trim()}`;
          const quoted = `The Learner's words, saved: "${saved.words}".`;
          if (saved.released === "found") {
            return {
              ok: true,
              text: `Recorded by code: the Learner found the Insight. ${quoted}\n${written}\nConfirm it against the Learner's own words: quote what they said, and say plainly what makes it right. You can finish the explore step with finish_teaching_step once you have confirmed. ${WRITE_AFTER}`,
            };
          }
          if (saved.released === "told") {
            return {
              ok: true,
              // Telling the Insight begins a new moment for the Learner, so the pacing rule keeps explore open for the rest of this turn.
              began: true,
              text: `Recorded by code: the Insight is told. ${quoted}\n${written}\nTell the Learner the Insight in your own words, kindly and without any sense of failure, and link it to what they tried. You cannot finish the explore step in this turn: wait for the Learner to answer, then finish it. ${WRITE_AFTER}`,
            };
          }
          const n = saved.released === "hint_1" ? 1 : 2;
          return {
            ok: true,
            text: `Recorded by code: not yet (hint ${n}). ${quoted}\nHint ${n} for the Learner: ${saved.hint!.trim()}\nGive this hint in your own words, point to what to try in the Widget, and do not state the Insight. ${WRITE_AFTER}`,
          };
        }),
    },
    open_widget: {
      parse: (input) => openInput.parse(input),
      run: ({ id }, context) =>
        once(context?.toolUse.id, "open_widget", async (tx) => {
          // The Topic of the Session this turn runs in: its written-ahead Widgets are the ones that can be opened.
          const [row] = await tx.select({ sessionId: turns.sessionId, topicId: sessions.topicId }).from(turns).leftJoin(sessions, eq(sessions.id, turns.sessionId)).where(eq(turns.id, turnId));
          const topicId = row?.topicId ?? navigate(map, await loadProgress(tx, learnerId))?.topic.id;
          const progress = await loadProgress(tx, learnerId);
          const widgets = await loadWrittenAhead(tx, map, progress, topicId);
          const widget = widgets.find((w) => w.id === id);
          if (!widget || row?.sessionId == null) {
            return { ok: false, text: `Not opened: this Topic has no written-ahead Widget "${id}". Its written-ahead Widgets: ${widgets.map((w) => w.id).join(", ") || "none"}.` };
          }
          // Code holds the sequence (ADR 0001): the explore Widget reaches the Learner only once the explore step begins.
          const topic = topicId ? map.topic(topicId) : undefined;
          if (topic && exploreHeldBack(topic, progress.topics[topic.id]) === widget.id) {
            return { ok: false, text: `Not opened: "${widget.title}" is this Topic's explore Widget, which code shows when the explore step begins. Do not open it or draw your own version before then; teach this in words.` };
          }
          const item = { kind: WIDGET_OPENED, data: { id: widget.id, title: widget.title } };
          await saveItemAfterLatest(tx, learnerId, row.sessionId, item, now());
          const { sliders, tasks } = widgetControls(widget.code);
          const lines = [
            `Opened by code: "${widget.title}" is in the Widget panel, with a chip where you opened it. Point the Learner to it; do not draw a Widget of your own for the same idea. Ask only for numbers its sliders can show.`,
            ...(sliders.length ? ["Its sliders:", ...sliders.map((s) => `- ${s}`)] : []),
            ...(tasks.length ? ["Its Guided Tasks (they tick themselves):", ...tasks.map((t) => `- ${t}`)] : []),
          ];
          return { ok: true, text: lines.join("\n"), item };
        }),
    },
    finish_teaching_step: {
      parse: (input) => finishInput.parse(input),
      run: ({ step }, context) =>
        once(context?.toolUse.id, "finish_teaching_step", async (tx) => {
          if (await stepBeganThisTurn(tx)) return { ok: false, text: PACING_REJECTION };
          const before = navigate(map, await loadProgress(tx, learnerId));
          const move = await saveFinishedStep(tx, map, step, now(), learnerId);
          if (!move.ok) return { ok: false, text: move.reason };
          // The Learner sees where the next step begins: a divider after the reply that finished this one.
          // None once the Topic is passed; its Topic complete card marks that.
          const item = await storeStepDivider(tx, before, move.progress);
          return { ok: true, began: true, text: await contextAfterMove(tx, before), ...(item && { item }) };
        }),
    },
  };
}

/**
 * Pairs each saved tool definition with the code that runs it. Definitions are
 * replayed exactly as saved; only the run function comes from the current build.
 */
export function bindTools(definitions: ToolDefinition[], code: Record<string, ToolCode>): BetaRunnableTool[] {
  return definitions.map((d) => {
    // A server tool (hosted code execution) has a `type` and nothing for us to run.
    if ("type" in d) return d as unknown as BetaRunnableTool;
    const impl = code[d.name];
    if (!impl) throw new Error(`No implementation for saved tool ${d.name}`);
    return { ...d, ...impl } as unknown as BetaRunnableTool;
  });
}

export type ToolUse = { type: "tool_use"; id: string; name: string; input: unknown };

/** Tool calls in the last stored reply that have no stored result yet. */
export function unansweredToolCalls(msgs: BetaMessageParam[]): ToolUse[] {
  const last = msgs.at(-1);
  if (last?.role !== "assistant" || !Array.isArray(last.content)) return [];
  return last.content.filter((b): b is ToolUse => b.type === "tool_use");
}

/**
 * Runs saved tool calls that have no saved result (the turn was cut off between running a
 * tool and saving its result), under their own tool call IDs. Written tools return their
 * saved result without a second effect. Returns the tool_result blocks, as Tool Runner makes them.
 */
export async function rerunToolCalls(uses: ToolUse[], code: Record<string, ToolCode>) {
  const results = [];
  for (const use of uses) {
    const impl = code[use.name];
    try {
      if (!impl) throw new Error(`Unknown tool ${use.name}`);
      const content = await impl.run(impl.parse(use.input), { toolUse: use, toolUseBlock: use } as never);
      results.push({ type: "tool_result" as const, tool_use_id: use.id, content });
    } catch (e) {
      results.push({ type: "tool_result" as const, tool_use_id: use.id, content: `Error: ${(e as Error).message}`, is_error: true });
    }
  }
  return results;
}
