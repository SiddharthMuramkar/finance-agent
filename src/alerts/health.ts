import { and, count, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { libraryRefreshRuns, turns, tutorIncidents } from "@/db/schema";
import type { Db } from "@/db/types";
import { STALE_AFTER_MS } from "@/library/refresh-run";
import { STALE_RUN_MS } from "@/tutor/turn-status";

/**
 * The 15-minute health check (decision #12): it reads what the app already records about failures and reports to a
 * Better Stack heartbeat. A plain beat when all is well, `<url>/fail` with a short list when something went wrong, and
 * nothing when the database does not answer, so Better Stack alerts on the missed beat (a dead checker looks the same).
 *
 * Each problem counts only in the checks within LOOKBACK_MS of when it happened, so it alerts once (in 2-3 checks) and
 * the heartbeat then goes green again; a problem that held the heartbeat failed would hide every later one.
 */

/**
 * On Hobby, Vercel Schedules start each run up to 15 min late, so two runs can be about 30 min apart, and a turn can
 * fail up to 300 s after it started: 40 min covers the gap.
 */
export const LOOKBACK_MS = 40 * 60_000;
/** The Library cron runs weekly (Monday 21:30 UTC; on Hobby any time in that hour), so no run for 8 days means one was missed. */
export const LIBRARY_MISSED_AFTER_MS = 8 * 24 * 60 * 60_000;
/** How many failure references the report lists; the count covers the rest. */
const REFS_SHOWN = 10;
/** Better Stack gets this long to answer, well inside the route's 30 s. */
const HEARTBEAT_TIMEOUT_MS = 10_000;

export type HealthReport = {
  /** True when the database answered and nothing went wrong. */
  ok: boolean;
  db: "answered" | "failed";
  /** One line per problem: counts, kinds and references only, never Learner text. */
  problems: string[];
  /** "off" when no heartbeat URL is set; "skipped" when the database did not answer; "unreachable" when Better Stack was not. */
  heartbeat: "sent" | "off" | "skipped" | "unreachable";
};

export type HealthDeps = { db: Db; now: Date; heartbeatUrl: string | undefined; fetch: typeof globalThis.fetch };

/** Whether `at` (when something happened or became certain) falls in the lookback before `now`. */
const recent = (at: number, now: Date) => at >= now.getTime() - LOOKBACK_MS && at < now.getTime();

/** What went wrong in the lookback, read from the database; throws when the database does not answer. */
export async function findProblems(db: Db, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const [failed, incidents, [killed], [library]] = await Promise.all([
    // failure_ref, not status: Retry and a Topic change overwrite a failed turn's status, and nothing clears the ref.
    db.select({ ref: turns.failureRef }).from(turns).where(and(isNotNull(turns.failureRef), gte(turns.startedAt, since))).orderBy(turns.id),
    db.select({ kind: tutorIncidents.kind, n: count() }).from(tutorIncidents).where(gte(tutorIncidents.createdAt, since)).groupBy(tutorIncidents.kind).orderBy(tutorIncidents.kind),
    // A run still marked running past STALE_RUN_MS was killed: counted in the lookback after that moment, and only
    // until the same Learner sends again (which marks it cut_off).
    db
      .select({ n: count() })
      .from(turns)
      .where(and(eq(turns.status, "running"), gte(turns.startedAt, new Date(since.getTime() - STALE_RUN_MS)), lt(turns.startedAt, new Date(now.getTime() - STALE_RUN_MS)))),
    db.select().from(libraryRefreshRuns).orderBy(desc(libraryRefreshRuns.id)).limit(1),
  ]);

  const problems: string[] = [];
  if (failed.length > 0) {
    const refs = failed.map((t) => t.ref);
    const more = refs.length > REFS_SHOWN ? `, +${refs.length - REFS_SHOWN} more` : "";
    problems.push(`Failed turns: ${refs.length} (refs ${refs.slice(0, REFS_SHOWN).join(", ")}${more})`);
  }
  if (incidents.length > 0) problems.push(`Tutor incidents: ${incidents.map((i) => `${i.kind} ×${i.n}`).join(", ")}`);
  if (killed.n > 0) problems.push(`Killed turns (still marked running): ${killed.n}`);
  if (library) {
    const started = library.startedAt.getTime();
    // The next run marks a run cut off mid-run as failed (finished_at then), so that one shows twice; that is fine.
    if (library.status === "failed" && library.finishedAt && recent(library.finishedAt.getTime(), now)) {
      problems.push(`Library refresh failed (run ${library.id})`);
    } else if (library.status === "running" && recent(started + STALE_AFTER_MS, now)) {
      problems.push(`Library refresh cut off mid-run (run ${library.id}, still marked running)`);
    }
    if (recent(started + LIBRARY_MISSED_AFTER_MS, now)) problems.push(`Library refresh missed: the last run started ${library.startedAt.toISOString()}`);
  }
  return problems;
}

/** Runs the check and reports it to the heartbeat (when `heartbeatUrl` is set). Never throws. */
export async function reportHealth({ db, now, heartbeatUrl, fetch }: HealthDeps): Promise<HealthReport> {
  let problems: string[];
  try {
    problems = await findProblems(db, now);
  } catch (error) {
    console.error("Health check: the database did not answer", error);
    return { ok: false, db: "failed", problems: [], heartbeat: "skipped" };
  }
  const ok = problems.length === 0;
  if (!heartbeatUrl) return { ok, db: "answered", problems, heartbeat: "off" };
  try {
    const signal = AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS);
    const response = ok
      ? await fetch(heartbeatUrl, { signal })
      : await fetch(`${heartbeatUrl.replace(/\/+$/, "")}/fail`, { method: "POST", body: problems.join("\n"), signal });
    if (!response.ok) throw new Error(`Better Stack answered ${response.status}`);
    return { ok, db: "answered", problems, heartbeat: "sent" };
  } catch (error) {
    console.error("Health check: the heartbeat could not be sent", error);
    return { ok, db: "answered", problems, heartbeat: "unreachable" };
  }
}
