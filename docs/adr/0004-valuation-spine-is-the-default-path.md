# A valuation Spine of fifteen Topics is the default path; the other Topics are Electives met through Primers

Status: accepted, 2026-11-15. Ticket: [#4 Restore design docs from the archive?](https://github.com/SiddharthMuramkar/finance-agent/issues/4). Rewritten from archive ADR 0020.

## Context

The Course Map held 95 Topics in textbook order. A new Learner started on percentage points and log returns. Discounted cash flow was Topic 49, behind 24 prerequisites, and the four levers of a valuation appeared only in Topic 75. A Learner met valuation late and thin, if at all. Converting every Topic to the written-ahead shape (ADR 0001) would cost about 194 Concept cards and over a thousand Quick tries before the path led anywhere new. The owner decided on 12 November 2026: valuation first.

## Decision

- **The Spine.** Fifteen Spine Topics in a fixed order (`SPINE_LENGTH` in `src/course/outline.ts`) lead every new Learner. The first asks what a business is worth, on Damodaran's valuation of Amazon in February 2000. Each Topic after it makes the Learner better at one lever. The last has them value a company of their choice as of a past date.
- **Electives.** Every other Foundation Topic stays on the Course Map as an Elective. It can be opened at any time and keeps its Checks and Reviews, but is never "next" unless the Learner chose it. Prerequisites stay hints, not locks.
- **Primers.** A Primer is a two-minute stop inside a Spine Topic that teaches one idea from an Elective: at most three lines, one Lingo term, one Quick try, and a link to the Elective. The Learner can press "I know this" to pass over it.
- **Skip ahead.** "I know this: quiz me" opens one mixed quiz with one question per Skill. Missing no more than one passes the whole Topic and schedules its questions as Reviews. One attempt per Topic per day.
- The course check enforces each Spine Topic's shape: one Case with an as-of date, one Workbench Widget, one Insight, judgement Checks (ADR 0002), at most two Primers, and 15 minutes or less.

## Considered Options

- **Reorder the 95 Topics so discounted cash flow comes sooner:** one list stays, but the Topic still rests on 24 prerequisites and one paragraph.
- **Convert all 95 Topics first:** a large writing cost, most of it on Topics valuation never uses.
- **Delete or hide the Foundation Topics:** a shorter map, but Learners would lose passes, and a Learner who wants bonds or currencies would have nowhere to go.
- **Lock Topics behind their prerequisites:** a firm order, but it fences in the Learner who already knows a Topic. Skip ahead serves that Learner instead.

## Consequences

- Fifteen Spine Topics to write and pass through the course check and the critics before each ships. Until a Spine Topic exists, the default path skips it.
- Nothing a Learner has is lost: every pass, Session, Topic Note and Review stays.
- Passing an Elective does not pass the Spine Topic built from it, but skip ahead is offered.
- Skip ahead is a second way to pass a Topic. Its questions return as Reviews, so a lucky pass still comes back before it is forgotten.
