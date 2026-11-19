# The Learner builds two Anchor valuations along the Course, one Shortcut at a time

Status: accepted, 2026-11-19 (owner grilling session). Supersedes the parts of ADR 0020 that keep the Learner to judging Stories on the path and give every Spine Topic its own Case. The Own Case Assignment and "dated, never live" from ADR 0020 hold. Spec: `docs/specs/linear-course-spec.md`.

## Context

The owner wants each Lesson to build on the one before it, so that understanding Lesson n−1 is what makes Lesson n possible and exciting. Today each Topic jumps to a new Case (Amazon 2000 in 8 of 18, then Uber, Tesla, WeWork…). Nothing a Learner works out carries forward. The owner also wants a growing company set against a stagnant one, and emerging markets and the rupee taught inside valuation, not beside it.

## Decision

- **Two Anchor companies** run through the core of the Course: Coca-Cola (dollars; mature, slow growth, high margin, little reinvestment, low risk) and DMart, Avenue Supermarts (rupees; fast growth, thin margin, heavy reinvestment, India's country risk). Both stand as of mid-2019 (ADR 0013). Every core Lesson shows its idea on both.
- **The Valuation sheet.** Each Anchor company has a Valuation sheet that fills in one line per Lesson. Each Lesson opens on the previous Lesson's result, pays off with a new line, and ends on a Teaser the next Lesson answers. Each Unit ends on a Can-do line.
- **The Shortcut ladder.** A rough value of both companies comes at about Lesson 20, built on named Shortcuts:
  - profit counts as cash
  - the rate is a guess
  - growth is flat
  - the business counts as the shares
  - the company survives

  Each later Unit removes one Shortcut, and both values move. After the last Shortcut goes, the Reveal shows what happened to both companies.
- **Guided, by tap.** In the core the Learner picks each Anchor input from tapped choices, with feedback. This is practice with a guide, not the Learner's own Story. Judging other people's Stories is its own Unit after the core. The Learner's own company comes last, as an Own Case Assignment (ADR 0020).
- **Other companies** appear for practice and in the company-types Unit: a bank, a young company, a cyclical company, one near failure, and others.
- **No streaks, points or badges.** The pull to the next Lesson comes from understanding and the growing sheet.

## Consequences

- Both companies need checked Case Data at their As-of dates, and a checked "what happened next" for the Reveal.
- A Valuation sheet per Learner per Anchor company is new stored state. The engine gains a rough-value mode, a growing perpetuity on profit at a guessed rate, and swaps in each real piece as its Unit is passed.
- The As-of rule holds for the whole core: nothing after mid-2019 reaches the Learner until the Reveal.
- ADR 0020's fear, a beginner trusting their own Story too early, is met by guided taps in the core and by the Stories Unit before the Own Case.

## Alternatives considered

- **A new Case each Lesson (today):** variety, but nothing carries forward, and Amazon crowded out everything else.
- **One Anchor company:** simpler, but no contrast. Growth against stagnation, and dollars against rupees, are how the owner wants the Levers taught.
- **Two dollar companies, with the rupee only in a currency Lesson:** less to explain early, but currency and country risk would arrive as a bolt-on.
- **Judge-only until the end (ADR 0020):** safe, but the Learner never sees a valuation grow under their own hands.
