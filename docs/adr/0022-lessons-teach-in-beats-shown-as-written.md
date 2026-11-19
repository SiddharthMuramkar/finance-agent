# Lessons teach in Beats shown as written; each new sum is worked once by hand

Status: accepted, 2026-11-19 (owner grilling session). Narrows ADR 0001 (the Tutor no longer words the main teaching), ADR 0002 (one tap may ask for the result of a new sum) and ADR 0003 (Formula Cards may sit in a Beat). Spec: `docs/specs/linear-course-spec.md`.

## Context

The audit (2026-11-19) found depth limited by rule, not by effort:

- A Spine Topic has 250 to 350 words of teaching against 750 to 1,300 words of quiz.
- The Spine rules allow one card of at most five lines (`spine-check.ts`).
- The `concept` text is never shown. The Tutor paraphrases it in an 80-word reply.
- Five core sums are never worked anywhere: cost of equity, the cost-of-capital blend, terminal value, expected value and the justified multiple.

The owner wants depth and visual learning, and does not want a "numbers in, automated out" feel.

## Decision

- **Beats.** A Lesson teaches in Beats. Each Beat is a short written explanation, shown exactly as written, then an interactive visual, then a quick tap. There are never more than about three short lines of text between visuals. Beats are written ahead in the Lesson file (ADR 0001 holds).
- **Visual first.** Every idea in a Lesson gets its own visual. The Valuation sheet sits on top of that. Lessons run 15 to 25 minutes; depth sets the length, not a cap.
- **The Tutor's part.** The Tutor gives feedback, answers the Learner's own questions and re-teaches after a miss. It never replaces a Beat's text with its own.
- **Hand first, then the engine.** The first time a Lesson needs a new sum (margin, one year of discounting, a growing perpetuity, a blend of rates), the Learner works it once. The steps are drawn, and the Learner taps the right result from two to four choices. After that Lesson the engine does that sum. This is the one kind of tap that may ask for a sum (narrows ADR 0002). Reply check V8 and lesson lint L10 allow it only in a hand-first Beat.
- **Formulas.** A Formula Card may sit in a Beat (ADR 0003 holds on its form: symbols named in words, results from tested code).
- **Spine shape rules retired.** The rules of one card, six to eight Quick tries, a Case plus Workbench plus Insight in every Topic, and the 15-minute cap give way to a Lesson shape check (spec).

## Consequences

- A new Teaching Step for Beats, built as a proper step type. There is no data to migrate.
- New Widget recipes, about one per idea that has no visual today. They are tested code, chosen by the Lesson file (ADR 0009).
- Writing cost rises: every Lesson needs Beats, visuals and a hand-first sum where one is new.
- ADR 0002's spirit holds: nobody types a number, and no sum is asked twice.

## Alternatives considered

- **Keep one card and let the Tutor expand it:** no new step type, but the Tutor's paraphrase in 80 words is what made Topics thin.
- **Several Checks per Topic as stand-in Beats:** works today off the Spine, but every Beat would drag a Skill, Quick tries and a pass rule behind it.
- **The engine does every sum from the start:** less to write, but the Learner never sees inside the machine, and the owner rejected that feel.
