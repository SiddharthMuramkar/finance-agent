import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { parseOutline, STAGES, type Outline, type OutlineTopic } from "./outline.ts";

// This module imports only packages (no "@/" paths), so `scripts/check-course.mjs`
// can run it directly with Node's type stripping.

const id = z.string().regex(/^[a-z0-9-]+$/, "IDs use lower case letters, digits and hyphens");

const conversationCheck = z.object({
  id,
  kind: z.literal("conversation"),
  /** A Check added to an already passed Topic is due only if it is required. */
  required: z.boolean().default(false),
  prompt: z.string().min(1),
  passCriteria: z.string().min(1),
});

/** A Claude-written quiz question. The key (`answer`, `explanation`) stays on the server until the Learner has answered. */
const quizQuestion = z.object({
  id,
  prompt: z.string().min(1),
  choices: z.array(z.object({ id, text: z.string().min(1) })).min(2),
  /** The ID of the right choice. */
  answer: id,
  /** Shown only after the Learner has answered. */
  explanation: z.string().min(1),
  /** Where the answer was checked: a citation or URL. */
  source: z.string().min(1),
});

const quizCheck = z.object({
  id,
  kind: z.literal("quiz"),
  required: z.boolean().default(false),
  /** IDs of questions in the Topic's `questions` list. */
  questions: z.array(z.string().min(1)).min(1),
  /** How many questions one attempt shows; defaults to the pass rule's `correct`. */
  perAttempt: z.number().int().min(1).optional(),
  passRule: z.object({ correct: z.number().int().min(1) }),
});

const caseSchema = z.object({
  id,
  title: z.string().min(1),
  /** The story uses only what was known on this date. */
  asOf: z.iso.date(),
  story: z.string().min(1),
  /** Withheld from the Tutor until the reveal Teaching Step. */
  reveal: z.string().min(1),
});

export { STAGES };

/**
 * A Topic file. Stage, place and prerequisites belong in `course/outline.yaml`. A file sets them
 * itself only when a map is checked without an outline (as the tests do).
 */
const topicSchema = z.object({
  id,
  title: z.string().min(1),
  stage: z.enum(STAGES).optional(),
  /** Place on the default path; lower comes first. */
  path: z.number().int().optional(),
  prerequisites: z.array(id).optional(),
  cases: z.array(caseSchema).min(1),
  concept: z.string().min(1),
  principle: z.string().min(1),
  /** Claude-written quiz questions that this Topic's quiz Checks draw on. */
  questions: z.array(quizQuestion).default([]),
  checks: z.array(z.discriminatedUnion("kind", [conversationCheck, quizCheck])),
});

export type Topic = Omit<z.infer<typeof topicSchema>, "stage" | "path" | "prerequisites"> & {
  stage: (typeof STAGES)[number];
  /** Place on the default path; lower comes first. */
  path: number;
  prerequisites: string[];
};
export type Check = Topic["checks"][number];
export type QuizCheck = Extract<Check, { kind: "quiz" }>;
export type QuizQuestion = Topic["questions"][number];
export type CourseMap = {
  /** Topics in default-path order. */
  topics: Topic[];
  topic(id: string): Topic | undefined;
  check(id: string): (Check & { topicId: string }) | undefined;
  /** A quiz question by ID, from whichever Topic holds it. */
  question(id: string): QuizQuestion | undefined;
  /** Topics in the outline that are not written yet, in default-path order. Not teachable, shown as coming. */
  coming: OutlineTopic[];
};

export type TopicFile = { name: string; text: string };

/**
 * Parses and validates Topic files. Returns every problem found, not just the first.
 * With an `outline`, each file must match an outline entry, which supplies its Stage, place and
 * prerequisites (the written ones only); outline Topics with no file come back as `coming`.
 */
