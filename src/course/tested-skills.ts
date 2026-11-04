/**
 * Which Skills a Check tests, and whether a Topic is converted. Browser-safe: it holds only type imports, because
 * map.ts reads the Topic files from disk (node:fs), which the page bundle cannot hold. map.ts re-exports both.
 */
import type { Check, Topic } from "./map.ts";

/** A Topic is converted once its file lists Skills: its Concept steps show cards and the lesson lint covers it. */
export function isConverted(topic: Pick<Topic, "skills">): boolean {
  return topic.skills.length > 0;
}

/** The Skills a Check tests, in order and once each: its questions' and templates' Skills, or a conversation Check's own. */
export function testedSkills(topic: Pick<Topic, "questions" | "templates">, check: Check): string[] {
  if (check.kind === "conversation") return [...new Set(check.skills)];
  const fromQuestions = check.questions.flatMap((qid) => topic.questions.find((q) => q.id === qid)?.skill ?? []);
  const fromTemplates = check.templates.flatMap((tid) => topic.templates.find((t) => t.id === tid)?.skill ?? []);
  return [...new Set([...fromQuestions, ...fromTemplates])];
}
