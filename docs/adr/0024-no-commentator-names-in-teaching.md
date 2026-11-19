# Learners never see a commentator's name in teaching; credit sits only in source lines

Status: accepted, 2026-11-19 (owner grilling session). Extends the Signal spec's rule for the site ("Published valuations are 'one published valuation'; their authors are named only in source lines and the About credit") to every Lesson, Widget and Tutor reply. Spec: `docs/specs/linear-course-spec.md`.

## Context

The Course follows one well-known valuation method, and many Cases come from its author's published valuations. The audit (2026-11-19) counted his name about 250 times across Topic files: Case titles, story text, card lines, Widget chips, 10 Follow and Judge titles, and Tutor instructions. Another writer's name appears 43 times. The owner: these people are not known to a general audience, and their names make the teaching clunky.

## Decision

- No commentator, analyst or writer is named anywhere a Learner reads while learning: Lesson text, titles, Widget labels, Notebook pages or Tutor replies.
- A published valuation is "an analyst's valuation" or "a published valuation".
- The method is taught as the method, never as someone's.
- Credit stays where honesty and licences need it: fine-print source lines, the Passage page and the About credit. A Citation in a reply links to the Passage; the reply text itself names nobody.
- Company names, and people who are part of a Moment (a founder announcing a result), are not commentators and may appear.
- The course check fails on a listed commentator's name in any learner-visible field. The Tutor's reply check does the same.

## Consequences

- Every Follow Topic, and most Judge and Analyse Topics, leave the Course: their premise is a named writer.
- Case titles, Widget chips (`caseStory`), site copy, Example pages and Tutor instructions are reworded.
- A Learner who wants to read further finds the author through the source line, not the Lesson.

## Alternatives considered

- **Name the author once, in Lesson 1:** honest and simple, but it is the clunkiness the owner wants gone.
- **No credit at all:** cleaner, but dishonest, and the Library's licence asks for credit.
