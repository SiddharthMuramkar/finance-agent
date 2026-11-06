# Code checks every Tutor reply before the Learner sees it

Status: accepted, 2026-11-04 (spec #229, "Teach simply"). Amended by ADR 0009 (new check V8: no question or ask that has the Learner work out a sum) and ADR 0010 (V4: every reply shows exactly one Widget, code adding a companion when the Tutor opens none).

The turn holds the Tutor's whole reply, across every loop step, until code has checked it. The checks are:

- V1: the words are within the cap for the step and Reply kind: 80 at Concept, Your turn and Check; 120 for a worked example, a Go deeper reply, and the Story, Explore, Reveal and Principle steps.
- V2: at most one question, and one ask of 25 words or fewer as the reply's last line, with no other task lines.
- V3: no banned phrases, emoji or decorative arrows, and at most one bold span.
- V4: a valid Widget, at most one per reply.
- V5: no open quiz answer together with that question's numbers, and no Widget preset that uses the open attempt's numbers.
- V6: no app words (step names, ids, tool names, "Code" as the subject of a sentence).
- V7: the right currency.

Code fixes some breaks itself at no cost: it strips emoji and arrows, flattens headings and keeps only the first bold span. Too many words, a second question or task line, an open-answer leak, app words and the wrong currency each cost one retry, which is told exactly what failed ("Your reply was 142 words. The limit is 80. Keep one idea and one ask."), and which runs only if the turn has used under 30 seconds. If the retry fails too, or time is up, code shows a fallback: at a step with a Concept card, the card's write-down line and the next Quick try; elsewhere, the retry cut at its last full sentence within the cap, keeping the ask. The fallback's text goes into the history as a code note, so the next turn knows what the Learner saw. Reply text no longer streams word by word: the Learner sees the typing indicator and its progress labels, then the whole reply. Failed drafts and their correction messages are recorded with their reasons and left out of later requests, the way refused turns are. Stop drops the held reply, and the Learner's message stays, marked Stopped.

We chose this because in the Percent Session of 4 November 2026 (spec #229) replies broke rules the instructions already held: 200 to 300 words where the limit was 120, many asks in one reply, headings, bold everywhere, "➜", "Code recorded a pass on Check 1", and a dollar sign in a rupee Topic. Prompt rules alone did not hold, and a streamed reply cannot be taken back once the Learner has read it.

## Considered Options

- Stream, then replace: the first words appear at once, but the Learner reads a reply that breaks the rules and then watches it vanish, and a Stop part-way would leave an unchecked fragment on screen.
- Prompt rules only: no wait and no extra request, but the rules were already in the instructions and were broken, and the behaviour grader can only report long replies after the fact.
- Structured JSON output (the message, ask and Widget as fields): each part would be easy to check, but the API refuses structured output alongside Citations, which the Tutor must keep, and forcing a tool call is refused on Opus 5.5. So the reply stays text: the ask is its last line, a Widget comes through open_widget or show_widget, and a saved rule comes through the own-rule tool.

## Consequences

- The Learner waits for the whole reply, so the first words appear later than today; the typing indicator and progress labels still stream.
- Some turns cost a second model request. Each reply's word count, failed checks, retry and fallback are recorded and shown in the usage report.
- A draft is stored with its check result, so a resumed or reloaded turn shows only a reply that passed or the fallback, never an unchecked draft.
- Stop no longer keeps a partial reply (the glossary's Stop entry changes to match).
- The cap, the currency and the open quiz's blocked numbers reach the Tutor per turn from code, so the frozen instructions stay shared across Sessions.
- Sentence length and praise are not checked before a reply shows; the live-model tests grade them.
- The live tests (T1 to T11, three runs each) check the same rules against the real model on pull requests that change the Tutor's instructions or a Topic file.
