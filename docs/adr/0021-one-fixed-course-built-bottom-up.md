# One fixed Course, built bottom-up, in a locked order; every term is taught before it is used

Status: accepted, 2026-11-19 (owner grilling session). Supersedes ADR 0004 (the Spine, Electives, Primers, "valuation first", prerequisites as hints) and the Spine length in ADR 0020. Spec: `docs/specs/linear-course-spec.md`.

## Context

The owner walked the first Spine Topic and met "operating margin" with no teaching. The audit of all 113 Topics (2026-11-19) found:

- Topic 1 shows the whole machine before any part is taught: all four Levers, the far-future bar, the share bridge and failure. Margin is taught at Topic 6, failure at 12, multiples at 14, and "revenue" never.
- About half of all terms are used before they are taught.
- The order runs backwards in places: cash comes before the statements, and the Levers come in the order 3, 1, 2, 4.
- Amazon 2000 is the Case in 8 of 18 Topics, and later Topics re-run earlier ones.
- 95 Topics sit off the Spine. The default path appended 23 Follow, Judge and Analyse Topics, built on named writers.

ADR 0004's "valuation first" bet was that showing the whole picture first motivates a beginner. In practice it reads like binge-scrolling: a stream of words with nothing underneath them. The owner wants a fixed set of Lessons that a general audience climbs one step at a time. By the end, a Learner can value any company.

## Decision

- **One fixed Course.** About 75 Lessons in about 11 Units, in one order. There are no Electives, Primers, or Follow, Judge or Analyse stages. Topic files not in the Course leave the Course Map; git keeps them.
- **Bottom-up from zero.** Lesson 1 assumes nothing: what a business is, what owning a piece means, price against worth. Each Lesson adds one idea on top of the one before.
- **Locked order.** A Lesson opens when the one before it is passed. Skip ahead ("I know this: test me") stays, so a Learner who knows a Lesson passes it with one quiz.
- **Every term is taught before it is used.** Each Term is taught in exactly one Lesson: plain idea first, then its real name. No earlier Lesson, and no Tutor reply, uses it. After that Lesson the idea has one name. The course check fails on any Term used early.
- **Soft term budget.** About three new Terms per Lesson on average, four or five when the flow needs it. The course check reports the load; it does not fail on it.
- **Done means any company.** The Course ends when a Learner can value every kind of company: mature, fast-growing, young and loss-making, cyclical, banks and insurers, companies in emerging markets, and companies near failure. The Learner finds every input in an annual report and can explain every line. The valuation engine does the arithmetic (ADR 0010).
- **Words.** The screen and the docs say Lesson and Unit. Code identifiers (`topic`, `spine`) are renamed later.

## Consequences

- The 18 Spine Topics and 95 other Topics are rewritten, merged or retired. Their best explanations are mined first, with names stripped.
- There are no users, so all progress is reset; nothing is migrated.
- The Spine shape rules go: `spine-check.ts`, `SPINE_LENGTH`, `SPINE_LIVE_WITH`, the Course Map sections and the Primer links.
- A course-wide term registry and its check are new code.
- The Tutor must also follow the term rule (ADR 0006's reply check gains a taught-terms list).
- A Learner who wants bonds or derivatives for their own sake finds them only where valuation uses them.

## Alternatives considered

- **Keep valuation first and patch Topic 1:** the smallest change, but every Topic uses words from later ones, so the patching never ends.
- **Keep Electives beside a linear core:** more choice, but the owner wants one fixed set, and Electives were where the core's missing basics hid.
- **A hard cap of three new Terms:** easy to check, but it breaks the flow of Lessons that need one more word. The owner chose an average.
- **Prerequisites as hints, not locks (ADR 0004):** respects the Learner who knows a Lesson, but each Lesson now builds on the last. Skip ahead serves that Learner instead.
