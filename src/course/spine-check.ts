import { WHY_MAX_WORDS, WORKBENCH_RECIPES, type Topic } from "./map.ts";
import { SPINE_MAX_MINUTES } from "./outline.ts";

// The course check for the shape of a Spine Topic (spec 2026-11-12, C2; ADR 0004). A Spine Topic is a Converted Topic that
// runs the seven Teaching Steps once, so its file must hold: a Case with an as-of date, a reveal and a valuation block
// (its own or through valuationFrom); one Workbench Widget at explore, with one Insight found by play; exactly one Concept
// card; three to five Lingo terms; six to eight Quick tries; one quiz Check of judgement questions, four drawn per attempt
// and three to pass; at most one conversation Check; at most two Primers (the Topic schema caps them); a why line; and a
// length of fifteen minutes or less. Two Topics are built differently: the one that explores the existing annuity Widget
// (an AnnuityChart) on the Mega Millions Case, and the one that explores a cash waterfall from one year's inputs, so
// neither values a Case with the engine. What the Check's questions are (judgement kinds, computed ones) is lesson lint
// L13's (lesson-lint.ts).
// On the Spine the Learner judges other people's Stories (GLOSSARY): no Spine Topic has a Check marked `ownWork`, and no
// Workbench in all_open mode, whose "Save my story" saves the Learner's own; their own Estimate comes in an Assignment.
// So every Spine Topic, the ready-Case valuation Topic too, offers skip ahead (A8, src/course/skip-ahead.ts).
// Every rule here is keyed on a Topic id or what the Topic explores, never on its Spine number: the number is the
// Topic's place in the outline, so renumbering a Topic is a change to course/outline.yaml alone (ADR 0004, ADR 0020).
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

export const SPINE_TERMS = { min: 3, max: 5 } as const;
export const SPINE_QUICK_TRIES = { min: 6, max: 8 } as const;
export const SPINE_PER_ATTEMPT = 4;
export const SPINE_PASS_CORRECT = 3;

/**
 * Whether a Topic's last Check is a conversation Check about the Learner's own work. Such a Topic offers no skip ahead
 * (A8): a quiz cannot stand in for one's own valuation. No Spine Topic may have one (spineShapeProblems).
 */
export function endsOnOwnWork(topic: Pick<Topic, "checks">): boolean {
  const last = topic.checks.at(-1);
  return last?.kind === "conversation" && last.ownWork === true;
}

/** A written-ahead Widget that draws the annuity: Present value's AnnuityChart. */
const ANNUITY_PART = /\bAnnuityChart\(/;

/** What a Spine Topic lacks or has too much of, each in words that say what to give it. Empty when it has the shape. */
export function spineShapeProblems(t: Topic): string[] {
  const problems: string[] = [];
  const bench = t.explore?.workbench;
  const annuity = !bench && ANNUITY_PART.test(t.widgets.find((w) => w.id === t.explore?.widget)?.code ?? "");
  const cash = bench?.recipe === "cash_waterfall";

  // The Case: dated and revealed (the Topic schema requires both), and valued by the engine, except the annuity and cash Topics.
  if (!annuity && !cash && !t.cases.some((c) => c.valuation)) {
    problems.push("has no Case with a valuation block; give its Case one, or take Amazon's with valuationFrom");
  }

  // The explore Widget: a Workbench recipe, or the written-ahead annuity Widget (an AnnuityChart).
  if (!bench) {
    if (!annuity) problems.push(`has no Workbench Widget at explore; give explore a workbench naming one of ${WORKBENCH_RECIPES.join(", ")}`);
  } else if (cash) {
    if (!Object.keys(bench.inputs).length) problems.push("gives its cash waterfall no inputs; give it one year's revenue growth, margin and sales to capital");
  } else if (bench.case && !t.cases.find((c) => c.id === bench.case)?.valuation) {
    problems.push(`binds its Workbench to Case "${bench.case}", which has no valuation block`);
  }

  if (!t.insight) problems.push("has no Insight for the Learner to find by play at explore");

  const cards = t.checks.filter((c) => c.card).length;
  if (cards !== 1) problems.push(`has ${cards} Concept cards; a Spine Topic has exactly one`);

  const terms = t.terms.length;
  if (terms < SPINE_TERMS.min || terms > SPINE_TERMS.max) problems.push(`lists ${terms} Lingo terms; give it ${SPINE_TERMS.min} to ${SPINE_TERMS.max}`);

  const tries = t.checks.reduce((sum, c) => sum + c.quickTries.length, 0);
  if (tries < SPINE_QUICK_TRIES.min || tries > SPINE_QUICK_TRIES.max) problems.push(`has ${tries} Quick tries; give it ${SPINE_QUICK_TRIES.min} to ${SPINE_QUICK_TRIES.max}`);

  const quizzes = t.checks.filter((c) => c.kind === "quiz");
  if (quizzes.length !== 1) problems.push(`has ${quizzes.length} quiz Checks; a Spine Topic has one quiz Check of judgement questions`);
  for (const q of quizzes) {
    const shown = q.perAttempt ?? q.passRule.correct;
    if (shown !== SPINE_PER_ATTEMPT || q.passRule.correct !== SPINE_PASS_CORRECT) {
      problems.push(`quiz Check "${q.id}" shows ${shown} and passes at ${q.passRule.correct}; a Spine Check draws ${SPINE_PER_ATTEMPT} per attempt and passes at ${SPINE_PASS_CORRECT} (perAttempt: ${SPINE_PER_ATTEMPT}, passRule: { correct: ${SPINE_PASS_CORRECT} })`);
    }
    if (q.templates.length) problems.push(`quiz Check "${q.id}" draws from templates; a Spine Check asks judgement questions, so list questions only`);
  }
  const talks = t.checks.filter((c) => c.kind === "conversation").length;
  if (talks > 1) problems.push(`has ${talks} conversation Checks; at most one, in which the Learner tells the Valuation story`);
  for (const c of t.checks) {
    if (c.kind === "conversation" && c.ownWork) {
      problems.push(`has a Check about the Learner's own work ("${c.id}"); on the Spine the Learner judges a published Story, so drop ownWork (the Learner's own Estimate comes in an Assignment)`);
    }
  }
  const mode = bench?.recipe === "value_levers" ? (bench.inputs as { mode?: { kind?: unknown } }).mode : undefined;
  if (mode?.kind === "all_open") {
    problems.push("explores Value levers in all_open mode, which saves the Learner's own story; on the Spine the Learner judges a published Story, so give it a judging mode such as match_price");
  }

  if (!t.why) problems.push(`has no why line; give it one line, at most ${WHY_MAX_WORDS} words, linking it to valuing a company (A6)`);
  if (t.minutes === undefined) problems.push(`states no length; give it minutes, ${SPINE_MAX_MINUTES} or fewer`);
  else if (t.minutes > SPINE_MAX_MINUTES) problems.push(`takes ${t.minutes} minutes; a Spine Topic takes ${SPINE_MAX_MINUTES} or fewer`);
  return problems;
}

/** Every Spine Topic's shape problems, each naming its Topic (spec C2). Topics off the Spine are not read. */
export function spineCheckErrors(topics: readonly Topic[]): string[] {
  return topics.filter((t) => t.stage === "spine").flatMap((t) => spineShapeProblems(t).map((p) => `Spine Topic "${t.id}" ${p} (spec C2)`));
}
