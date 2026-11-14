import { parse } from "yaml";
import { z } from "zod";

// This module imports only packages, so `scripts/check-course.mjs` can run it with Node's type stripping.

const id = z.string().regex(/^[a-z0-9-]+$/, "IDs use lower case letters, digits and hyphens");

/**
 * The Stages, in the order the Course Map shows them. The Spine (spec C1) is the default path's first fifteen Topics, which
 * teach valuation in order; a Foundation Topic is an Elective, opened when the Learner chooses it.
 */
export const STAGES = ["spine", "foundation", "follow", "judge", "analyse"] as const;
export type Stage = (typeof STAGES)[number];

/** How many Topics the Spine has (spec C4), and the longest a Spine Topic may say it takes, in minutes (C2). */
export const SPINE_LENGTH = 15;
export const SPINE_MAX_MINUTES = 15;

/** The nine Subjects: the field a Foundation Topic belongs to. Later-Stage Topics have none. */
export const SUBJECTS = [
  "Numbers & time value",
  "Financial statements",
  "Economics & policy",
  "Currencies & countries",
  "Bonds & credit",
  "Markets & investing",
  "Valuation & corporate finance",
  "Derivatives",
  "Banks, crises & the system",
] as const;
export type Subject = (typeof SUBJECTS)[number];

const outlineCase = z.object({
  title: z.string().min(1),
  /** The Case is told using only what was known on this date. */
  asOf: z.iso.date(),
  /** What happened afterwards: the known outcome the reveal will show. */
  outcome: z.string().min(1),
  /** Where the facts were checked. At least one. */
  sources: z.array(z.url()).min(1, "a Case needs at least one source URL"),
  /** False means the facts still have to be checked against a source before the Topic is written. */
  verified: z.boolean(),
  note: z.string().optional(),
});

const outlineTopic = z.object({
  id,
  title: z.string().min(1),
  stage: z.enum(STAGES),
  subject: z.enum(SUBJECTS).optional(),
  prerequisites: z.array(id).default([]),
  /** A Spine Topic's number, 1 to 15: its place on the Spine (spec C4). Spine Topics only. */
  spine: z.number().int().min(1).max(SPINE_LENGTH).optional(),
  /** How long the Topic takes, in whole minutes; the Course Map shows it on each Spine row (spec C6). */
  minutes: z.number().int().positive().optional(),
  /**
   * The Topics a Spine Topic is built from (spec Appendix D), mostly Electives. Not prerequisites: nothing is asked to be
   * done first, and the Course Map uses the list to say which Spine Topic uses each Elective's idea. Spine Topics only.
   */
  drawsOn: z.array(id).optional(),
  cases: z.array(outlineCase).min(1, "a Topic needs at least one candidate Case"),
});

const outlineFile = z.object({ topics: z.array(outlineTopic).min(1) });

export type OutlineCase = z.infer<typeof outlineCase>;
/** `path` is the Topic's place in the outline, counted from 1 in file order; the default path is worked out from it and the Stage. */
export type OutlineTopic = z.infer<typeof outlineTopic> & { path: number };
export type Outline = { topics: OutlineTopic[] };

/**
 * Parses and checks the outline: every planned Topic in outline order. Returns every
 * problem found. A prerequisite must exist, must not loop, and must come earlier on the path.
 */
