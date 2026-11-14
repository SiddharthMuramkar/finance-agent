import type { E2eScriptName } from "./e2e-tutor";

/**
 * The Beginner persona's 10-turn transcript, played in the browser test bed with the scripted Tutor (e2e/beginner-persona.spec.ts).
 * Owner decision, 11 Nov 2026 (#531): the Beginner persona gate (spec 2026-11-05, §6.2 "Persona scores") is scored on these
 * scripted transcripts, which cost nothing to run, not on a 20-prompt live eval. So each turn plays its own script, written for
 * what the persona asks on that turn: a script played twice would repeat the same words to a Learner who asked something else.
 * Types only, so the Playwright spec can import it without loading the app.
 */

/** How a turn reaches the Tutor: the seed's own turn, a message typed in the box, or a Choice tapped (its words are the label). */
export type PersonaTurn = {
  how: "seed" | "typed" | "tapped";
  learner: string;
  script: E2eScriptName;
  /** A phrase the script's reply must carry, which shows it answers what the persona asked. */
  answers: string;
};

/**
 * The Concept step's Choice that asks for the meaning of the word just used. Since G6 it names that word ("What does
 * 'basis point' mean?"), so the persona taps it by its shape (WORD_CHOICE_LABEL); WORD_CHOICE is how the transcript names it.
 */
export const WORD_CHOICE = "What does that word mean?";
export const WORD_CHOICE_LABEL = /^What does '[^'\n]+' mean\?$/;

/** The seed `concept-widget` plays turn 1 itself (src/app/api/dev-e2e/route.ts); turns 2 to 10 are played by the spec. */
export const PERSONA_TURNS: PersonaTurn[] = [
  { how: "seed", learner: "What is a basis point?", script: "concept-reply-widget", answers: "one hundredth of a point" },
  { how: "tapped", learner: WORD_CHOICE, script: "plain-reply", answers: "one hundredth of a percentage point" },
  { how: "typed", learner: "ok show me another one", script: "stage-reply-2", answers: "deposit rate" },
  { how: "typed", learner: "wait so is 1% the same as 100 of those?", script: "persona-one-hundred", answers: "One percentage point is 100 basis points" },
  { how: "typed", learner: "what if the rate goes down", script: "stage-reply-3", answers: "falls from 9% to 8.75%" },
  { how: "typed", learner: "why does anyone care about such tiny moves", script: "persona-why-tiny", answers: "tiny move lands on a huge pile of money" },
  { how: "typed", learner: "smaller one pls", script: "stage-reply-4", answers: "10 basis points" },
  { how: "typed", learner: "my dad said the bank cut by 25 bps, what does that mean", script: "persona-bank-cut", answers: "lowered its rate by a quarter of a percentage point" },
  { how: "tapped", learner: WORD_CHOICE, script: "persona-bps-short", answers: "Bps is just the short way to write basis points" },
  { how: "typed", learner: "ok got it, one more example", script: "persona-one-more", answers: "150 basis points" },
];
