import { parse } from "yaml";
import type { Topic } from "./map.ts";

/**
 * The critics gate for the Spine (spec 2026-11-12 C8, ADR 0004): "A Spine Topic ships only when the course check and the
 * critics pass." The critics are agents, not code, so what the course check can hold is their record: one entry per
 * written Spine Topic in docs/critics/spine-log.yaml, read by all four lenses, with no confirmed finding left open.
 */

/** Where the record lives, from the repository root. */
export const CRITICS_LOG_PATH = "docs/critics/spine-log.yaml";

/** The four critics C8 names, by their rubric files in docs/critics. */
export const SPINE_CRITICS = ["beginner-persona", "math-police", "historian", "widget-fit"] as const;

type Entry = { lenses?: unknown; rounds?: unknown; lastRound?: unknown; open?: unknown };

/** What is wrong with the record for these Topics: an empty list when every written Spine Topic may ship. */
export function criticsLogErrors(topics: readonly Pick<Topic, "id" | "stage">[], logText: string | null): string[] {
  const spine = topics.filter((t) => t.stage === "spine").map((t) => t.id);
  if (!spine.length) return [];
  if (logText === null) return [`${CRITICS_LOG_PATH} is missing: every written Spine Topic needs its critics' record (spec C8)`];
  let data: unknown;
  try {
    data = parse(logText);
  } catch (error) {
    return [`${CRITICS_LOG_PATH} does not parse: ${(error as Error).message}`];
  }
  const entries = (data as { topics?: Record<string, Entry> } | null)?.topics ?? {};
  const errors: string[] = [];
  for (const id of spine) {
    const e = entries[id];
    if (!e) {
      errors.push(`Spine Topic "${id}" has no critics' record in ${CRITICS_LOG_PATH}: run the four critics and log the round (spec C8)`);
      continue;
    }
    const lenses = Array.isArray(e.lenses) ? e.lenses : [];
    const missing = SPINE_CRITICS.filter((c) => !lenses.includes(c));
    if (missing.length) errors.push(`Spine Topic "${id}" has not been read by ${missing.join(", ")} (spec C8)`);
    if (!(Number.isInteger(e.rounds) && (e.rounds as number) >= 1)) errors.push(`Spine Topic "${id}": rounds must be a whole number of critic rounds, at least 1`);
    if (typeof e.lastRound !== "string" || !/^[0-9a-f]{7,40}$/.test(e.lastRound)) errors.push(`Spine Topic "${id}": lastRound must name the commit that fixed the last round's findings`);
    if (!Number.isInteger(e.open) || (e.open as number) < 0) errors.push(`Spine Topic "${id}": open must be the number of confirmed findings not fixed yet`);
    else if ((e.open as number) > 0) errors.push(`Spine Topic "${id}" has ${e.open} confirmed critic finding(s) open: fix them before it ships (spec C8)`);
  }
  const known = new Set(spine);
  for (const id of Object.keys(entries)) if (!known.has(id)) errors.push(`${CRITICS_LOG_PATH} logs "${id}", which is not a written Spine Topic`);
  return errors;
}