export function parseOutline(text: string): { outline?: Outline; errors: string[] } {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { errors: [e instanceof Error ? e.message : String(e)] };
  }
  const result = outlineFile.safeParse(raw);
  if (!result.success) {
    return { errors: result.error.issues.map((i) => `outline: ${i.path.join(".") || "(file)"}: ${i.message}`) };
  }
  const topics: OutlineTopic[] = result.data.topics.map((t, i) => ({ ...t, path: i + 1 }));
  const errors: string[] = [];
  const byId = new Map<string, OutlineTopic>();
  for (const t of topics) {
    if (byId.has(t.id)) errors.push(`Duplicate Topic ID "${t.id}"`);
    byId.set(t.id, t);
  }
  for (const t of topics) {
    if (t.stage === "foundation" && !t.subject) errors.push(`Foundation Topic "${t.id}" has no Subject`);
    if (t.stage !== "foundation" && t.subject) errors.push(`Topic "${t.id}" is not Foundation, so it must not have a Subject`);
    for (const p of t.prerequisites) {
      if (!byId.has(p)) errors.push(`Topic "${t.id}" requires "${p}", which is not in the outline`);
    }
  }
  errors.push(...spineProblems(topics, byId));
  if (errors.length) return { errors };
  const loop = findLoop(topics, byId);
  if (loop) return { errors: [`Prerequisite loop: ${loop.join(" -> ")}`] };
  for (const t of topics) {
    for (const p of t.prerequisites) {
      if ((byId.get(p) as OutlineTopic).path > t.path) errors.push(`Topic "${t.id}" comes before its prerequisite "${p}" on the default path`);
    }
  }
  return errors.length ? { errors } : { outline: { topics }, errors };
}

/**
 * The Spine's own rules. A Spine Topic has a number and a length of at most fifteen minutes, and no prerequisites: it is
 * reached in order, and what it borrows from an Elective it says under drawsOn, which never locks or asks for anything
 * first. The numbers present run 1, 2, 3 with none repeated or skipped, so a Spine can be written from its first Topic on.
 */
function spineProblems(topics: OutlineTopic[], byId: Map<string, OutlineTopic>): string[] {
  const problems: string[] = [];
  const numbers = new Map<number, string>();
  for (const t of topics) {
    if (t.stage !== "spine") {
      if (t.spine !== undefined) problems.push(`Topic "${t.id}" is not a Spine Topic, so it must not have a Spine number`);
      if (t.drawsOn !== undefined) problems.push(`Topic "${t.id}" is not a Spine Topic, so it must not list drawsOn`);
      continue;
    }
    if (t.spine === undefined) problems.push(`Spine Topic "${t.id}" has no Spine number`);
    else if (numbers.has(t.spine)) problems.push(`Spine Topics "${numbers.get(t.spine)}" and "${t.id}" both have Spine number ${t.spine}`);
    else numbers.set(t.spine, t.id);
    if (t.minutes === undefined) problems.push(`Spine Topic "${t.id}" does not say how many minutes it takes`);
    else if (t.minutes > SPINE_MAX_MINUTES) problems.push(`Spine Topic "${t.id}" takes ${t.minutes} minutes; a Spine Topic takes ${SPINE_MAX_MINUTES} or fewer`);
    if (t.prerequisites.length) problems.push(`Spine Topic "${t.id}" lists prerequisites; a Spine Topic has none, and names what it builds on under drawsOn`);
    const drawn = t.drawsOn ?? [];
    if (new Set(drawn).size !== drawn.length) problems.push(`Spine Topic "${t.id}" lists a Topic twice under drawsOn`);
    for (const d of drawn) {
      const other = byId.get(d);
      if (!other) problems.push(`Spine Topic "${t.id}" draws on "${d}", which is not in the outline`);
      else if (other.stage === "spine") problems.push(`Spine Topic "${t.id}" draws on "${d}", which is a Spine Topic; drawsOn names the Topics outside the Spine it is built from`);
    }
  }
  const missing = Array.from({ length: Math.max(0, ...numbers.keys()) }, (_, i) => i + 1).filter((n) => !numbers.has(n));
  if (missing.length) problems.push(`The Spine skips number${missing.length === 1 ? "" : "s"} ${missing.join(", ")}: Spine numbers run from 1 with none left out`);
  return problems;
}

/** The Spine Topics in Spine order, 1 first. Empty while the outline has none. */
export function spineTopics(outline: Outline): OutlineTopic[] {
  return outline.topics.filter((t) => t.stage === "spine").sort((a, b) => (a.spine ?? 0) - (b.spine ?? 0));
}

/** An Elective is a Foundation Topic (spec C1): on the Course Map, opened at any time, and never next unless chosen. */
export function isElective(topic: { stage: Stage }): boolean {
  return topic.stage === "foundation";
}

