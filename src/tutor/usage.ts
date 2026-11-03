import { and, asc, eq } from "drizzle-orm";
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
  /** Per-call usage; a compaction request reports its summary call only here. */
  iterations?: ApiUsage[] | null;
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
export function stepUsage(model: string, step: number, reported: ApiUsage | undefined, tools: string[], durationMs: number, stopReason: string | null): StepUsage {
  const api = summedIterations(reported);
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

/** A compaction request's top-level counts are zero; its real usage is the sum of its iterations. */
function summedIterations(api: ApiUsage | undefined): ApiUsage | undefined {
  if (!api?.iterations?.length || api.input_tokens || api.output_tokens) return api;
  const sum = (f: (u: ApiUsage) => number | null | undefined) => api.iterations!.reduce((n, u) => n + (f(u) ?? 0), 0);
  return {
    input_tokens: sum((u) => u.input_tokens),
    output_tokens: sum((u) => u.output_tokens),
    cache_creation_input_tokens: sum((u) => u.cache_creation_input_tokens),
    cache_read_input_tokens: sum((u) => u.cache_read_input_tokens),
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

/** Saves the turn's total from its saved steps, once the turn has finished. */
export async function saveTurnTotal(db: Db, sessionId: number, turnSeq: number, model: string, durationMs: number, now: Date): Promise<TurnUsage> {
  const usage = sumSteps(model, await loadStepUsages(db, sessionId, turnSeq), durationMs);
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
  for (const r of rows.filter((r) => r.kind === "turn")) {
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
    });
  }
  return out;
}

