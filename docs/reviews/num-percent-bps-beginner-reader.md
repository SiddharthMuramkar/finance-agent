# Beginner-reader review: Percent, percentage points and basis points (ticket #248)

A fresh-context beginner read the Topic's cards on `tutor-R7a` and tried every Quick try. Verdict, card by card.

| Card (Check) | Verdict | What the reader said | What changed |
|---|---|---|---|
| One move, two ways (`pb-quiz-language`) | pass | "Same distance, in small units" is loose, and "bp" is never named as short for basis points. Two falls had an unclear sign. The template said "A bond yield", a word no card explains. | Line 3 now reads "Basis points (bp for short) ... the same move, in units 100 times smaller". A line goes from bp back to points (250 bp is 2.5 points), and line 2 says a fall is the same gap. The two fall Quick tries ask for "the size of the fall" (either sign is accepted). The template now says "A rate rises by {bp} basis points". |
| Compared with the start (`pb-quiz-change`) | fail | "Divide by the old 4%" read as dividing by 0.04; "Up 1% is unclear" was unexplained; two ideas (percent change and wording); the word "base" never appeared. | Split. The card now teaches percent change only: the move is 1 point, that start is the base, 1 divided by 4 is 0.25, times 100 is 25%. Wording moved to a new Check. Wording questions left this Check. |
| Say which size you mean (`pb-quiz-wording`, new) | new | The wording lesson needed its own card. | New Check 3 with its own card, the three wording Quick tries, and three questions (one new). "Up 1% could mean 1 point, or 1% of the old rate, so say points or bp"; "rose 25%" always means a share of the old rate. |
| Say it so nobody misreads it (`pb-fed-language`) | fail | "Can mean either" never named the two meanings. | The lines now say up 25% needs the start named, and "up 1%" cannot tell 1 point from 1% of the old rate. |

Every Check id is kept; the new Check sits between, and `restructure: content-only` still holds, so no Learner gets a
Due Check. Result: all cards pass after the second pass.
