# Named formulas appear only as Formula Cards from a tested registry

Status: accepted, 2026-11-14; amended 2026-11-16 by spec #68 (Go deeper may hold a typed formula; the not-yet-converted list is gone; the detector also catches formulas built from words or letters). Ticket: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?, start fresh: one new ADR for each decision the code still follows). Rewritten from archived ADR 0002.

## Context

A typed formula such as "(1 + r)^n" scares a beginner, and when the model types it, it also types the numbers, which can be wrong. A formula a Learner can play with teaches more than one they read.

## Decision

- Every named formula (present value, WACC, DuPont and the rest) shows as a Formula Card, in Tutor replies, quiz explanations and Topic Notes. It never shows as typed symbols, except in Go deeper (below).
- Each card comes from a formula registry (`src/finance/formulas.ts`). Each entry names its symbols in plain words and points at a tested calculator, so every result comes from code.
- A one-step sum is written as worded steps, not as a card.
- A typed formula may sit only in a Topic's Go deeper material, which the Learner sees only on pressing Go deeper and the Tutor is given to say when pressed (spec [#68](https://github.com/SiddharthMuramkar/finance-agent/issues/68)).
- A raw-formula detector (`src/finance/raw-formula.ts`, run by `src/course/formula-check.ts`) fails `npm run check` on any Topic that types a formula anywhere but Go deeper. It finds symbols and arithmetic ("=", "^", "(1 + r)", "1,100 / 1.10") and formulas built from words or letters with spaced operators ("riskfree rate + beta x premium", "S x u", "(X - M)"). There is no list of Topics let off: since ticket [#100](https://github.com/SiddharthMuramkar/finance-agent/issues/100) removed the not-yet-converted list, every Topic passes the check, whether or not it is yet a Converted Topic (GLOSSARY) in its other teaching fields.

## Consequences

- A Topic cannot teach a formula until the registry has it, so a new formula needs a tested calculator first.
- The Tutor may describe any other formula only in words.
- Concept cards, Quick tries and fix lines write short sums in words, and the detector scans them too.

## Alternatives considered

- **A math renderer such as KaTeX:** cheap, but the model would still type the numbers, and nothing would be playable.
- **A card for every one-step sum:** about 25 to 30 more calculators for little teaching gain.