export function parseCourseMap(files: TopicFile[], outline?: Outline): { map?: CourseMap; errors: string[] } {
  const errors: string[] = [];
  const topics: Topic[] = [];
  for (const file of files) {
    try {
      const result = topicSchema.safeParse(parse(file.text));
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => `${file.name}: ${i.path.join(".") || "(file)"}: ${i.message}`));
        continue;
      }
      const resolved = resolveTopic(result.data, outline);
      if (typeof resolved === "string") errors.push(`${file.name}: ${resolved}`);
      else topics.push(resolved);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) return { errors };
  if (outline) {
    // Only written Topics can be passed, so a prerequisite that is still Coming is left out of the teachable map.
    const written = new Set(topics.map((t) => t.id));
    for (const t of topics) t.prerequisites = t.prerequisites.filter((p) => written.has(p));
  }

  const seen = new Set<string>();
  for (const t of topics) {
    for (const key of [t.id, ...t.cases.map((c) => c.id), ...t.checks.map((c) => c.id), ...t.questions.map((q) => q.id)]) {
      if (seen.has(key)) errors.push(`Duplicate ID "${key}"`);
      seen.add(key);
    }
  }

  const byId = new Map(topics.map((t) => [t.id, t]));
  for (const t of topics) {
    if (t.checks.length === 0) errors.push(`Topic "${t.id}" has no Checks`);
    errors.push(...quizProblems(t));
    for (const p of t.prerequisites) {
      if (!byId.has(p)) errors.push(`Topic "${t.id}" requires "${p}", which is not on the Course Map`);
    }
  }
  const loop = findLoop(topics, byId);
  if (loop) errors.push(`Prerequisite loop: ${loop.join(" -> ")}`);
  if (errors.length) return { errors };

  const sorted = [...topics].sort((a, b) => a.path - b.path || a.id.localeCompare(b.id));
  const checks = new Map(topics.flatMap((t) => t.checks.map((c) => [c.id, { ...c, topicId: t.id }] as const)));
  const questions = new Map(topics.flatMap((t) => t.questions.map((q) => [q.id, q] as const)));
  return {
    errors,
    map: {
      topics: sorted,
      topic: (k) => byId.get(k),
      check: (k) => checks.get(k),
      question: (k) => questions.get(k),
      coming: outline ? outline.topics.filter((t) => !byId.has(t.id)) : [],
    },
  };
}

/** Fills in Stage, place and prerequisites. Returns a problem message when the file and outline disagree. */
function resolveTopic(file: z.infer<typeof topicSchema>, outline: Outline | undefined): Topic | string {
  if (!outline) {
    if (file.stage === undefined || file.path === undefined) return "stage and path are required";
    return { ...file, stage: file.stage, path: file.path, prerequisites: file.prerequisites ?? [] };
  }
  const planned = outline.topics.find((t) => t.id === file.id);
  if (!planned) return `Topic "${file.id}" is not in the outline`;
  if (file.stage !== undefined || file.path !== undefined || file.prerequisites !== undefined) {
    return `stage, path and prerequisites belong in the outline, not in the Topic file`;
  }
  return { ...file, stage: planned.stage, path: planned.path, prerequisites: planned.prerequisites };
}

function quizProblems(t: Topic): string[] {
  const problems: string[] = [];
  for (const q of t.questions) {
    const choiceIds = q.choices.map((c) => c.id);
    if (new Set(choiceIds).size !== choiceIds.length) problems.push(`Question "${q.id}" repeats a choice ID`);
    if (!choiceIds.includes(q.answer)) problems.push(`Question "${q.id}" has answer "${q.answer}", which is not one of its choices`);
  }
  const known = new Set(t.questions.map((q) => q.id));
  for (const c of t.checks) {
    if (c.kind !== "quiz") continue;
    for (const q of c.questions) if (!known.has(q)) problems.push(`Check "${c.id}" uses question "${q}", which Topic "${t.id}" does not have`);
    if (new Set(c.questions).size !== c.questions.length) problems.push(`Check "${c.id}" lists a question twice`);
    const shown = c.perAttempt ?? c.passRule.correct;
    if (shown > c.questions.length) problems.push(`Check "${c.id}" shows ${shown} questions per attempt but lists only ${c.questions.length}`);
    if (c.passRule.correct > shown) problems.push(`Check "${c.id}" needs ${c.passRule.correct} correct but shows only ${shown} per attempt`);
  }
  return problems;
}

/** Depth-first search for a cycle through prerequisites. */
function findLoop(topics: Topic[], byId: Map<string, Topic>): string[] | undefined {
  const done = new Set<string>();
  const visit = (t: Topic, trail: string[]): string[] | undefined => {
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

/** Reads every Topic file in `course/topics`. Paths stay literal so Next traces only that folder. */
export function readTopicFiles(): TopicFile[] {
  return readdirSync(join(process.cwd(), "course", "topics"))
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(process.cwd(), "course", "topics", name), "utf8") }));
}

/** Reads the outline of every planned Topic. */
export function readOutlineText(): string {
  return readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8");
}

let cached: CourseMap | undefined;

/** Loads the real Course Map from `course/topics` and `course/outline.yaml`, throwing if either is invalid. */
export function loadCourseMap(): CourseMap {
  if (cached) return cached;
  const planned = parseOutline(readOutlineText());
  if (!planned.outline) throw new Error(`Invalid Course Map outline:\n${planned.errors.join("\n")}`);
  const { map, errors } = parseCourseMap(readTopicFiles(), planned.outline);
  if (!map) throw new Error(`Invalid Course Map:\n${errors.join("\n")}`);
  cached = map;
  return map;
}
