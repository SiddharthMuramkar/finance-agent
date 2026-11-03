import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { FORMULA_IDS } from "../finance/formula-ids.ts";
import { parseOutline, STAGES, type Outline, type OutlineTopic, type Subject } from "./outline.ts";

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
  /** IDs of questions in the Topic's `questions` list, and of Question Bank questions (`bank:...`). */
  questions: z.array(z.string().min(1)).min(1),
  /** How many questions one attempt shows; defaults to the pass rule's `correct`. */
  perAttempt: z.number().int().min(1).optional(),
  passRule: z.object({ correct: z.number().int().min(1) }),
});

/**
 * A dated piece by a writer (an essay or blog post) that a Follow, Judge or Analyse Case studies:
 * the story is the piece as published, and the reveal is what happened afterwards. `from` says
 * where the Tutor gets its text: the Library (searched with `librarySource` as the source filter,
 * quoted only in short passages with credit) or the Learner's paste, which is never stored in the
 * Library or the repo.
 */
const pieceSchema = z.object({
  author: z.string().min(1),
  title: z.string().min(1),
  published: z.iso.date(),
  url: z.url(),
  from: z.enum(["library", "paste"]),
  /** The search_library source filter that finds the piece, e.g. "Damodaran". Library pieces only. */
  librarySource: z.string().min(1).optional(),
});

export type Piece = z.infer<typeof pieceSchema>;

const caseSchema = z.object({
  id,
  title: z.string().min(1),
  /** IDs of the Case Data datasets this Case is taught with. The laptop check confirms each one exists. */
  data: z.array(id).default([]),
  /** The story uses only what was known on this date. */
  asOf: z.iso.date(),
  story: z.string().min(1),
  /** Withheld from the Tutor until the reveal Teaching Step. */
  reveal: z.string().min(1),
  /** The dated piece this Case studies, if it is a writer's piece. */
  piece: pieceSchema.optional(),
});

/**
 * A Topic's Insight (ADR 0001): the surprising consequence of its idea, which the Learner finds at
 * the explore Teaching Step. The written Insight stays on the server until it is found or told.
 */
const insightSchema = z.object({
  /** What the Tutor asks the Learner to work out. Must not give the Insight away. */
  question: z.string().min(1),
  /** The Insight as a sentence. Reaches the Tutor only in a tool result, once found or told. */
  written: z.string().min(1),
  /** How the Tutor tells the Learner has found it. */
  foundWhen: z.string().min(1),
  /** Hint 1, then hint 2, released one per not-yet attempt. */
  hints: z.array(z.string().min(1)).min(1).max(2),
});

/** Where explore sits: after the concept of the named Check, before that Check's your turn. */
const exploreSchema = z.object({
  before: id,
  /** Whether a Learner who already passed the Topic is taken through explore again. */
  requiredWhenPassed: z.boolean().default(false),
  /**
   * The Topic's own explore Widget, in OpenUI code. Code (not the Tutor) puts it in the Widget panel when
   * explore begins and keeps it there until the Topic is passed. Parsed by the tests; its Case Data
   * references are checked here.
   */
  widget: z.string().min(1).optional(),
});

export type Insight = z.infer<typeof insightSchema>;

export { STAGES };

/** A link from a Topic's idea to others, given at the principle step. Plain words only: figures belong to the Case Data. */
const connectionSchema = z.object({
  text: z.string().min(1),
  /** Outline Topic IDs (written or still coming) this Connection links to. */
  topics: z.array(id).min(1),
});

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
  /** The named formulas this Topic teaches, each shown only as a Formula Card (IDs from the formula registry). */
  formulas: z
    .array(z.string().refine((f) => (FORMULA_IDS as readonly string[]).includes(f), { message: `Unknown formula; the formula registry has: ${FORMULA_IDS.join(", ")}` }))
    .default([]),
  principle: z.string().min(1),
  /** The Topic's Insight and the explore step that leads the Learner to it; both or neither. */
  insight: insightSchema.optional(),
  explore: exploreSchema.optional(),
  /** Two or three Connections the Tutor gives at the principle step. Optional. */
  connections: z
    .array(connectionSchema)
    .max(3)
    .refine((c) => c.length !== 1, "give two or three Connections, or none")
    .optional(),
  /** Claude-written quiz questions that this Topic's quiz Checks draw on. */
  questions: z.array(quizQuestion).default([]),
  checks: z.array(z.discriminatedUnion("kind", [conversationCheck, quizCheck])),
});

/** A Connection with the titles of its linked Topics filled in by code. */
export type Connection = { text: string; topics: string[]; titles: string[] };

