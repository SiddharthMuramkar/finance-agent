import { parse } from "yaml";
import { z } from "zod";

// This module imports only packages, so `scripts/check-course.mjs` can run it with Node's type stripping.

const id = z.string().regex(/^[a-z0-9-]+$/, "IDs use lower case letters, digits and hyphens");

export const STAGES = ["foundation", "follow", "judge", "analyse"] as const;

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
  cases: z.array(outlineCase).min(1, "a Topic needs at least one candidate Case"),
});

const outlineFile = z.object({ topics: z.array(outlineTopic).min(1) });

export type OutlineCase = z.infer<typeof outlineCase>;
/** `path` is the Topic's place on the default path, counted from 1 in file order. */
export type OutlineTopic = z.infer<typeof outlineTopic> & { path: number };
export type Outline = { topics: OutlineTopic[] };

/**
 * Parses and checks the outline: every planned Topic in default-path order. Returns every
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

export const STAGE_TITLE: Record<(typeof STAGES)[number], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };

/**
 * The readable Course Map for the owner: Topics in default-path order with Stage, prerequisites
 * and candidate Cases. Generated from the outline, never edited by hand; `course:check` fails when
 * the saved copy differs from this.
 */
export function renderCourseMapDoc(outline: Outline, written: ReadonlySet<string>): string {
  const title = (pid: string) => outline.topics.find((t) => t.id === pid)?.title ?? pid;
  const counts = STAGES.map((s) => `${outline.topics.filter((t) => t.stage === s).length} ${STAGE_TITLE[s]}`).join(", ");
  const lines: string[] = [
    "<!-- Generated by `npm run course:doc` from course/outline.yaml. Do not edit by hand: change the outline, then regenerate. -->",
    "",
    "# Course Map",
    "",
    `${outline.topics.length} Topics (${counts}), in default-path order. ${written.size} written so far; the rest are Coming.`,
    "A Case marked **to verify** has facts that must be checked against a source before its Topic is written.",
    "",
  ];
  for (const stage of STAGES) {
    const inStage = outline.topics.filter((t) => t.stage === stage);
    if (!inStage.length) continue;
    lines.push(`## ${STAGE_TITLE[stage]}`, "");
    for (const t of inStage) {
      lines.push(`### ${t.path}. ${t.title}`, "");
      lines.push(`- ID: \`${t.id}\` · ${written.has(t.id) ? "Written" : "Coming"}${t.subject ? ` · Subject: ${t.subject}` : ""}`);
      lines.push(`- Needs first: ${t.prerequisites.length ? t.prerequisites.map(title).join(", ") : "nothing"}`);
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
