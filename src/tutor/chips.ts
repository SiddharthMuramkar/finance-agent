/**
 * The words the chips under the latest Tutor reply post as the Learner's own message. Shared by the Study
 * Workspace (which draws and sends them) and the Tutor Turn (which records the turn kind as chip and never
 * counts these words as an Insight attempt). No imports, so the browser bundle can use it.
 */

/** Posted by the Just tell me chip at an unsettled Explore: it only ever asks to be told the Insight. */
export const JUST_TELL_ME = "Just tell me.";

/** Posted by the Go deeper Choice: the Learner asks for one more layer, since the first explanation is the simple one. */
export const GO_DEEPER = "Go deeper.";

/**
 * The words code's Choices post (choices.ts, D3a), Go deeper's among them. The Choices replaced the two help chips
 * beside Next; a Tutor's suggested Choice posts its own label and is told apart from typing by the stored Choices.
 */
export const CHOICE_MESSAGES = ["What happened next?", "Show me.", "What does that word mean?", "How does this touch my life?", "Quiz me.", GO_DEEPER] as const;

/**
 * Words old chips posted, which no chip sends now. Old Sessions still hold them, so their turns still read as chip
 * turns: Retry re-runs them as chips, and they never count as an Insight attempt.
 */
export const OLD_CHIP_MESSAGES = ["Explain that more simply.", "Show me in a widget."] as const;

/** Every chip's exact words, old ones included. */
export const CHIP_MESSAGES: readonly string[] = [JUST_TELL_ME, ...CHOICE_MESSAGES, ...OLD_CHIP_MESSAGES];

/** Whether a Learner message is exactly a chip's words (a chip press, or the same words typed). */
export const isChipMessage = (text: string) => CHIP_MESSAGES.includes(text.trim());
