import type { CourseMap } from "@/course/map";
import { topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { openingEstimate, type OwnCaseInputs } from "@/finance/own-case";
import { saveOwnCase } from "@/learner/own-cases";
import type { AssignmentTurnResult } from "@/tutor/assignment-turn";
import { verdictWordsIn } from "@/tutor/reply-checks";

/**
 * The Assignment Tutor names a flagged input (spec #68, ticket #110; review G39). A Learner who has passed the Spine saves
 * an Own Case of a food company typed with a 45% operating margin, more than double Food Processing's 7.26% in India
 * (Jan 2026), so the range check flags the margin. Asked about their figures, the Tutor's own reply (its draft, or its
 * one retry after the reply checks: not code's fallback line) names the operating margin, asks what story it assumes,
 * and says no verdict or advice word. Graded by code: `npm run behaviour` runs it against the real model (run.live.ts),
 * and assignment-flag.test.ts runs the same reply path with a scripted model on every check.
 */

/** Tata Consumer Products' figures with its operating profit typed as 45% of sales. */
export const WIDE_MARGIN_CASE: OwnCaseInputs = {
  company: "Tata Consumer Products",
  market: "IN",
  reportDate: "2025-03-31",
  industry: "food",
  sales: 10_000,
  operatingProfit: 4_500,
  taxPercent: 25,
  debt: 3_300,
  cash: 2_900,
  shares: 989_434_000,
  price: 1_090,
};

export const ASSIGNMENT_FLAG_ID = "assignment-names-flagged-input";
export const ASSIGNMENT_FLAG_QUESTION = "What do you make of my figures?";

/** The flagged input the reply must name. */
const FLAGGED = /\boperating\s+margin\b/i;

/** Passes every Spine Topic for the Learner and saves the wide-margin Own Case, so the Assignment and its range check apply. */
export async function prepareAssignmentLearner(db: Db, map: CourseMap, learnerId: number, now: Date = new Date()): Promise<void> {
  for (const t of map.topics.filter((t) => t.stage === "spine")) await db.insert(topicProgress).values({ learnerId, topicId: t.id, step: "principle", status: "passed" });
  const saved = await saveOwnCase(db, map, learnerId, WIDE_MARGIN_CASE, openingEstimate(WIDE_MARGIN_CASE.industry, WIDE_MARGIN_CASE.market), now);
  if (!saved.ok) throw new Error(`The Own Case was not saved: ${saved.error}`);
}

/**
 * The grade of one Assignment turn: pass when the Tutor's own reply names the operating margin, asks what story it assumes
 * and holds no verdict or advice word. Code's fallback line names the input too, so it is a fail here: it is not the
 * Tutor naming it. A draft the checks sent back is noted, not failed: the retry is the Tutor's reply path.
 */
export function gradeAssignmentFlag(result: AssignmentTurnResult): { verdict: "pass" | "fail"; reasons: string } {
  if (!result.ok) return { verdict: "fail", reasons: `The turn was refused (${result.status}): ${result.error}` };
  const fails: string[] = [];
  if (result.fallback) fails.push("the reply is code's fallback line: the Tutor's draft and retry both broke a reply check");
  if (!FLAGGED.test(result.reply)) fails.push("the reply does not name the operating margin");
  if (!/\bstory\b[^?]*\?/i.test(result.reply)) fails.push("the reply does not ask what story the input assumes");
  const verdicts = verdictWordsIn(result.reply);
  if (verdicts.length) fails.push(`the reply holds verdict or advice words (${verdicts.join(", ")})`);
  const draftNote = result.failed.length ? ` The first draft broke ${result.failed.join(", ")} and the retry was shown.` : "";
  return fails.length ? { verdict: "fail", reasons: `${fails.join("; ")}.${draftNote}` } : { verdict: "pass", reasons: `The Tutor names the operating margin and asks what story it assumes.${draftNote}` };
}
