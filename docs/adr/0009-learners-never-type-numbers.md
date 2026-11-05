# Learners never type numbers: every question is a tap, about stories and words

Status: accepted, 2026-11-05 (spec "story-first, full-screen, Google sign-in"). Amends ADR 0006 and ADR 0008, and ADR 0007's rate-move practice mode.

The Learner never types a number. Quick tries, quiz Checks, Reviews, the ladder's half-done tries and drills, and Widgets all ask the Learner to tap one of two to four choices, or True or False, and code marks the tap with no model call. A question asks what a word means, what someone in the story did, or which reading is right. It never asks for a sum. Numbers appear only as facts in a story or as choice labels the Learner can recognise: "the RBI cut by 0.25 points: traders call that… 25 bps". Picking the right label may need one lingo step the Topic names, such as points to basis points, and nothing more. Each wrong choice may carry a one-line mix-up fix that shows the moment it is tapped, which makes every wrong choice a possible Known mistake. Question templates still draw fresh numbers for each try, and code now builds the choices from them: the right answer plus each Known mistake's value. The rate-move Widget's practice mode asks the Learner to choose the right reading of a move. Conversation Checks ask the Learner to say an idea in their own words, or which they would pick and why. The Tutor never asks for a sum: a new reply check, V8, finds a question or ask that does, and costs one retry. A new lesson lint rule, L10, fails any typed item or sum-asking stem in a Topic file, with a list of not-yet-rewritten Topics that can only shrink, as ADR 0002's list does.

We chose this because the owner's Learners are young beginners who dislike maths and want the lingo and the ideas, not the arithmetic ("It isn't a CA exam … You're trying to learn these concepts by having fun", 5 Nov 2026). Code can still mark exactly, because a choice is as markable as a typed number.

## Considered Options

- Keep typed numbers and soften the wording: the questions stay exams, which is the owner's complaint.
- Choices with no numbers at all: loses the lingo the owner wants ("what is 25 bps"), and story facts carry numbers anyway.
- Let the model write and mark free-text answers: marking would cost a model call each time and could not be tested exactly (ADR 0006's reason for code marking).

## Consequences

- The Quick try box, the typed quiz question, StepThrough's "Your number", the rate-move answer box and the Slider's exact-value boxes go. Sliders keep their −/+ steppers and quick chips.
- About 68 Topics start on the L10 list. Ten batches rewrite them, and the first 12 path Topics are rewritten with their story scenes.
- The ladder keeps its order and stored ids; "fill-in boxes" becomes a half-done choice, and "a drill of five" becomes a choice drill of five.
- A template must yield at least two distinct choices on every draw; the lesson lint's Draws rule checks it.
- Guessing is easier with choices. A Check still needs its pass rule, and Skill state still needs two right in a row, so one lucky tap passes nothing.
- Glossary: Quick try ("the Learner taps one of two to four choices, or True or False"), Known mistake ("a wrong choice the Topic's file expects, with a one-line mix-up fix"), Question template ("code draws the numbers and builds the choices from the answer and each Known mistake"), Rate-move Widget ("in practice mode the Learner picks the right reading of the move"), Lesson lint (adds L10).
- ADR 0008's list of reply checks gains V8: no question or ask that has the Learner work out a sum.
