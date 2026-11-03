# Named formulas appear only as Formula Cards from a tested registry

Every named formula (present value, WACC, DuPont and the rest) is shown as a Formula Card, in Tutor replies, quiz and Question Bank explanations and Topic Notes, never as typed symbols such as "(1 + r)^n". Each card comes from a formula registry whose entries point at the tested calculators, so each symbol's plain-word name and every result come from code. One-step sums are written as worded steps instead. A shared raw-formula detector fails `npm run check` on any converted Topic that still types a formula, with a shrinking list of Topics not yet converted.

## Considered Options

- A math renderer (such as KaTeX) for typed formulas: cheap, but the model would still type the numbers, and nothing would be playable.
- A card for every one-step sum: about 25 to 30 more calculators for little teaching gain.

## Consequences

- A Topic cannot teach a formula until the registry has it, so a new formula needs a tested calculator first.
- The Tutor may describe any other formula only in words.
