# Insights are found in an explore Teaching Step that code enforces

Each Topic's Insight is found by the Learner through play in a seventh Teaching Step, explore, which comes once per Topic: after the concept of the Check the Topic names, before that Check's your turn. Code, not the Tutor's instructions, holds the sequence. The Course Navigator refuses to finish explore until an Insight attempt is recorded as found or told. Code counts the Learner's not-yet attempts and releases hint one, hint two, then the Insight itself, or the Insight at once when the Learner asks to be told. The written Insight sentence reaches the Tutor only in that tool result, the way the reveal does. We chose this because the owner's standing rule is that code decides sequencing, and live runs showed prompt-only rules being ignored (the pacing rule exists for the same reason).

## Considered Options

- Discovery led by the Tutor inside the concept step: fewer turns, but nothing stops the Tutor from stating the Insight before the Learner has tried.
- Play before the concept is named: purer discovery, but slower and harder for a Learner taught in the analyst-course style the owner kept.

## Consequences

- A Topic takes one or two more turns.
- Progress rows store "explore" as a step, so dropping the step later needs a data migration that moves those rows on; an older Course Navigator cannot read them.
- Topics without an Insight skip the step, so the course moves over in batches after the present value pilot.
