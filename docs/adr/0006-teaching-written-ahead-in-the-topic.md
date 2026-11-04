# The Topic's file holds the teaching: code shows it, marks it and picks the Reply kind; the Tutor words the reply

Status: accepted, 2026-11-04 (spec #229, "Teach simply"). Amends ADR 0003 and ADR 0005: at a converted Concept step, code opens the card's Widget, already set, instead of the Tutor choosing one.

The Tutor stops inventing a lesson in every turn. For each Check, a converted Topic's file now holds the teaching: the Skills the Check tests (each with its rule and at most one analogy), one Concept card (at most five plain lines, one worked example and one line to write down), Quick tries (fixed, or made by code from a question template), and Known mistakes with a one-line fix each, all built around the Topic's one Running example. Code shows the card at the concept step and opens its Widget preset. Code marks every Quick try and typed Check answer with no model call, and shows a Known mistake's fix the moment the Learner gives it. It keeps each Skill's history (tries, misses in a row, the methods already used, any park), finishes Your turn once each Skill has two right answers in a row, and picks the Reply kind: feedback, rule, worked example, Quick try, re-teach, hint, an answer to the Learner's own question, or an offer to park. Two misses in a row bring the next unused method on one fixed ladder (restate, worked example, fill-in boxes, Widget, drill of five, park), and three bring the offer to park. The Tutor then words the reply in a few plain sentences with one ask, and never writes its own version of a card, except in a Go deeper reply.

We chose this because of the Percent Session of 4 November 2026 (spec #229): the Tutor re-explained every miss in 200 to 300 words with a new analogy and homework, one Check took five attempts, six of the ten wrong answers were one Skill that was never drilled, and the Learner's predictable wrong answers (6 for 60) were never used. The owner's standing rule is that code decides sequencing, as in ADR 0001, because prompt-only rules were ignored in live runs.

## Considered Options

- The Tutor teaches freely from the Topic's concept text (today): no content to write, but it is what produced the Session. Nothing marks practice, nothing remembers which Skill was missed, and each miss gets a fresh explanation in a new way.
- A separate lesson table in the database: editable without a deploy, but the course check cannot see it in CI, which runs with no database (the Question Bank has the same problem today), and a Topic would be split across two places.
- A JSON reply format, with the Tutor returning its chosen move, question and answer as fields: code could read the Tutor's choice, but the API refuses structured output alongside Citations, and marking and sequencing would still be left to the model.

## Consequences

- Every converted Topic needs Skills, cards, Quick tries and Known mistakes. For the whole course that is about 194 cards and over a thousand Quick tries, so only Percent and Growth, compounding and logs are converted now; a later spec converts the rest.
- Two kinds of Topic live side by side. A Topic with no Skills in its file keeps today's concept text, taught by the Tutor one idea per reply under the same word caps. The new lints run through a list of not-yet-converted Topics that can only shrink, as ADR 0002's list does.
- A teaching gap becomes a content bug the course check catches (a Check testing a Skill no earlier card teaches fails), rather than a prompt to tune.
- The Tutor no longer ends Your turn: code does, from Skill state. A conversation Check opens only after its Your turn is done, so "why" questions come after fluency.
- New stored state: one Skill-state row per Learner, Topic and Skill, and a log of every practice answer. Known-mistake hits are kept with the answers, not as misconceptions, and each distinct one is listed once on the Topic Note.
- A Parked Skill holds the Topic at its step; it is neither a Review nor a Due Check and never lets the Learner past a Check.
- The Tutor never marks a question it asked itself; a "quiz me" ask goes to the next Quick try.
- Cards, Quick tries and fix lines say short sums in words, and the typed-formula detector scans them (ADR 0002).
- A Topic file can mark a restructure as content-only, so passed Topics stay passed with no Due Check and Learners keep their step.
