// Database helpers for scripts/simulated-learner.mjs, kept here so they are tested. No imports, so Node
// can load this file straight from the script.

/** A raw SQL query that returns rows (the Neon driver's `sql.query`, or PGlite's in tests). */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** What withIdleHours needs from `process`: to listen for Ctrl-C or a kill, and to exit. */
type Signals = {
  once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  exit(code: number): unknown;
};

const IDLE_KEY = "session_idle_hours";

/**
 * Runs `run` with the session_idle_hours setting changed to `value`, then puts the saved value back:
 * after the run finishes or throws, and also when the script is stopped by Ctrl-C (SIGINT) or a kill
 * (SIGTERM), which would otherwise end Node without running a `finally` and leave the live setting changed.
 */
export async function withIdleHours<T>(query: Query, value: string, run: () => Promise<T>, proc: Signals = process): Promise<T> {
  const [row] = await query("select value from settings where key = $1", [IDLE_KEY]);
  const previous = row?.value as string | undefined;
  const restore = async () => {
    if (previous !== undefined) await query("update settings set value = $1 where key = $2", [previous, IDLE_KEY]);
  };
  const stop = (code: number) => () => {
    void restore().finally(() => proc.exit(code));
  };
  const onInt = stop(130);
  const onTerm = stop(143);
  proc.once("SIGINT", onInt);
  proc.once("SIGTERM", onTerm);
  try {
    await query("update settings set value = $1 where key = $2", [value, IDLE_KEY]);
    return await run();
  } finally {
    proc.off("SIGINT", onInt);
    proc.off("SIGTERM", onTerm);
    await restore();
  }
}

/**
 * Archives a Topic's saved progress by renaming its rows under `tag`, so a fresh run starts at the story.
 * Deletes nothing. The Learner's current Topic is cleared only when it is this Topic.
 */
export async function archiveTopic(query: Query, topicId: string, checkIds: string[], tag: string) {
  const archived = `${tag}:${topicId}`;
  const results = await query("update check_results set topic_id = $2 where topic_id = $1 returning id", [topicId, archived]);
  const attempts = await query("update quiz_attempts set check_id = $1 || check_id where check_id = any($2) returning id", [`${tag}:`, checkIds]);
  const notes = await query("update misconceptions set topic_id = $2 where topic_id = $1 returning id", [topicId, archived]);
  // The Topic's own row is renamed too, so the app starts the Topic afresh (and the first step cannot be skipped).
  await query("update topic_progress set topic_id = $2 where topic_id = $1", [topicId, archived]);
  await query("update learner_state set current_topic_id = null, updated_at = now() where id = 1 and current_topic_id = $1", [topicId]);
  return { results: results.length, attempts: attempts.length, notes: notes.length };
}
