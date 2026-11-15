# The Topic file holds the teaching; code holds the sequence and marks every answer

Status: accepted, 2026-11-14. Ticket: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?, start fresh: one new ADR for each decision the code still follows). Rewritten from archived ADRs 0006 and 0001.

## Context

When the Tutor invented each lesson turn by turn, it re-explained every miss in 200 to 300 words with a new analogy, never drilled the Skill the Learner kept missing, and stated the Insight before the Learner had tried. Prompt-only rules about pacing and order were ignored in live runs (the Percent Session of 4 November 2026). The owner's standing rule is that code decides sequencing.

## Decision

- Each Topic's file holds its teaching: the Skills its Checks test, Concept cards, Quick tries, Known mistakes with a one-line fix each, one Running example, and the Insight with its two hints.
- Code walks the Teaching Steps in order: story, concept, explore, your turn, check, reveal, principle (`TEACHING_STEPS` in `src/course/navigator.ts`).
- Code marks every tap with no model call, shows a Known mistake's fix the moment it is tapped, keeps each Skill's history, and ends Your turn once each Skill has two right in a row.
- At the explore step code counts the Learner's not-yet attempts and releases hint one, hint two, then the Insight. The Insight sentence reaches the Tutor only in that tool result.
- Code picks the Reply kind (feedback, rule, worked example, Quick try, re-teach, hint, own question, offer to park) and the next method on a fixed ladder after two misses in a row.
- The Tutor only words the reply. It never writes its own version of a card and never marks a question it asked itself.

## Consequences

- A teaching gap is a content bug the course check catches (a Check that tests a Skill no earlier card teaches fails), not a prompt to tune.
- Every Topic that follows this shape needs Skills, cards, Quick tries and Known mistakes written ahead. Topics not yet converted keep their concept text, on lint lists that can only shrink.
- Progress rows store each Teaching Step, so dropping or adding a step needs a data migration.
- New stored state: one Skill-state row per Learner, Topic and Skill, and a log of every practice answer.
- A Topic takes one or two more turns because of the explore step.

## Alternatives considered

- **The Tutor teaches freely from concept text:** nothing to write ahead, but nothing marks practice or remembers which Skill was missed, which is what produced the Percent Session.
- **A lesson table in the database:** editable without a deploy, but the course check runs in CI with no database, and a Topic would live in two places.
- **Discovery led by the Tutor inside the concept step:** fewer turns, but nothing stops the Tutor from stating the Insight first.
- **A structured reply where the Tutor returns its chosen move and marks the answer:** code could read the choice, but marking and sequencing would still rest on the model.