/**
 * Which Spine Topics use each Topic's idea, from their drawsOn lists: Topic id to Spine numbers, lowest first. The Course
 * Map says it on each Elective's row (spec C6). A Topic no Spine Topic draws on is not in the map.
 */
export function usedInSpine(outline: Outline): Map<string, number[]> {
  const used = new Map<string, number[]>();
  for (const t of spineTopics(outline)) {
    for (const d of t.drawsOn ?? []) used.set(d, [...(used.get(d) ?? []), t.spine as number]);
  }
  return used;
}

function findLoop(topics: OutlineTopic[], byId: Map<string, OutlineTopic>): string[] | undefined {
  const done = new Set<string>();
  const visit = (t: OutlineTopic, trail: string[]): string[] | undefined => {
    if (trail.includes(t.id)) return [...trail.slice(trail.indexOf(t.id)), t.id];
    if (done.has(t.id)) return undefined;
    for (const p of t.prerequisites) {
      const next = byId.get(p);
      const loop = next && visit(next, [...trail, t.id]);
      if (loop) return loop;
    }
    done.add(t.id);
    return undefined;
  };
  for (const t of topics) {
    const loop = visit(t, []);
    if (loop) return loop;
  }
  return undefined;
}

export const STAGE_TITLE: Record<Stage, string> = { spine: "Spine", foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };

/**
 * The readable Course Map for the owner: Topics in outline order with Stage, prerequisites
 * and candidate Cases. Generated from the outline, never edited by hand; `course:check` fails when
 * the saved copy differs from this.
 */
export function renderCourseMapDoc(outline: Outline, written: ReadonlySet<string>): string {
  const title = (pid: string) => outline.topics.find((t) => t.id === pid)?.title ?? pid;
  // The Spine is named only once the outline has a Spine Topic, so the document reads as before until then.
  const hasSpine = outline.topics.some((t) => t.stage === "spine");
  const counted = STAGES.filter((s) => s !== "spine" || hasSpine);
  const counts = counted.map((s) => `${outline.topics.filter((t) => t.stage === s).length} ${STAGE_TITLE[s]}`).join(", ");
  // With a Spine, the file's order is no longer the default path: Electives sit in it but are next only when chosen (C1).
  const order = hasSpine
    ? "in outline order. The default path is the written Spine Topics, then Follow, Judge and Analyse; every Foundation Topic is an Elective, opened when the Learner chooses it."
    : "in default-path order.";
  const lines: string[] = [
    "<!-- Generated by `npm run course:doc` from course/outline.yaml. Do not edit by hand: change the outline, then regenerate. -->",
    "",
    "# Course Map",
    "",
    `${outline.topics.length} Topics (${counts}), ${order} ${written.size} written so far; the rest are Coming.`,
    "A Case marked **to verify** has facts that must be checked against a source before its Topic is written.",
    "",
  ];
  for (const stage of STAGES) {
    const inStage = stage === "spine" ? spineTopics(outline) : outline.topics.filter((t) => t.stage === stage);
    if (!inStage.length) continue;
    lines.push(`## ${STAGE_TITLE[stage]}`, "");
    for (const t of inStage) {
      lines.push(`### ${t.path}. ${t.title}`, "");
      const spine = t.spine === undefined ? "" : ` · Spine ${t.spine}`;
      const minutes = t.minutes === undefined ? "" : ` · ${t.minutes} minutes`;
      lines.push(`- ID: \`${t.id}\` · ${written.has(t.id) ? "Written" : "Coming"}${spine}${minutes}${t.subject ? ` · Subject: ${t.subject}` : ""}`);
      lines.push(`- Needs first: ${t.prerequisites.length ? t.prerequisites.map(title).join(", ") : "nothing"}`);
      if (t.drawsOn?.length) lines.push(`- Draws on: ${t.drawsOn.map(title).join(", ")}`);
      for (const c of t.cases) {
        lines.push(`- Case: **${c.title}** (as of ${c.asOf})${c.verified ? "" : " **to verify**"}`);
        lines.push(`  - Outcome: ${c.outcome}`);
        if (c.note) lines.push(`  - Note: ${c.note}`);
        lines.push(`  - Sources: ${c.sources.join(" ")}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
