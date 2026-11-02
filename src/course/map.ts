import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

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

const quizCheck = z.object({
  id,
  kind: z.literal("quiz"),
  required: z.boolean().default(false),
  /** Question Bank IDs. */
  questions: z.array(z.string().min(1)).min(1),
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

export const STAGES = ["foundation", "follow", "judge", "analyse"] as const;

const topicSchema = z.object({
  id,
  title: z.string().min(1),
  stage: z.enum(STAGES),
  /** Place on the default path; lower comes first. */
  path: z.number().int(),
  prerequisites: z.array(id).default([]),
  cases: z.array(caseSchema).min(1),
  concept: z.string().min(1),
  principle: z.string().min(1),
  checks: z.array(z.discriminatedUnion("kind", [conversationCheck, quizCheck])),
});

export type Topic = z.infer<typeof topicSchema>;
export type Check = Topic["checks"][number];
export type CourseMap = {
  /** Topics in default-path order. */
  topics: Topic[];
  topic(id: string): Topic | undefined;
  check(id: string): (Check & { topicId: string }) | undefined;
};

export type TopicFile = { name: string; text: string };

/** Parses and validates Topic files. Returns every problem found, not just the first. */
export function parseCourseMap(files: TopicFile[]): { map?: CourseMap; errors: string[] } {
  const errors: string[] = [];
  const topics: Topic[] = [];
  for (const file of files) {
    try {
      const result = topicSchema.safeParse(parse(file.text));
      if (result.success) topics.push(result.data);
      else
        errors.push(
          ...result.error.issues.map((i) => `${file.name}: ${i.path.join(".") || "(file)"}: ${i.message}`),
        );
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) return { errors };

  const seen = new Set<string>();
  for (const t of topics) {
    for (const key of [t.id, ...t.cases.map((c) => c.id), ...t.checks.map((c) => c.id)]) {
      if (seen.has(key)) errors.push(`Duplicate ID "${key}"`);
      seen.add(key);
    }
  }

  const byId = new Map(topics.map((t) => [t.id, t]));
  for (const t of topics) {
    if (t.checks.length === 0) errors.push(`Topic "${t.id}" has no Checks`);
    for (const p of t.prerequisites) {
      if (!byId.has(p)) errors.push(`Topic "${t.id}" requires "${p}", which is not on the Course Map`);
    }
  }
  const loop = findLoop(topics, byId);
  if (loop) errors.push(`Prerequisite loop: ${loop.join(" -> ")}`);
  if (errors.length) return { errors };

  const sorted = [...topics].sort((a, b) => a.path - b.path || a.id.localeCompare(b.id));
  const checks = new Map(topics.flatMap((t) => t.checks.map((c) => [c.id, { ...c, topicId: t.id }] as const)));
  return {
    errors,
    map: { topics: sorted, topic: (k) => byId.get(k), check: (k) => checks.get(k) },
  };
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

let cached: CourseMap | undefined;

/** Loads the real Course Map from `course/topics`, throwing if it is invalid. */
export function loadCourseMap(): CourseMap {
  if (cached) return cached;
  const { map, errors } = parseCourseMap(readTopicFiles());
  if (!map) throw new Error(`Invalid Course Map:\n${errors.join("\n")}`);
  cached = map;
  return map;
}
