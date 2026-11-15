# Every valuation number comes from one tested valuation engine, including the Signal Levers widget

Status: accepted, 2026-11-14. Tickets: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?) and [#18](https://github.com/SiddharthMuramkar/finance-agent/issues/18) (Levers model source of truth, option C). Written new from the archived ADR 0018, with its Workbench Widgets and where a Case's valuation inputs live. Replaces the Signal spec's prototype levers maths (§6.2.1) and its §6.2.4 acceptance table: the spec will follow the engine.

## Context

When two models make the same number, they drift apart. Then one screen says $3 and another says $1, and the Learner stops trusting both. In November 2026 the app had two Amazon 2000 models. The Signal spec's small model (§6.2.1) used its own tuned inputs (no past losses, $3.15bn of claims, its own growth fade, margin curve and rate glide) and gave $35.09. The valuation engine took Damodaran's own inputs from Case `amazon-dcf-2000` and gave $35.04, 4 cents below his published $35.08 (the gap is rounding in his printed costs of capital). Spec §14 asks the production widget to reproduce the published valuation and say so.

## Decision

- One pure, tested engine turns a Valuation story into a value per share (`src/finance/dcf-engine.ts`, with `applyLevers` in `src/finance/valuation-case.ts`).
- It is the only source of numbers for Workbench Widgets, for computed judgement questions and for the Signal Levers widget.
- The Levers widget runs `applyLevers` on Case `amazon-dcf-2000`. A lever at its opening keeps the Case's own figure, so "his story" is $35.04.
- Each Case's valuation inputs live in git, in a `valuation:` block on its Topic file, every figure with its source, not in the Case Data database. So the golden tests, the course check (CI has no database) and pages with no model call can read them. When a figure is not a price anyone paid, the block may name it with `price.label` (for example "talk"), and Widgets and questions use that word in place of "price".
- A Workbench Widget is the engine's face in the Study Workspace: several Levers feed one headline number. Only a recipe can be a Workbench (ADR 0009), its part stands alone, and it is checked under its own, larger budget (`src/widgets/check.ts`). Its Case figures come from a Topic file; figures the Tutor types make it an Illustration (ADR 0009).
- Golden tests work at two levels:
  - The engine matches Damodaran: $35.04 a share, and each cash flow within 1 of his.
  - The widget rows (presets, band, lever effects) are pinned to the cent from engine output, and the lever effects add up to the full change.

## Consequences

- The Signal widget, the Topic Workbench and the Tutor show the same numbers, and every input has a source.
- Some spec values move: his story 35.09 → 35.04, the Grocer $3 → $1, and the "$84 story" preset gives $85 unless it is set again (59 / 12 / 3 / 11.84 gives $84). A spec PR updates §6.2.4, the band table and §13 QA rows 6, 7, 10 and 11.
- `src/finance/signal/levers.ts` (PR #22) still holds the spec's tuned inputs and gives $35.09. It must move to `applyLevers`, and its rows must be pinned again.
- A change to the engine can move numbers on many screens at once. The golden tests catch this.

## Alternatives considered

- **Ship the spec model as its own module:** matches the spec with no edits, but breaks the one-engine rule and gives the app two Amazon stories.
- **Spec inputs, engine maths:** one engine, and the spec table stays. But the app keeps two input sets for Amazon, and the widget does not reproduce Damodaran's valuation (§14 stays open).
- **Valuation inputs in Case Data:** its reader already guards the as-of date, but CI has no database, so the golden tests and the course check could not see the inputs.
- **Split a valuation across four one-control Widgets:** each stays inside the normal budget, but the Learner never sees the Levers trade off, which is the lesson.
- **The spec model for the beta, the engine after it:** no change before the beta, but Learners see numbers that later change, and the work is done twice.