export type Topic = Omit<z.infer<typeof topicSchema>, "stage" | "path" | "prerequisites" | "connections"> & {
  /** Empty when the Topic has none. */
  connections: Connection[];
  stage: (typeof STAGES)[number];
  /** The field a Foundation Topic belongs to (from the outline); none for later Stages. */
  subject?: Subject;
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
      const pieceErrors = result.data.cases.flatMap(pieceProblems);
      if (pieceErrors.length) {
        errors.push(...pieceErrors.map((e) => `${file.name}: ${e}`));
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
  // With an outline a Connection may name any planned Topic, written or coming; without one, written Topics only.
  const titles = new Map((outline ? outline.topics : topics).map((t) => [t.id, t.title] as const));
  for (const t of topics) {
    errors.push(...connectionProblems(t, titles));
    if (t.checks.length === 0) errors.push(`Topic "${t.id}" has no Checks`);
    errors.push(...quizProblems(t), ...insightProblems(t));
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

function pieceProblems(c: z.infer<typeof caseSchema>): string[] {
  const p = c.piece;
  if (!p) return [];
  const problems: string[] = [];
  if (p.published > c.asOf) problems.push(`Case "${c.id}" studies a piece published ${p.published}, after its as-of date ${c.asOf}`);
  if (p.from === "library" && !p.librarySource) problems.push(`Case "${c.id}" reads its piece from the Library, so it needs librarySource`);
  if (p.from === "paste" && p.librarySource) problems.push(`Case "${c.id}" has a pasted piece, which is never in the Library, so it cannot name a librarySource`);
  return problems;
}

/** Connections before their Topic titles are looked up (done once every Topic is read). */
const unresolved = (file: z.infer<typeof topicSchema>): Connection[] => (file.connections ?? []).map((c) => ({ ...c, titles: [] }));

/** A Connection's or Insight's text may not hold a figure: numbers come only from Case Data and the calculators. */
const FIGURE = /[0-9%$€£₹]/;

/** Checks each Connection against the known Topic titles, and fills in the titles of the Topics it links to. */
function connectionProblems(t: Topic, known: Map<string, string>): string[] {
  const problems: string[] = [];
  t.connections.forEach((c, i) => {
    const n = i + 1;
    if (FIGURE.test(c.text)) problems.push(`Topic "${t.id}" Connection ${n} contains a figure; Connections are written in words`);
    for (const target of c.topics) {
      if (target === t.id) problems.push(`Topic "${t.id}" Connection ${n} links to the Topic itself`);
      else if (!known.has(target)) problems.push(`Topic "${t.id}" Connection ${n} links to "${target}", which is not in the outline`);
    }
    c.titles = c.topics.map((x) => known.get(x) ?? x);
  });
  return problems;
}

/** Fills in Stage, place and prerequisites. Returns a problem message when the file and outline disagree. */
function resolveTopic(file: z.infer<typeof topicSchema>, outline: Outline | undefined): Topic | string {
  if (!outline) {
    if (file.stage === undefined || file.path === undefined) return "stage and path are required";
    return { ...file, connections: unresolved(file), stage: file.stage, path: file.path, prerequisites: file.prerequisites ?? [] };
  }
  const planned = outline.topics.find((t) => t.id === file.id);
  if (!planned) return `Topic "${file.id}" is not in the outline`;
  if (file.stage !== undefined || file.path !== undefined || file.prerequisites !== undefined) {
    return `stage, path and prerequisites belong in the outline, not in the Topic file`;
  }
  return { ...file, connections: unresolved(file), stage: planned.stage, subject: planned.subject, path: planned.path, prerequisites: planned.prerequisites };
}

/** A Case Data reference, "caseId/datasetId", written as a string in Widget code. */
const CASE_DATA_REFERENCE = /"([a-z0-9-]+)\/([a-z0-9-]+)"/g;

/** Case Data references in the explore Widget's code that do not belong to the Topic's own Cases and their datasets. */
function exploreWidgetReferenceProblems(t: Pick<Topic, "id" | "cases" | "explore">): string[] {
  const code = t.explore?.widget ?? "";
  return [...code.matchAll(CASE_DATA_REFERENCE)].flatMap(([, caseId, datasetId]) => {
    const c = t.cases.find((x) => x.id === caseId);
    if (!c) return [`Topic "${t.id}" explore Widget reads "${caseId}/${datasetId}", but "${caseId}" is not one of the Topic's Cases`];
    return c.data.includes(datasetId) ? [] : [`Topic "${t.id}" explore Widget reads "${caseId}/${datasetId}", but Case "${caseId}" does not list dataset "${datasetId}"`];
  });
}

/** An Insight is written in words too: a figure would hand the Learner a number to look for. */
function insightProblems(t: Topic): string[] {
  const problems: string[] = [];
  if (t.insight && !t.explore) problems.push(`Topic "${t.id}" has an insight but no explore`);
  if (t.explore && !t.insight) problems.push(`Topic "${t.id}" has explore but no insight`);
  if (t.explore && !t.checks.some((c) => c.id === t.explore!.before)) {
    problems.push(`Topic "${t.id}" explores before Check "${t.explore.before}", which it does not have`);
  }
  if (t.explore?.widget) problems.push(...exploreWidgetReferenceProblems(t));
  if (t.insight) {
    const { question, written, foundWhen, hints } = t.insight;
    const fields: [string, string][] = [["question", question], ["written", written], ["foundWhen", foundWhen], ...hints.map((h, i): [string, string] => [`hints.${i}`, h])];
    for (const [field, text] of fields) {
      if (FIGURE.test(text)) problems.push(`Topic "${t.id}" has a figure in insight.${field}; write the Insight in words`);
    }
  }
  return problems;
}

/** The ID prefix of a Question Bank question. Bank questions live in the database, so the file cannot hold them. */
export const BANK_PREFIX = "bank:";
export const isBankId = (questionId: string) => questionId.startsWith(BANK_PREFIX);

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
    for (const q of c.questions) if (!isBankId(q) && !known.has(q)) problems.push(`Check "${c.id}" uses question "${q}", which Topic "${t.id}" does not have`);
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
