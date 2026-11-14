import { and, asc, eq } from "drizzle-orm";
import { usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { costUsd } from "./pricing";
import { replyCheckSummaries, type ReplyCheckSummary } from "./reply-records";

/**
 * The token counts OpenAI reports on a finished response; every field may be missing. Unlike the stored columns,
 * `input_tokens` includes the cached and cache-written tokens, and `output_tokens` includes the reasoning tokens.
 */
export type ApiUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  input_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null;
  output_tokens_details?: { reasoning_tokens?: number | null } | null;
};

export type StepUsage = {
  step: number;
  tools: string[];
  /** Input tokens neither read from nor written to the prompt cache. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Reasoning tokens (part of the output); null when the API did not report them. */
  thinkingTokens: number | null;
  durationMs: number;
  costUsd: number | null;
  stopReason: string | null;
};

/** One Tutor turn's usage: totals plus each loop step. This is what the "under the hood" panel shows. */
export type TurnUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingTokens: number | null;
  durationMs: number;
  costUsd: number | null;
  tools: string[];
  steps: StepUsage[];
  /** What code's reply checks found (reply_checks): the words shown, the checks the reply failed, the retry and the fallback. */
  replyCheck?: ReplyCheckSummary;
  /** A suggest_choice label code dropped this turn (over six words, an emoji, a sum or a copy of a set label; D3a). */
  droppedChoice?: string;
};

/**
 * Turns one finished response's usage report into a step record. The stored input count leaves out the cached and
 * cache-written tokens, which have their own columns (and prices), so the three add up to what OpenAI counted as input.
 */
export function stepUsage(model: string, step: number, reported: ApiUsage | undefined, tools: string[], durationMs: number, stopReason: string | null): StepUsage {
  const cached = reported?.input_tokens_details?.cached_tokens ?? 0;
  const written = reported?.input_tokens_details?.cache_write_tokens ?? 0;
  const t = {
    inputTokens: Math.max(0, (reported?.input_tokens ?? 0) - cached - written),
    outputTokens: reported?.output_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: written,
  };
  return {
    step,
    tools,
    ...t,
    thinkingTokens: reported?.output_tokens_details?.reasoning_tokens ?? null,
    durationMs,
    costUsd: costUsd(model, t),
    stopReason,
  };
}

/** Adds the steps up into the turn's totals. Cost is null if any step could not be priced. */
export function sumSteps(model: string, steps: StepUsage[], durationMs: number): TurnUsage {
  const sum = (f: (s: StepUsage) => number) => steps.reduce((n, s) => n + f(s), 0);
  const reported = steps.filter((s) => s.thinkingTokens !== null);
  return {
    model,
    inputTokens: sum((s) => s.inputTokens),
    outputTokens: sum((s) => s.outputTokens),
    cacheReadTokens: sum((s) => s.cacheReadTokens),
    cacheWriteTokens: sum((s) => s.cacheWriteTokens),
    thinkingTokens: reported.length ? reported.reduce((n, s) => n + s.thinkingTokens!, 0) : null,
    durationMs,
    costUsd: steps.some((s) => s.costUsd === null) ? null : sum((s) => s.costUsd!),
    tools: steps.flatMap((s) => s.tools),
    steps,
  };
}

/** Saves one loop step as soon as it finishes, so a turn cut off later keeps what it has spent. */
export async function saveStepUsage(db: Db, sessionId: number, turnSeq: number, model: string, step: StepUsage, now: Date) {
  const { step: n, ...s } = step;
  await db.insert(usageRows).values({ sessionId, turnSeq, model, createdAt: now, kind: "step", step: n, ...s });
}

/** The steps already saved for a turn (a resumed turn continues their numbering). */
export async function loadStepUsages(db: Db, sessionId: number, turnSeq: number): Promise<StepUsage[]> {
  const rows = await db
    .select()
    .from(usageRows)
    .where(and(eq(usageRows.sessionId, sessionId), eq(usageRows.turnSeq, turnSeq), eq(usageRows.kind, "step")))
    .orderBy(asc(usageRows.step));
  return rows.map(toStep);
}

/** The number of the last step saved for a turn (0 when none): a resumed turn numbers its next step after it, never from a row count that a gap would make collide. */
export async function lastStepNumber(db: Db, sessionId: number, turnSeq: number): Promise<number> {
  const saved = await loadStepUsages(db, sessionId, turnSeq);
  return saved.reduce((most, s) => Math.max(most, s.step), 0);
}

/** Saves the turn's total from its saved steps, once the turn has finished. */
export async function saveTurnTotal(db: Db, sessionId: number, turnSeq: number, model: string, durationMs: number, now: Date, replyCheck?: ReplyCheckSummary): Promise<TurnUsage> {
  const usage: TurnUsage = { ...sumSteps(model, await loadStepUsages(db, sessionId, turnSeq), durationMs), ...(replyCheck && { replyCheck }) };
  await db.insert(usageRows).values({
    sessionId,
    turnSeq,
    model,
    createdAt: now,
    kind: "turn",
    step: null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    thinkingTokens: usage.thinkingTokens,
    tools: usage.tools,
    stopReason: null,
    durationMs: usage.durationMs,
    costUsd: usage.costUsd,
  });
  return usage;
}

function toStep(s: typeof usageRows.$inferSelect): StepUsage {
  return {
    step: s.step!,
    tools: s.tools,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheReadTokens: s.cacheReadTokens,
    cacheWriteTokens: s.cacheWriteTokens,
    thinkingTokens: s.thinkingTokens,
    durationMs: s.durationMs,
    costUsd: s.costUsd,
    stopReason: s.stopReason,
  };
}

/** Every turn's usage in a Session, keyed by the seq of the Learner message that began the turn. */
export async function loadTurnUsages(db: Db, sessionId: number): Promise<Map<number, TurnUsage>> {
  const rows = await db
    .select()
    .from(usageRows)
    .where(eq(usageRows.sessionId, sessionId))
    .orderBy(asc(usageRows.turnSeq), asc(usageRows.step));
  const out = new Map<number, TurnUsage>();
  const checks = await replyCheckSummaries(db, sessionId);
  for (const r of rows.filter((r) => r.kind === "turn")) {
    const replyCheck = checks.get(r.turnSeq);
    const steps: StepUsage[] = rows.filter((s) => s.kind === "step" && s.turnSeq === r.turnSeq).map(toStep);
    out.set(r.turnSeq, {
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheReadTokens: r.cacheReadTokens,
      cacheWriteTokens: r.cacheWriteTokens,
      thinkingTokens: r.thinkingTokens,
      durationMs: r.durationMs,
      costUsd: r.costUsd,
      tools: r.tools,
      steps,
      ...(replyCheck && { replyCheck }),
    });
  }
  return out;
}

