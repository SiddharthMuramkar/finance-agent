/**
 * The words the chips under the latest Tutor reply post as the Learner's own message. Shared by the Study
 * Workspace (which draws and sends them) and the Tutor Turn (which records the turn kind as chip and never
 * counts these words as an Insight attempt). No imports, so the browser bundle can use it.
 */

/** Posted by the Just tell me chip at an unsettled Explore: it only ever asks to be told the Insight. */
export const JUST_TELL_ME = "Just tell me.";

/** The two help chips, beside Next; they stay while a Check is open. */
export const HELP_CHIPS = ["Explain that more simply.", "Show me in a widget."] as const;

/** Every chip's exact words. */
export const CHIP_MESSAGES: readonly string[] = [JUST_TELL_ME, ...HELP_CHIPS];

/** Whether a Learner message is exactly a chip's words (a chip press, or the same words typed). */
export const isChipMessage = (text: string) => CHIP_MESSAGES.includes(text.trim());
