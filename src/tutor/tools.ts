import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { loadCaseData } from "@/case-data/case-data";
import type { CourseMap } from "@/course/map";
import { navigate, TEACHING_STEPS, type Place } from "@/course/navigator";
import { toolCalls, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveFinishedStep, saveMisconception } from "@/learner/memory";
import { stepContext } from "./context";
import type { ToolDefinition } from "./instructions";

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

/** What the Learner sees when a progress write failed. */
export const SAVE_FAILED_MESSAGE = "Your progress could not be saved just now. The Tutor has been told nothing was recorded.";

/** The Course Navigator's context for a place, with the Case Data the as-of rule allows right now. */
export async function navigatorContext(db: Db, map: CourseMap, place: Place | null): Promise<string> {
  return stepContext(place, await caseDataFor(db, map, place));
}

export async function caseDataFor(db: Db, map: CourseMap, place: Place | null) {
  if (!place) return [];
  const progress = await loadProgress(db);
  const all = await Promise.all(place.topic.cases.map((c) => loadCaseData(db, map, progress, c.id)));
  return all.filter((d) => d !== undefined);
}

/**
 * The code behind each tool, by name. Every tool writes, so each runs through `once`:
 * the effect and the saved result share one transaction keyed by the tool call ID, so a
 * repeated call, or a call re-run after a cut-off, returns the saved result and has no
 * second effect. If the write fails, the transaction rolls back (the Course Navigator
 * does not advance) and the Tutor is told nothing was recorded.
 */
export function toolCode(db: Db, map: CourseMap, now: () => Date, model: string, effects: ToolEffects, turnId: number): Record<string, ToolCode> {
  const finishInput = z.object({ step: z.enum(TEACHING_STEPS) });
  const verdictInput = z.object({ check_id: z.string(), verdict: z.enum(["pass", "not_yet"]), reasons: z.string().min(1) });
  const misconceptionInput = z.object({ description: z.string().min(1), topic_id: z.string().optional() });

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

  return {
    record_misconception: {
      parse: (input) => misconceptionInput.parse(input),
      run: ({ description, topic_id }, context) =>
        once(context?.toolUse.id, "record_misconception", async (tx) => {
          const place = navigate(map, await loadProgress(tx));
          // A topic_id that isn't on the Course Map is kept under the current Topic rather than lost.
          const known = topic_id && map.topic(topic_id) ? topic_id : undefined;
          const topicId = known ?? place?.topic.id;
          if (!topicId) return { ok: false, text: "No current Topic; give the topic_id of a Topic on the Course Map." };
          const checkId = place && topicId === place.topic.id ? (place.check?.id ?? null) : null;
          const saved = await saveMisconception(tx, map, { topicId, checkId, description, model, toolCallId: context!.toolUse.id }, now());
          if (!saved.ok) return { ok: false, text: saved.reason };
          const note = topic_id && !known ? ` "${topic_id}" is not a Topic ID on the Course Map, so it was recorded under the current Topic.` : "";
          return { ok: true, text: `Recorded by code: misconception noted for Topic ${topicId}.${note}` };
        }),
    },
    record_check_verdict: {
      parse: (input) => verdictInput.parse(input),
      run: ({ check_id, verdict, reasons }, context) =>
        once(context?.toolUse.id, "record_check_verdict", async (tx) => {
          const passed = verdict === "pass";
          const saved = await saveCheckResult(tx, map, { checkId: check_id, passed, evidence: reasons, model, toolCallId: context!.toolUse.id }, now());
          if (!saved.ok) return { ok: false, text: saved.reason };
          const place = await ensureTopicStarted(tx, map, now());
          const recorded = passed
            ? `Recorded by code: pass for Check ${check_id}.`
            : `Recorded by code: not yet for Check ${check_id}. The Learner stays at this Check and can try again.`;
          return { ok: true, began: passed, text: `${recorded}\n\n${await navigatorContext(tx, map, place)}` };
        }),
    },
    finish_teaching_step: {
      parse: (input) => finishInput.parse(input),
      run: ({ step }, context) =>
        once(context?.toolUse.id, "finish_teaching_step", async (tx) => {
          // Pacing rule: a step that began in this turn has not yet been taught in a reply the Learner answered.
          const [began] = await tx.select().from(toolCalls).where(and(eq(toolCalls.turnId, turnId), eq(toolCalls.beganStep, true)));
          const [thisTurn] = await tx.select().from(turns).where(eq(turns.id, turnId));
          if (began || thisTurn?.startedTopic) return { ok: false, text: PACING_REJECTION };
          const move = await saveFinishedStep(tx, map, step, now());
          if (!move.ok) return { ok: false, text: move.reason };
          return { ok: true, began: true, text: await navigatorContext(tx, map, await ensureTopicStarted(tx, map, now())) };
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
    const impl = code[d.name];
    if (!impl) throw new Error(`No implementation for saved tool ${d.name}`);
    return { ...d, ...impl } as unknown as BetaRunnableTool;
  });
}

type ToolUse = { type: "tool_use"; id: string; name: string; input: unknown };

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
      results.push({ type: "tool_result" as const, tool_use_id: use.id, content: content as string });
    } catch (e) {
      results.push({ type: "tool_result" as const, tool_use_id: use.id, content: `Error: ${(e as Error).message}`, is_error: true });
    }
  }
  return results;
}
