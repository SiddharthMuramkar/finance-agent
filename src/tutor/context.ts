import { TEACHING_STEPS, type Place } from "@/course/navigator";

const AFTER_REVEAL = TEACHING_STEPS.indexOf("reveal");

/**
 * The Teaching Step context code sends the Tutor as an appended message. The
 * Case's outcome is included only from the reveal on, so hindsight is withheld
 * by code as well as by instructions.
 */
export function stepContext(place: Place | null): string {
  if (!place) return "Course Navigator: every Topic on the Course Map is passed. Answer the Learner's questions.";
  const { topic, step, check } = place;
  const revealed = TEACHING_STEPS.indexOf(step) >= AFTER_REVEAL;
  const lines = [
    "Course Navigator: where the Learner is now.",
    `Topic: ${topic.title} (${topic.stage} Stage).`,
    `Teaching Step: ${step}${check ? ` (Check ${topic.checks.indexOf(check) + 1} of ${topic.checks.length}: ${check.id})` : ""}.`,
  ];
  if (place.unmetPrerequisites.length) lines.push(`Prerequisites not yet passed: ${place.unmetPrerequisites.join(", ")}.`);
  for (const c of topic.cases) {
    lines.push("", `Case: ${c.title}, as of ${c.asOf}.`, `Story (only what was known on ${c.asOf}): ${c.story.trim()}`);
    if (revealed) lines.push(`Reveal (what happened): ${c.reveal.trim()}`);
  }
  if (step === "concept" || step === "your_turn") lines.push("", `Concept: ${topic.concept.trim()}`);
  // A Check's prompt and pass criteria go to the Tutor only while that Check is current.
  if (check && step === "check") {
    if (check.kind === "conversation") {
      lines.push("", `Check prompt: ${check.prompt.trim()}`, `Pass criteria: ${check.passCriteria.trim()}`);
    } else lines.push("", `Check: quiz ${check.id}, marked by code.`);
  }
  if (step === "principle") lines.push("", `Principle: ${topic.principle.trim()}`);
  lines.push(
    "",
    step !== "check"
      ? `When this Teaching Step is done, call finish_teaching_step with step "${step}".`
      : check?.kind === "conversation"
        ? `Put the Check prompt to the Learner and question their reasoning. When you can judge it against the pass criteria, call record_check_verdict with check_id "${check.id}", verdict "pass" or "not_yet", and your reasons. Never tell the Learner they passed unless code says a pass was recorded.`
        : "Code records the Check result; you cannot finish this step yourself. Never tell the Learner they passed unless code says a pass was recorded.",
  );
  if (!revealed) lines.push("Do not reveal or hint at the Case's outcome before the reveal step.");
  return lines.join("\n");
}

/**
 * The context for a Learner who is still at a Check after a turn that recorded
 * no verdict: a note first, then the usual context, so it still ends the same.
 */
export function noVerdictContext(place: Place & { check: NonNullable<Place["check"]> }): string {
  return `No verdict was recorded for Check ${place.check.id} in the last turn, so the Learner is still at this Check.\n${stepContext(place)}`;
}
