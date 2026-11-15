# A reply changes the Widget only when a better one fits, and every reply ends with two or three Choices

Status: accepted, 2026-11-14. Ticket: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?, start fresh: one new ADR for each decision the code still follows). Rewritten from archived ADRs 0010 and 0019, and the Choices part of archived ADR 0014 (flat, icon-only Widgets).

## Context

The owner wants a Tutor that leads, with interactive pictures beside the talk (5 November 2026). An earlier rule gave every reply its own Widget, with code adding a Companion Widget when the Tutor opened none. In the Session audited on 11 November 2026, a question about valuing a company got an unrelated savings-account scene; three replies added three tabs, the panel held five with clipped names, and the Widget the Learner was using was pushed aside each time. Bare replies also left the Learner with nothing to tap but the message box.

## Decision

- A Widget stays beside the conversation. A reply changes it only when a better one fits.
- A step-led reply shows the step's own Widget (the Concept card's preset, the step's scene, or the Topic's Workbench Widget). If the step has none, the Widget already showing stays.
- An own-question reply (ADR 0006) changes the Widget only when the Tutor opens one.
- A Lingo card for a Topic term is the only Companion Widget, because it answers "what does that word mean?" (`src/tutor/companion.ts`).
- The panel lists at most six Widgets (`MAX_TABS` in `src/app/widget-tabs.ts`). The seventh replaces the oldest that is neither written ahead nor showing.
- Every checked reply ends with two or three Choices: tap-to-answer buttons, words only, no icons or emoji. Code picks them from a fixed set for the Teaching Step (`choicesFor` in `src/tutor/choices.ts`). The Tutor may suggest one, which code checks and may drop. Typing stays open.

## Consequences

- A reply with no Widget is not a fault; V4 reads "a valid Widget, at most one per reply".
- A Topic with no step Widgets shows fewer pictures. That is the intent: no picture is better than an unrelated one.
- Replacing a tab deletes nothing: the Widget's saved state stays under its key.
- Each reply's Choices are stored with it. A press is sent by its index, and the server posts the stored words as the Learner's message.
- After a failed retry the fallback can drop its asking line, because the Choices carry the next move.

## Alternatives considered

- **A Widget with every reply:** the panel is never bare, but filler pictures replace the Widget in use and crowd the panel.
- **No Companion Widget at all:** simpler, but "What does that word mean?" is best answered by that word's Lingo card.
- **An unlimited panel that scrolls:** nothing leaves, but tabs clip and the Learner cannot find the Widget they want.
- **Drop the oldest tab, whatever it is:** keeps the cap, but can remove a written-ahead Widget or the one on screen.
- **Choices written by the Tutor in its text:** they cannot be checked, would break V2's one-ask rule, and would vanish on a fallback.
