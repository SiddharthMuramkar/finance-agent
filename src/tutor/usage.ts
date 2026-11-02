import { asc, eq } from "drizzle-orm";
import { usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { costUsd } from "./pricing";

/** The token counts the API reports on a finished message; every field may be missing. */
export type ApiUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number | null } | null;
};

export type StepUsage = {
  step: number;
  tools: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Null when the API did not report reasoning tokens. */
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
};

/** Turns one finished message's usage report into a step record. */
export function stepUsage(model: string, step: number, api: ApiUsage | undefined, tools: string[], durationMs: number, stopReason: string | null): StepUsage {
  const t = {
    inputTokens: api?.input_tokens ?? 0,
    outputTokens: api?.output_tokens ?? 0,
    cacheReadTokens: api?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: api?.cache_creation_input_tokens ?? 0,
  };
  return {
    step,
    tools,
    ...t,
    thinkingTokens: api?.output_tokens_details?.thinking_tokens ?? null,
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

/** Saves a finished turn: one row per step, then one for the turn. */
export async function saveTurnUsage(db: Db, sessionId: number, turnSeq: number, usage: TurnUsage, now: Date) {
  const base = { sessionId, turnSeq, model: usage.model, createdAt: now };
  await db.insert(usageRows).values([
    ...usage.steps.map(({ step, ...s }) => ({ ...base, kind: "step" as const, step, ...s })),
    {
      ...base,
      kind: "turn" as const,
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
    },
  ]);
}

/** Every turn's usage in a Session, keyed by the seq of the Learner message that began the turn. */
export async function loadTurnUsages(db: Db, sessionId: number): Promise<Map<number, TurnUsage>> {
  const rows = await db
    .select()
    .from(usageRows)
    .where(eq(usageRows.sessionId, sessionId))
    .orderBy(asc(usageRows.turnSeq), asc(usageRows.step));
  const out = new Map<number, TurnUsage>();
  for (const r of rows.filter((r) => r.kind === "turn")) {
    const steps: StepUsage[] = rows
      .filter((s) => s.kind === "step" && s.turnSeq === r.turnSeq)
      .map((s) => ({
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
      }));
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
    });
  }
  return out;
}

