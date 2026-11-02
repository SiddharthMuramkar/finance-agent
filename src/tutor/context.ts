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
  if (check && (step === "your_turn" || step === "check")) {
    lines.push("", `Coming Check: ${check.kind === "conversation" ? check.prompt.trim() : `quiz ${check.id}`}`);
  }
  if (check && step === "check" && check.kind === "conversation") lines.push(`Pass criteria: ${check.passCriteria.trim()}`);
  if (step === "principle") lines.push("", `Principle: ${topic.principle.trim()}`);
  lines.push(
    "",
    step === "check"
      ? "Code records the Check result; you cannot finish this step yourself. Never tell the Learner they passed unless code says a pass was recorded."
      : `When this Teaching Step is done, call finish_teaching_step with step "${step}".`,
  );
  if (!revealed) lines.push("Do not reveal or hint at the Case's outcome before the reveal step.");
  return lines.join("\n");
}
