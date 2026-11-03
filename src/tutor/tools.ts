import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { loadCaseData } from "@/case-data/case-data";
import { calculate } from "@/finance/calculators";
import type { CourseMap } from "@/course/map";
import { navigate, TEACHING_STEPS, type Place } from "@/course/navigator";
import { OWNER_LEARNER_ID, toolCalls, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveFinishedStep, saveMisconception } from "@/learner/memory";
import { loadExploreInfo, saveInsightAttempt } from "@/learner/insight";
import { quizUnavailable } from "@/learner/quiz";
import { searchLibrary, searchResultBlocks, type QueryEmbedder } from "@/library/library";
import { stepContext } from "./context";
import { pasteSummary } from "./pasted";
import type { ToolDefinition } from "./instructions";
import { CONTINUE_TEXT } from "./turn-status";

export type ToolCode = Pick<BetaRunnableTool, "run" | "parse">;

/** What a tool told the Tutor, and whether it was a rejection (sent back as a tool error). */
type Outcome = { ok: boolean; text: string; /** The call moved the Learner onto a new Teaching Step. */ began?: boolean };

/** Shared with the Tutor Turn so it can tell the Learner when a progress write failed. */
export type ToolEffects = { saveFailed: boolean };

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

/** Sent back when the Learner only pressed Continue: that is never an attempt. */
export const CONTINUE_NOT_AN_ATTEMPT =
  "Not recorded: the Learner only pressed Continue, which is never an attempt at the Insight. Invite them to play with the Widget and say what they notice, in their own words, then wait.";

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
    await pasteSummary(db, sessionId),
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

  async function once(toolCallId: string | undefined, name: string, effect: (tx: Db) => Promise<Outcome>): Promise<string> {
    if (!toolCallId) throw new Error("Missing tool call ID.");
    let outcome: Outcome;
    try {
      outcome = await db.transaction(async (transaction) => {
        const tx = transaction as unknown as Db;
        const [done] = await tx.select().from(toolCalls).where(eq(toolCalls.toolCallId, toolCallId));
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
    if (!outcome.ok) throw new Error(outcome.text);
    return outcome.text;
  }

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
          const saved = await saveCheckResult(tx, map, { checkId: check_id, passed, evidence: reasons, model, toolCallId: context!.toolUse.id }, now(), learnerId);
          if (!saved.ok) return { ok: false, text: saved.reason };
          const place = await ensureTopicStarted(tx, map, now(), learnerId);
          const recorded = passed
            ? `Recorded by code: pass for Check ${check_id}.`
            : `Recorded by code: not yet for Check ${check_id}. The Learner stays at this Check and can try again.`;
          return { ok: true, began: passed, text: `${recorded}\n\n${await navigatorContext(tx, map, place, turnId, learnerId)}` };
        }),
    },
    record_insight_attempt: {
      parse: (input) => insightInput.parse(input),
      run: ({ outcome, learner_words }, context) =>
        once(context?.toolUse.id, "record_insight_attempt", async (tx) => {
          const [turn] = await tx.select().from(turns).where(eq(turns.id, turnId));
          const message = turn?.input ?? "";
          // Pressing Continue is never an attempt, whatever words the Tutor offers.
          if (message.trim() === CONTINUE_TEXT) return { ok: false, text: CONTINUE_NOT_AN_ATTEMPT };
          // Pacing rule: the Learner must have seen the question before an attempt can count.
          if (navigate(map, await loadProgress(tx, learnerId))?.step === "explore" && (await stepBeganThisTurn(tx))) return { ok: false, text: INSIGHT_PACING_REJECTION };
          const saved = await saveInsightAttempt(
            tx,
            map,
            { reported: outcome, words: learner_words, learnerMessage: message, toolCallId: context!.toolUse.id, model, turnId },
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
    finish_teaching_step: {
      parse: (input) => finishInput.parse(input),
      run: ({ step }, context) =>
        once(context?.toolUse.id, "finish_teaching_step", async (tx) => {
          if (await stepBeganThisTurn(tx)) return { ok: false, text: PACING_REJECTION };
          const move = await saveFinishedStep(tx, map, step, now(), learnerId);
          if (!move.ok) return { ok: false, text: move.reason };
          return { ok: true, began: true, text: await navigatorContext(tx, map, await ensureTopicStarted(tx, map, now(), learnerId), turnId, learnerId) };
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
