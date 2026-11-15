# Learners never type numbers: every question is a tap, and Spine Checks test judgement

Status: accepted, 2026-11-15. Ticket: [#4 Restore design docs from the archive?](https://github.com/SiddharthMuramkar/finance-agent/issues/4). Rewritten from archive ADRs 0009 and 0021.

## Context

The owner's Learners are young beginners who dislike maths and want the lingo and the ideas, not the arithmetic ("It isn't a CA exam … You're trying to learn these concepts by having fun", 5 November 2026). Typed answers turned practice into an exam. Once questions became taps, valuation questions drifted to "what is this called?", which tests labels, not the skill a valuation Topic names: seeing which assumptions drive the value.

## Decision

- Every Quick try, Check, Review and Widget question is a tap among 2 to 4 choices, or True or False. Code marks the tap with no model call (ADR 0001).
- A question asks about words and stories: what a word means, what someone in the story did, which reading is right. It never asks for a sum. Numbers appear only as story facts or as choice labels the Learner can recognise.
- Each wrong choice may carry a one-line mix-up fix, which makes it a Known mistake.
- Reply check V8 rejects a Tutor reply whose question or ask needs a sum (ADR 0006). Lesson lint L10 fails any typed item or sum-asking stem in a Topic file.
- Spine Checks are mostly judgement questions: which lever moves the value most, which story the price assumes, which way a fact moves a lever, which story cannot hold, price or value, and predict-then-see.
- For computed kinds, the Topic file lists only the changes or stories. Code works out each value with the valuation engine (ADR 0010), picks the right choice and writes the figure on each choice. The course check fails if a wrong choice lands within 5% of the right one.

## Considered Options

- **Keep typed numbers with softer wording:** the questions stay exams, which is the owner's complaint.
- **Choices with no numbers at all:** loses lingo such as "what is 25 bps", and story facts carry numbers anyway.
- **Free-text answers marked by the model:** each costs a model call and cannot be tested exactly. A conversation Check already lets the Learner tell a Valuation story in their own words.
- **Right answers and figures written into the Topic file by hand:** no engine needed, but the figures drift when a Case input or the engine changes, and a question could disagree with the Widget beside it.

## Consequences

- Guessing is easier with choices, so a Check keeps its pass rule and a Skill still needs two right in a row.
- A question template must yield at least two distinct choices on every draw; lint checks it.
- Changing a Case's valuation input changes the computed answer and the choice figures with no edit to the question. Because the engine is pure and the inputs live in git, the course check runs it in CI with no database.
- Electives keep definition questions until each is converted.
