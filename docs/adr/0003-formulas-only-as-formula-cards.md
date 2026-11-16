# Named formulas appear only as Formula Cards from a tested registry

Status: accepted, 2026-11-14. Ticket: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?, start fresh: one new ADR for each decision the code still follows). Rewritten from archived ADR 0002.

## Context

A typed formula such as "(1 + r)^n" scares a beginner, and when the model types it, it also types the numbers, which can be wrong. A formula a Learner can play with teaches more than one they read.

## Decision

- Every named formula (present value, WACC, DuPont and the rest) shows as a Formula Card, in Tutor replies, quiz explanations and Topic Notes. It never shows as typed symbols.
- Each card comes from a formula registry (`src/finance/formulas.ts`). Each entry names its symbols in plain words and points at a tested calculator, so every result comes from code.
- A one-step sum is written as worded steps, not as a card.
- A raw-formula detector (`src/finance/raw-formula.ts`) fails `npm run check` on any converted Topic that still types a formula, with a list of not-yet-converted Topics that can only shrink.

## Consequences

- A Topic cannot teach a formula until the registry has it, so a new formula needs a tested calculator first.
- The Tutor may describe any other formula only in words.
- Concept cards, Quick tries and fix lines write short sums in words, and the detector scans them too.

## Alternatives considered

- **A math renderer such as KaTeX:** cheap, but the model would still type the numbers, and nothing would be playable.
- **A card for every one-step sum:** about 25 to 30 more calculators for little teaching gain.
