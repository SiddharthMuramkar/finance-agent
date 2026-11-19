=== COMPACT SUMMARY ===
I could not create /tmp/value-it-audit/report.md: the harness blocks subagents from writing report files. The full report is under the summary, below the line. No repo file was touched.

**Headline findings**
1. **Topic 1 shows everything before teaching anything.** All four levers, a failure lever, a terminal-value bar and a 17-row sheet are on screen before any is taught. Operating margin is a bracket (T/spine-01-worth.yaml:120) and is properly taught only at Topic 6 (spine-05-margins.yaml:38-47). "Revenue" has no card anywhere in the Spine.
2. **The order runs backwards.**
   - Cash comes before the statements, and the levers are taught in the order 3, 1, 2, 4.
   - Failure is used at Topic 3 and taught at 12; the bridge from business value to a share price is used at 1 and taught at 11; multiples are used at 1 and taught at 14.
   - About 338 terms are introduced, and about 155 of them (46%) are not explained where they first appear.
3. **Shallow by rule.**
   - Each Topic has 243-332 words of teaching against 745-1,330 words of testing.
   - The rules allow one 5-line card per Topic (spine-check.ts:61), the concept text is never shown, and the Tutor's reply is capped at 80 words.
   - Five core sums are never worked: cost of equity, the cost-of-capital blend, terminal value, expected value and the justified multiple.
4. **Checks test numbers the learner never saw.** Some are starting values never stated, some appear only in the later reveal (spine-07-risk.yaml:156-179). One set exists only in a YAML comment (spine-11 :173-174) and is tested at :202-204.
5. **Repetition, not progression.**
   - Amazon is the case in 7 of 18 Topics, and Topics 13, 15 and 16 re-run Topics 5, 1 and 6.
   - 13 of 71 term cards repeat an earlier word, and one idea often carries several names.
   - Topics 5 and 6 contradict each other on which lever moves value most.
6. **Names are everywhere.**
   - In the 18 core lesson files: "Damodaran" 125 times in text the learner or Tutor sees, plus "professor" 25 and Gurley 13.
   - In the other lesson files: Damodaran 124, Zitron 43.
   - In the app: Home, About and Example pages, 10 widget defaults, market and Library credits (the licence asks for credit), and 10 Follow/Judge titles.
7. **Coverage gaps.** Missing from the core path: business basics, percent, inflation, bonds, cost of debt, currency and country risk, R&D, banks, cyclicals, valuing a mature company, and the learner building a valuation. 12 essential optional lessons exist only off the core path.
8. **The code allows a redesign.**
   - Teaching in several steps already works off the core path; only the core-path rules forbid it.
   - Nothing checks that a word is taught before it is used.
   - Progress is stored by lesson id, so reusing the 18 ids loses nothing.
   - The engine cannot value banks and has no country-risk input.

**Worst 10 term-order violations** (where first used → where taught)
1. revenue: Topic 1 → never
2. the discounted-cash-flow method as a whole: 1 → never
3. a cost of capital that changes over time: 1 → never
4. market value: 1 → never carded
5. bond and yield: 2 → never
6. tax rate: 3 → never
7. working capital: 3 → never
8. depreciation: 3 → never
9. multiples: 1 → 14
10. chance of failure: 1 → 12

Next worst: the share-price bridge 1 → 11, terminal value 1 → 10, cost of capital 1 → 9, operating margin 1 → 6.

**Draft curriculum** (76 lessons, a draft for your decisions)
- **Unit 1, Business basics:** 1 Money in and out; 2 Price × units; 3 Two kinds of cost; 4 Operating profit; 5 Percent and percentage points; 6 Margin; 7 Owners' vs borrowed money; 8 Lenders paid first; 9 Tax; 10 Shares; 11 Market value; 12 Price ≠ value; 13 Two ways to value
- **Unit 2, The yearly report:** 14 Annual report; 15 Income statement; 16 Balance sheet; 17 Book ≠ market value; 18 Profit ≠ cash; 19 Big purchases and depreciation; 20 Cash flow statement; 21 Free cash flow; 22 Return on capital; 23 Medians
- **Unit 3, Time:** 24 Money now vs later; 25 Compounding; 26 Discounting; 27 Inflation; 28 Payments that never end; 29 Bonds
- **Unit 4, Risk:** 30 Expected value; 31 Risk-free rate; 32 Equity premium; 33 Beta; 34 Cost of equity; 35 Cost of debt; 36 Cost of capital
- **Unit 5, The value machine:** 37 Discounted cash flow idea; 38 Valuing a steady company; 39 From business to one share; 40 Leases; 41 Staff options; 42 Terminal value; 43 Growth cap; 44 Reinvestment after the forecast
- **Unit 6, The levers:** 45 Four levers; 46 Sales growth; 47 Market × share; 48 Target margin; 49 Competition; 50 Tax over time; 51 Sales-to-capital; 52 Does growth add value?; 53 How risk changes over time; 54 Failure; 55 Full valuation
- **Unit 7, Story:** 56 Story first; 57 Plausible stories; 58 Story to levers; 59 Ranges; 60 News
- **Unit 8, Pricing:** 61 Multiples; 62 Like with like; 63 Peers; 64 What drives a multiple; 65 Reading a price backwards
- **Unit 9, Company types:** 66 Young companies and IPOs; 67 Mature (optional); 68 Distressed; 69 Cyclical; 70 R&D-heavy; 71 Country risk; 72 Currency; 73 Banks; 74 Holding companies (optional)
- **Unit 10, Capstone:** 75 Finding the inputs; 76 Value a company start to finish

=== FULL REPORT (could not be saved to /tmp/value-it-audit/report.md) ===

# Value It lesson audit: synthesis report (fact-finding only)

Date: 2026-11-19. Repo: /home/fedora/developer/finance-agent. No repo file was edited.
Inputs: seven agent reports in /tmp/value-it-audit/ (spine-1.md, spine-7.md, spine-13.md, offspine-num-percent-bps.md, offspine-eco-supply-demand.md, skill-tree.md, code-facts.md), plus spot checks by this synthesis.

Conventions:
- `T/` = `course/topics/`. Other paths are relative to the repo root.
- "pos N" = Spine position N in course/outline.yaml.
- Spine order: 1 spine-01-worth, 2 spine-02-money-later, 3 spine-03-cash, 4 spine-statements, 5 spine-04-growth, 6 spine-05-margins, 7 spine-06-growth-cost, 8 spine-07-risk, 9 spine-cost-of-capital, 10 spine-08-far-future, 11 spine-09-to-one-share, 12 spine-10-survival, 13 spine-11-story-to-numbers, 14 spine-12-price-or-value, 15 spine-13-price-assumes, 16 spine-14-being-wrong, 17 spine-15-value-yourself, 18 spine-annual-report.
- "Taught" means explained on the main path in plain words with an example or numbers. A bracket, a mistake fix, goDeeper, or a Lingo card shown only on request (src/tutor/companion.ts:16-19, 117-137) does not count.

## 1. Headline findings (8)

1. **Topic 1 shows the whole machine before teaching any part of it.**
   - All four levers appear at once (T/spine-01-worth.yaml:25-26, :116-121).
   - Operating margin is a bracket: "a 10% operating margin (10 cents kept from each $1 of sales)" (:120). It is taught in depth only at pos 6 (T/spine-05-margins.yaml:38-47).
   - The widget shows "Chance it fails" (value-levers-model.ts:248-259), taught at pos 12.
   - It also draws an "After year 10" bar (:481), taught at pos 10, and a 17-row Full sheet (full-sheet-words.ts:20-182).
   - No Spine Topic carries a card for "revenue".
2. **The order inverts dependencies.**
   - Cash (pos 3) comes before the statements (pos 4), so pos 3 says "the profit it reports" before profit is taught (T/spine-03-cash.yaml:52-53).
   - The levers are taught in the order 3→1→2→4.
   - Failure is tested from pos 3 (:313) and taught at pos 12.
   - The bridge from business value to one share is used at pos 1 (T/spine-01-worth.yaml:127, :182) and taught at pos 11.
   - A multiple is used at pos 1 (:215) and taught at pos 14.
   - About 338 terms are introduced; about 155 (46%) are untaught where first met.
3. **The rules keep Topics shallow.**
   - Main-path teaching is 243-332 words per Topic, against 745-1,330 words of testing.
   - A Spine Topic gets exactly one card (src/course/spine-check.ts:60-61), of at most 5 lines with sentences of at most 20 words (lesson-lint.ts:133-134).
   - `concept` is never shown as written. The Tutor adds one sentence (src/tutor/context.ts:36) and is capped at 80 words (reply-checks.ts:80-86).
   - These sums are never worked:
     - cost of equity (T/spine-07-risk.yaml:41-43)
     - the cost-of-capital blend (pos 9)
     - terminal value $52,148m (T/spine-08-far-future.yaml:36; goDeeper :62)
     - expected value (T/spine-10-survival.yaml:53-58)
     - the justified multiple (T/spine-12-price-or-value.yaml:106-111)
4. **Checks test baselines the Learner never saw, and numbers from reveals.**
   - Hidden baselines: T/spine-06-growth-cost.yaml:203-205; T/spine-07-risk.yaml:156-179 (15.57%, 10.47%, 9.61%); T/spine-15-value-yourself.yaml:171-173, :193.
   - Values that exist only in a YAML comment (T/spine-11-story-to-numbers.yaml:173-174) are tested at :202-204.
   - The Check comes before the reveal (instructions.ts:178), yet T/spine-09-to-one-share.yaml:239 asks about a figure the reveal gives.
5. **Later Topics repeat earlier ones instead of building on them.**
   - The Amazon Feb-2000 Case appears in 7 of the 18 Topics.
   - pos 13 re-runs pos 5's Uber Case (T/spine-04-growth.yaml:29-49 vs T/spine-11-story-to-numbers.yaml:23-50).
   - pos 15 re-runs pos 1's Insight (T/spine-01-worth.yaml:76 vs T/spine-13-price-assumes.yaml:100).
   - pos 16 re-runs pos 6's Tesla Case.
   - 13 of 71 Lingo cards repeat an earlier card.
   - Synonyms are never linked: sales/revenue/fee; interest rate/discount rate/cost of capital; operating income/profit; business/enterprise value.
   - Two Topics contradict each other: T/spine-04-growth.yaml:59-60 vs T/spine-05-margins.yaml:188.
6. **Names.**
   - Spine visible and Tutor fields: "Damodaran" 125 times in 14 of 18 Topics, plus "professor" 25, Gurley 13, and about 100 "he/his". `source`, `why`, `foundWhen` and `passCriteria` are excluded.
   - Off-Spine Topics: Damodaran 124, Zitron 43, others 52.
   - In code: the Home, How it works, About and Example pages; 10 widget defaults (set-workbench.ts:224-352); market and Library credits; 10 Follow/Judge titles (outline.yaml:1472-1663); and Tutor instructions (instructions.ts:187-188).
7. **Coverage.**
   - Missing from the Spine:
     - basics (revenue, costs), percent, inflation, bonds
     - cost of debt from a credit rating, currency and country risk
     - R&D and stock-pay fixes
     - banks, cyclicals, a mature-company valuation
     - the Learner building a valuation at all (ADR 0020)
   - The only end-to-end recipe is off the Spine (T/ana-build-valuation.yaml:201-230).
8. **Code.**
   - Teaching in several beats works via several Checks off the Spine: num-percent-bps has 4, num-compounding 5. Only the Spine rules forbid it (spine-check.ts:61, 67, 73; L13).
   - No rule checks that a term is taught before it is used.
   - Progress is keyed by Topic id. Reusing the ids keeps all progress; new ids re-lock the Assignment (navigator.ts:137-140).
   - The engine cannot value banks or insurers and has no country-risk input (own-case.ts:24; cost-of-capital-stack.ts:8-21).

## 2. Cumulative term-order violations (sorted by gap)

"Gap" = the number of Topics between first use and first genuine teaching. "never (n)" = the term is used untaught in n Topics, through pos 18.

| # | Term (stand-ins merged) | First used (pos, field, path:line) | First genuinely taught | Gap |
|---|---|---|---|---|
| 1 | revenue / sales / "fee" | 1 story T/spine-01-worth.yaml:23 | never. Only a gloss in the goal at T/spine-03-cash.yaml:16; the platform-fee card at T/spine-04-growth.yaml:92-97 | never (18) |
| 2 | discounted cash flow, the method ("code works out a value") | 1 concept :119; card :330; connection :107 | never put together on the main path. Only in goDeeper :124-128 and off the Spine | never (18) |
| 3 | cost of capital that changes over time ("while it grows") | 1 card pro :62; value-levers-model.ts:237-238 | never. One clause at T/spine-08-far-future.yaml:52-53 | never (18) |
| 4 | market value / market cap | 1 question :245 | never carded. Only in fixes: T/spine-05-margins.yaml:251, T/spine-06-growth-cost.yaml:260 | never (18) |
| 5 | bond / yield / Treasury / "safe government loans" | 2 reveal T/spine-02-money-later.yaml:36, connection :215 | never | never (17) |
| 6 | EMI | 2 dailyLife :65 | never | never (17) |
| 7 | tax rate on operating profit | 3 card T/spine-03-cash.yaml:88, :380 | never. pos 9 covers only the tax saving on interest | never (16) |
| 8 | working capital | 3 concept :54; T/spine-statements.yaml:225 | never. The word itself is never shown | never (16) |
| 9 | depreciation | 3 primer :207; the word at T/spine-06-growth-cost.yaml:40, :93 | never (one-line gloss only) | never (16) |
| 10 | IPO / offer price / first-day close | 3 story :30-31; T/spine-04-growth.yaml:40-41 | never | never (16) |
| 11 | goodwill amortisation | 3 explanation :347 | never | never (16) |
| 12 | annual report | 3 story :31 | pos 18 card T/spine-annual-report.yaml:144 | 15 |
| 13 | tax-loss carryforward | 3 goDeeper :66-67 | pos 18 gloss :34-35 | 15 |
| 14 | accrual / receivables | 4 quick try T/spine-statements.yaml:452-459 | never | never (15) |
| 15 | book value vs market value | 4 question :304-316 | never | never (15) |
| 16 | pre-money | 5 story T/spine-04-growth.yaml:30-31 | never | never (14) |
| 17 | multiples / relative valuation | 1 question T/spine-01-worth.yaml:215; T/spine-09-to-one-share.yaml:131 | pos 14 | 13 |
| 18 | chance of failure | 1 widget value-levers-model.ts:248-259; T/spine-03-cash.yaml:313 | pos 12 | 11 |
| 19 | standard error / regression beta | 8 story T/spine-07-risk.yaml:26-27 | never | never (11) |
| 20 | equity bridge (debt, cash, options, shares) | 1 goDeeper :127; band :182; value-levers-model.ts:460 | pos 11 | 10 |
| 21 | stock split | 6 story T/spine-05-margins.yaml:20 | pos 16 gloss T/spine-14-being-wrong.yaml:27-28 | 10 |
| 22 | re-levering | 9 questions T/spine-cost-of-capital.yaml:158-179 | goDeeper :61-65 only | never (10) |
| 23 | market-value weights | 9 story :24-25; question :209 | goDeeper :58-59 only | never (10) |
| 24 | terminal value | 1 widget value-levers-model.ts:481 | pos 10 | 9 |
| 25 | growing perpetuity | 10 card pro T/spine-08-far-future.yaml:85 | goDeeper :62 only | never (9) |
| 26 | stable-growth reinvestment | 10 question :222-224 | never | never (9) |
| 27 | cost of capital / "how risky" | 1 story T/spine-01-worth.yaml:26; card :60-65 | pos 8 and 9, no worked sums | 8 |
| 28 | percentage point | 1 explanation :148 | pos 9 primer :104-122 | 8 |
| 29 | debt / lenders / interest | 1 goDeeper :127; T/spine-03-cash.yaml:88 | pos 9 cost-of-debt card. "Debt" is never carded | 8 |
| 30 | how options are valued | 11 story T/spine-09-to-one-share.yaml:29-30 | never | never (8) |
| 31 | convertible notes | 11 story :47-48 | never | never (8) |
| 32 | equity ("owners' part") | 4 concept T/spine-statements.yaml:51; T/spine-04-growth.yaml:46 | pos 11 card :100-105 | 7 |
| 33 | implied premium | 8 story T/spine-07-risk.yaml:24 | pos 15 card :79 | 7 |
| 34 | country risk / currency / crore | 12 T/spine-10-survival.yaml:26, :198-199; T/spine-15-value-yourself.yaml:41, :64, :172 | never (deferred to an Elective, :156) | never (7) |
| 35 | bond rating / default | 12 concept :55-56; question :203 | never | never (7) |
| 36 | reinvestment → sales-to-capital | 1 story :26; concept :121 | idea at pos 3 (:99-104); ratio at pos 7 (:80-85) | 2 / 6 |
| 37 | risk-free rate | 2 reveal :36 | pos 8 card :67-72 | 6 |
| 38 | real option | 13 story :29 | never | never (6) |
| 39 | operating margin | 1 story :26; concept :120; widget label :215-216 | pos 6 :38-47. Never computed from statements | 5 |
| 40 | mature margin | 1 card pro :56; widget label | pos 6 card :77-82 | 5 |
| 41 | run-rate | 14 question :254 | never | never (5) |
| 42 | P/E / earnings | 14 concept :60; goDeeper :66-79; tested at :360-372 | never on the main path | never (5) |
| 43 | justified multiple | 14 card :106-111 | never worked out | never (5) |
| 44 | return on capital | 3 connection T/spine-03-cash.yaml:231 | pos 7, no formula | 4 |
| 45 | dividend yield | 15 :37, :42 | never | never (4) |
| 46 | probability distribution / 10th-90th percentile | 16 :23-25 | partly (the card covers only the 90th) | never (3) |
| 47 | operating income / operating loss | 1 story :23-24 | pos 3 card :87-92 | 2 |
| 48 | discounting over several years | 1 concept :119 | pos 2 covers one year only. Several years appear only in goDeeper and the primer, yet are tested at :393-417 | 1 |
| 49 | net income / net loss | 3 concept :52-53 | pos 4 card :102-107 | 1 |
| 50 | blending debt into the rate | 8 questions T/spine-07-risk.yaml:156-179; wacc-stack-model.ts:141-158 | pos 9, with no worked blend | 1 |
| 51 | share-count rules | 18 T/spine-annual-report.yaml:58-59, 76-77, 86 | never | never (1) |

Synonyms never reconciled:
- sales vs revenue: T/spine-01-worth.yaml:38 avoids "revenue", but the waterfall bar says "Revenue" (cash-waterfall-model.ts:155).
- cost of capital vs discount rate: "cost of capital" appears 0 times in pos 2.
- operating income vs operating profit.
- business value vs enterprise value: T/spine-09-to-one-share.yaml:94 vs T/spine-12-price-or-value.yaml:100.
- take rate vs revenue slice: T/spine-04-growth.yaml:92 vs T/spine-11-story-to-numbers.yaml:129.

## 3. New-term load per Topic

Hand tallies from the ledgers, ±2. Hidden baselines are counted separately from terms.

| Pos | Topic | Cards new/repeat | Terms first met | Taught | Untaught | Earlier untaught terms reused | Hidden baselines |
|---|---|---|---|---|---|---|---|
| 1 | spine-01-worth | 4/0 | 32 | 10 | 22 | 0 | 1 |
| 2 | spine-02-money-later | 4/0 | 22 | 13 | 9 | 1 | 0 |
| 3 | spine-03-cash | 4/0 | 30 | 16 | 14 | 3 | 1 |
| 4 | spine-statements | 4/0 | 16 | 13 | 3 | 5 | 1 |
| 5 | spine-04-growth | 3/1 | 19 | 6 | 13 | 2 | 3 |
| 6 | spine-05-margins | 3/1 | 10 | 7 | 3 | 5 | 4 |
| 7 | spine-06-growth-cost | 3/1 | 15 | 9 | 6 | 7 | 4 |
| 8 | spine-07-risk | 4/0 | 19 | 10 | 9 | 3 | 5 |
| 9 | spine-cost-of-capital | 3/1 | 16 | 10 | 6 | 3 | 4 |
| 10 | spine-08-far-future | 3/0 | 13 | 9 | 4 | 2 | 2 |
| 11 | spine-09-to-one-share | 4/0 | 23 | 13 | 10 | 3 | 2 |
| 12 | spine-10-survival | 4/0 | 20 | 12 | 8 | 4 | 3 |
| 13 | spine-11-story-to-numbers | 1/3 | 17 | 5 | 12 | 5 | 4 |
| 14 | spine-12-price-or-value | 4/0 | 16 | 9 | 7 | 4 | 3 |
| 15 | spine-13-price-assumes | 3/1 | 10 | 5 | 4 | 2 | 2 |
| 16 | spine-14-being-wrong | 4/0 | 8 | 5 | 3 | 1 | 3 |
| 17 | spine-15-value-yourself | 2/2 | 14 | 9 | 5 | 4 | 6 |
| 18 | spine-annual-report | 1/3 | ~38 | ~21 | ~17 | 1 | 1 |
| **Total** | | **58/13** | **~338** | **~182** | **~155 (46%)** | | **49** |

The Lingo cap of 4 (beginner-check.ts:13) counts only the `terms` list.

## 4. Depth per Spine Topic

- **Main path** = concept + card + term meanings. Only the card (≤5 lines) and an 80-word Tutor turn show as written.
- **+optional** = main path plus goDeeper and the primer.

| Pos | Topic | Main path words | +optional | Testing words | Test:teach ratio | Depth /5 | Worst problem |
|---|---|---|---|---|---|---|---|
| 1 | spine-01-worth | 270 | 355 | 1,070 | 4.0 | 2 | All levers, failure, the terminal bar and a 17-row sheet are played before any is taught. Margin appears only as a bracket (:119-121) |
| 2 | spine-02-money-later | 277 | 366 | 1,255 | 4.5 | 3 | Discounting over several years is optional (:52) but tested (:393-417). No link to cost of capital |
| 3 | spine-03-cash | 262 | 456 | 1,110 | 4.2 | 2 | Uses profit and statements before pos 4. The Check tests failure, mature margin and a changing rate (:311-313) |
| 4 | spine-statements | 273 | 491 | 1,210 | 4.4 | 2 | No statement is ever laid out (:48-53). The credit sale is tested but never taught (:452-459) |
| 5 | spine-04-growth | 306 | 428 | 960 | 3.1 | 2 | The "market size moves value most" claim (:59-60) is reversed at pos 6. About 38 names |
| 6 | spine-05-margins | 332 | 464 | 745 | 2.2 | 3 | Figure barrage (:19-27). The update is tested (:283) before the reveal tells it (:29-30) |
| 7 | spine-06-growth-cost | 313 | 495 | 970 | 3.1 | 2 | Return on capital is never computed. The widget shows 78% against 12.35% unexplained. Hidden baselines (:203-205) |
| 8 | spine-07-risk | 267 | 357 | 939 | 3.5 | 2 | No cost-of-equity card, and the sum is never shown (:41-43). The Check uses next-Topic numbers (:156-179) |
| 9 | spine-cost-of-capital | 295 | 511 | 768 | 2.6 | 2 | No worked blend. Re-levering appears only in goDeeper but is tested (:61-65, :158-179). The basis-point card is unused |
| 10 | spine-08-far-future | 295 | 357 | 881 | 3.0 | 3 | The formula and $52,148m are never worked (:62, :36). Reinvestment is hidden but tested (:222-224) |
| 11 | spine-09-to-one-share | 287 | 428 | 1,170 | 4.1 | 3 | The second Case (WeWork) adds unexplained convertibles and three lease figures (:43-53). The options' value is handed over (:29-30) |
| 12 | spine-10-survival | 276 | 412 | 850 | 3.1 | 3 | Expected value is never computed with numbers (:53-58, :117-125). The probability routes rely on untaught bonds and ratings (:55-56) |
| 13 | spine-11-story-to-numbers | 273 | 391 | 1,080 | 4.0 | 2 | 32-number Moment (:22-40). Three levers get 9 words (:88-89), then are tested from hidden values (:173-174, :202-204) |
| 14 | spine-12-price-or-value | 264 | 540 | 1,330 | 5.0 | 2 | The justified multiple is never derived. Three clashing WeWork baselines (:177, :199-208, :38-40). goDeeper material is tested (:360-372) |
| 15 | spine-13-price-assumes | 247 | 247 | 1,170 | 4.7 | 2 | No worked backward solve. Repeats pos 1. Dividend yield is untaught (:34-45) |
| 16 | spine-14-being-wrong | 243 | 243 | 1,060 | 4.4 | 3 | Simulation and percentiles are unexplained (:23-25, :64-68). Re-runs the Tesla Case |
| 17 | spine-15-value-yourself | 255 | 255 | 1,200 | 4.7 | 2 | Lever settings are hidden in all 3 Cases (:25-28 vs :171-173, :193, :257-266). Two cards are repeats. No new teaching |
| 18 | spine-annual-report | 244 | 339 | 1,180 | 4.8 | 2 | About 38 reporting terms, glossed in reveals after the Check (:52-113 vs :254-274). The "six numbers" omit reinvestment (:29-30) |

Mean depth 2.4/5. No Topic scores above 3.

## 5. Name exposure (learner-visible)

**A. Topic prose**
- Spine "Damodaran" by position:
  - pos 1: 5, pos 5: 15, pos 6: 12, pos 7: 3, pos 8: 9, pos 9: 9, pos 10: 6, pos 11: 5
  - pos 13: 16, pos 14: 1, pos 15: 13, pos 16: 10, pos 17: 9, pos 18: 12
  - pos 2, 3, 4 and 12: 0
- Also on the Spine: "professor" 25; Gurley 13; about 100 "he/his"; Fidelity, CNBC, Bloomberg, TIME and Forbes.
- Verbatim card: "His story: $39 billion…" (T/spine-01-worth.yaml:331). Scene casts: T/spine-05-margins.yaml:105; T/spine-08-far-future.yaml:105, where he speaks at :109 and :111.
- Off-Spine: Damodaran 124, Zitron 43, Blodget 14, Grantham 12, Modigliani 6, Miller 6, Reinhart 6, Rogoff 6, Buffett 5, Shiller 2, Markowitz 1, "professor" 19.
- In a concept: T/funds-passive.yaml:53 and T/ana-commitments-debt.yaml:61.
- Connections, shown verbatim in the Notebook: T/spine-01-worth.yaml:109; T/spine-04-growth.yaml:219; T/spine-05-margins.yaml:180; T/spine-14-being-wrong.yaml:119.

**B. Case titles.** The Tutor receives these (context.ts:164).
- Spine: T/spine-01-worth.yaml:17; T/spine-04-growth.yaml:25; T/spine-05-margins.yaml:15; T/spine-08-far-future.yaml:19; T/spine-09-to-one-share.yaml:19; T/spine-11-story-to-numbers.yaml:20; T/spine-14-being-wrong.yaml:16; T/spine-annual-report.yaml:21, :42.
- Off-Spine: T/val-dcf.yaml:11; T/val-young.yaml:11; T/mkt-efficiency.yaml:11; T/num-econometrics.yaml:11.
- Outline Case titles reach only docs/course-map.md (outline.ts:240).

**C. Widgets**
- `caseStory` chips: T/spine-01-worth.yaml:100; T/spine-04-growth.yaml:173; T/spine-05-margins.yaml:154; T/spine-11-story-to-numbers.yaml:175; T/spine-13-price-assumes.yaml:113; T/spine-14-being-wrong.yaml:96.
- Recipe default chip, 10 times: src/widgets/recipes/set-workbench.ts:224, 240, 259, 275, 285, 295, 314, 324, 334, 352. Recipe source titles at :191-193, :263-264, :533-535.
- Casts: T/spine-11-story-to-numbers.yaml:167 (plus Gurley at :168); T/spine-13-price-assumes.yaml:121; T/spine-14-being-wrong.yaml:105. The chip "his measure" at T/spine-07-risk.yaml:135.
- Market readings: src/markets/readings.ts:113, 179-180; yardsticks.ts:36, 60; drawn at market-readings-view.tsx:32-36.
- Tutor-only widget text: value-levers-model.ts:866; wacc-stack-model.ts:420.
- Other: LeversWidget.tsx:481-482; range-check-view.tsx:19-21; own-case.ts:200-204.

**D. Topic titles**
- Follow titles naming Damodaran: outline.yaml:1472, 1485, 1501, 1516, 1528, 1585.
- Follow and Judge titles naming Zitron: :1542, 1556, 1572, 1663.
- "Modigliani-Miller" title: :1063.
- Shown on the Course Map, the Topic bar and the Notebook (filled-part.tsx:54-62). They are linked from T/spine-01-worth.yaml:107-109, T/spine-04-growth.yaml:221 and T/spine-05-margins.yaml:181.
- 19 of 23 Follow/Judge/Analyse Topics are built on a named writer's piece; 8 of them ask the Learner to paste the piece in.

**E. Library**
- Credit lines: scripts/library/sources.json:8, 20, 31.
- Shown via src/tutor/sources.ts:30-35, reply-markdown.tsx:79 and src/app/passages/[id]/page.tsx. The name is also in src/library/spreadsheets.ts:152.
- The licence asks for credit.

**F. Site copy**
- copy.ts:256-260 (shown at levers-story.tsx:115 and moves.tsx:214).
- copy.ts:464-466 (shown at about/page.tsx:93).
- examples.ts:127, 131 (shown at case-flow.tsx:149-158).
- Case Data source strings live in the database; I could not check them.

**G. Tutor instructions**
- instructions.ts:187-188 ("Zitron's articles"), :306.
- context.ts:164-166, :379.
- GLOSSARY.md:251 is docs only.

## 6. Coverage gap vs the skill tree (/tmp/value-it-audit/skill-tree.md)

**Missing entirely from the Spine**
- A1-A3: revenue = price × units, cost of goods, gross profit
- B3: earnings per share
- B6: accruals and working capital (tested at pos 4)
- C4: inflation, nominal vs real (0 hits)
- C12: cost of debt from a credit rating or default spread
- C14-C15: country risk and currency
- D2, D4-D5: the IT idea; assets in place vs growth
- D10: a first full valuation of a steady company
- E3: effective vs marginal tax rate
- E5-E6: the implied-return check; the cost-of-capital path (used from pos 1)
- E8: parsimony
- G4-G5: the Learner building and presenting a valuation (ADR 0020)
- H3, H5: peer median and applying a multiple
- I4-I5: mature and declining companies
- J1-J4: banks, cyclicals, emerging markets, R&D-heavy firms
- K2: valuing each company type end to end

**On the Spine but taught out of prerequisite order**
- A4 operating profit: used at pos 1, carded at pos 3.
- A5 operating margin: used at pos 1, taught at pos 6, never computed.
- A12 intrinsic vs relative: used at pos 1, taught at pos 14.
- B1 annual report: used at pos 3, carded at pos 18.
- B5 book vs market value: tested at pos 4, never taught.
- C7 risk-free rate: used at pos 2, taught at pos 8. Bonds are never taught.
- C13 cost of capital: used at pos 1, built at pos 9.
- D1 DCF: a black box from pos 1.
- E7 failure: used at pos 1, taught at pos 12.
- F3 bridge: used at pos 1, taught at pos 11.
- Cash at pos 3 comes before the statements at pos 4.
- I1 life cycle: appears only in goDeeper at pos 5.

**Taught thinly**
- B2/B4/B8 statements: one sentence each at pos 4.
- C1-C3: discounting over several years is optional.
- C5 perpetuity: goDeeper only.
- C8-C11 cost of equity: no worked sum.
- D8: growth = reinvestment rate × return on capital, with no formula.
- E1 revenue: market × share × slice only.
- E2: margin path missing.
- E4: no reinvestment arithmetic.
- F1: no number for the growth cap; reinvestment g/ROC missing.
- G3: three levers in 9 words.
- H4: the multiple's drivers are left to the widget.

**Present only off the Spine**
- num-percent-bps, num-compounding
- fs-income, fs-balance, fs-links, fs-capex-dep, fs-tax
- eco-inflation-real
- bond-pricing, bond-yield, bond-credit-spreads
- val-india, ana-india-transfer, fol-sov-ratings
- val-banks
- fol-tesla-2020 and fol-roe (R&D)
- der-options, ana-commitments-debt
- val-multiples (justified P/E)
- cf-venture
- eco-micro-competition
- ana-build-valuation (the only end-to-end recipe)

## 7. Off-Spine triage summary (95 Topics)

| Batch | CORE | SUPPORTING | NOT NEEDED |
|---|---|---|---|
| 38 valuation-side | 18 (10 duplicate the Spine) | 17 | 3 (num-econometrics, cf-payout, mkt-ipo-float) |
| 57 other | 6 (2 duplicate the Spine) | 23 | 28 |
| **Total** | **24 (12 unique)** | **40** | **31** |

**The 12 unique CORE Topics:** num-percent-bps, num-compounding, fs-income, fs-balance, fs-capex-dep, fs-tax, val-banks, val-india, eco-inflation-real, bond-credit-spreads, ana-build-valuation, ana-india-transfer.

**Duplicates of Spine Topics:** present-value, fs-cashflow, risk-capm, cf-wacc, val-dcf, val-multiples, val-young, val-distress, val-implied-erp, fs-leases-debt, fol-uber-2014, fol-tesla-2020.

**Reusable content (strip names first):**
- fol-tesla-2020:102-118 (the four levers; best replacement for spine-01's concept)
- fs-income:39-49, :72+
- fs-balance:31-45
- fs-links:36
- fs-capex-dep:38-47
- fs-tax:41
- the num-percent-bps and num-compounding scenes
- bond-credit-spreads:40-46
- bond-pricing:7, :36-44
- eco-inflation-real:29-33
- eq-history:49
- val-india:89-107
- ana-india-transfer:86-92
- fol-sov-ratings:49-50
- eco-micro-competition:40-52
- ana-build-valuation:201-234
- ana-commitments-debt:59-73
- der-options:41-47
- val-young:95-104
- val-dcf:83-84
- val-multiples:61, :68
- val-implied-erp:63-78
- val-banks:56-62
- fol-roe:50-60
- jud-assumptions:75-84
- cf-venture:47-55
- fol-twitter-ipo:51-58
- jud-units-periods:114

**Blockers:**
- The default path appends 23 Follow/Judge/Analyse Topics, each needing 8-46 unvisited Elective prerequisites (navigator.ts:103-130, :219).
- `valuationFrom` dependencies:
  - T/spine-05-margins.yaml:17 and T/spine-14-being-wrong.yaml:18 use `fol-tesla-2020-diy`.
  - T/spine-11-story-to-numbers.yaml:57 uses `fol-uber-2014-crowd`.
  - The Spine also borrows from val-dcf, cf-capital-budgeting, val-young, fs-leases-debt, val-distress, val-india and ana-build-valuation.

## 8. Code constraints

**What the Learner sees word for word vs what the Tutor rewrites**
- Shown verbatim:
  - title, goal, youllLearn, minutes
  - the Check card (the only concept text on screen, practice.ts:518-529)
  - quick tries
  - quiz prompts, choices, speaker, explanation and fix
  - insight.pick, principle, dailyLife
  - connections and linked titles
  - primers
  - widget title and `caseStory`
  - skills.rule
  - terms (only when the Learner asks)
- Worded by the Tutor: concept; Case title, story and reveal; why; goDeeper; running example; hints.
- Never seen: `source`, YAML comments, outline Case titles, valuation sources and notes.
- Consequence: depth must go into cards, tries, explanations and scenes. Anything in `concept` passes through an 80-word turn (reply-checks.ts:80-86; instructions.ts:152, 159).

**Teaching in several beats**
- Several Checks per Topic work today (navigator.ts:78, 443-451).
- The Spine forbids them:
  - exactly 1 card (spine-check.ts:61)
  - 6-8 quick tries (:67)
  - at most 2 quiz Checks (:73)
  - L13: 6 or more questions, 4 of them judgement questions, 1 computed (lesson-lint.ts:568-600)
- Each beat costs a card, a Skill, 3 or more tries (one half-done), 3× perAttempt questions, and a fix for every wrong choice (L2, L12).
- There is no explain-only step.
- Options:
  - **(a)** Relax spine-check and L13: no migration. New Checks are not required, so passes hold (map.ts:281, 349; navigator.ts:86-89).
  - **(b)** Several cards per step: about 8 files.
  - **(c)** A new step type: about 17 files, and ADR 0001 says it needs a migration.

**What blocks zero-jargon lessons**
- Every Spine Topic needs a Case with a valuation block, a Workbench and an Insight (spine-check.ts:37-98).
- Formulas appear only as Formula Cards (ADR 0003; formula-check.ts:8-21).
- Questions are taps only: no typed number, no sum (ADR 0002, L10).
- The Spine is judge-only (ADR 0020).

**Term order**
- Not enforced anywhere.
- The Tutor sees only the current Topic's terms (context.ts:139-141). The Learner summary has no earlier words (memory.ts:244-292).
- A course-wide ledger check would be new code.

**Progress**
- Keyed by id: schema.ts:160-193, 238-240, 421-439, ~743-800.
- Reusing the 18 ids keeps everything.
- New ids:
  - hide notes (navigator.ts:608; notes.ts:110)
  - drop reviews (:650)
  - show raw ids in past Sessions (past-sessions.ts:47)
  - re-lock the Assignment (:137-140; own-cases.ts:44)
- Either way, these need edits:
  - SPINE_LENGTH/SPINE_MAX = 18 (outline.ts:15, 21) and the 15-minute cap (:22)
  - SPINE_LIVE_WITH (navigator.ts:110). If any listed id is missing, the default path silently becomes every non-Spine Topic (:126-128)
  - HOME_TOPIC_ID (home-topic.ts:8) and the Example ids (examples.ts:56, 99)
  - the critics log
  - dev-e2e (route.ts:57-145) and e2e-tutor.ts
  - 51 src tests and 12 e2e specs
  - copy.ts:468-469
- The Course Map sections and the Primer→Elective link rule (map.ts:1160-1166) assume today's split.

**Engine**
- Can value:
  - FCFF over 10 years: growth, margin path, tax with losses, sales-to-capital, a yearly cost of capital
  - a growing-perpetuity terminal value
  - a failure chance with recovery
  - the bridge: cash, debt including leases, options, shares
  - USD, INR, JPY, KRW and EUR; private firms
  - side tools: justified value-to-sales, implied ERP, the cost-of-capital stack
  - mature, young, distressed and cyclical firms, if the Learner normalises the inputs by hand
- Cannot value:
  - banks or insurers (own-case.ts:24)
  - country risk (cost-of-capital-stack.ts:8-21)
  - R&D or lease adjustments, cross-holdings or minority interests, except by hand
  - option pricing
  - more than 10 years
  - more than one scenario
- None of the 11 valued Cases is a bank, a cyclical, a mature dividend payer or a multi-business firm.
- The Own Case takes about 8 numbers in 4 industries (own-case.ts:9-25, 227-234).

**Credits**
- Library licence: sources.json:6-8, 20, 31.
- The course check fails market readings with no source (check-course.mjs:85-86).
- So credit lines may need to keep the name; that is an owner decision.

## 9. DRAFT linear curriculum (for the owner's decisions)

**Owner decisions:**
1. Length: 76 lessons (74 core) against today's cap of 18. Possible merges: 32+33, 43+44, 61+62.
2. One name per idea: sales or revenue; operating profit or operating income; business value or enterprise value; target margin or mature margin; discount rate vs cost of capital.
3. "Four levers" or "four levers plus survival".
4. Whether worked arithmetic and formulas may sit on the main path (ADR 0003).
5. Whether the Learner builds valuations inside the course (ADR 0020).
6. Whether to reuse the 18 ids to keep progress.
7. What happens to the Electives and to the Follow/Judge/Analyse Topics.
8. Engine work for banks and country risk, or treat those lessons as idea-only.
9. One Case per lesson, with Amazon kept for the payoff at lesson 55.
10. Which credit lines must keep a name.

**Rules followed:** one idea per lesson; at most 3 new terms; prerequisites always earlier; lessons 1-4 use shop words only; no named commentators.

Format: # Title | new terms | prerequisites | what it adds to the valuation | files to reuse

**Unit 1 – How a business makes money**
1. Money in, money out, what's left | sales, costs, profit | — | what a value rests on | fs-income cards; spine-01:57
2. Sales are price times how many | selling price, units sold | 1 | base of lever 1 | new; fs-revenue-runrate
3. Two kinds of cost | cost of goods, running costs, gross profit | 1-2 | cost structure | fs-income
4. What the business itself earns | operating profit | 3 | base of free cash flow | spine-03:87-92; fs-income
5. Percent and percentage points | percent, percentage point | 1-4 | lever language | num-percent-bps; jud-units-periods:114
6. Margin | margin, operating margin | 4-5 | lever 2 defined | spine-05:38-47, :71-76; fol-tesla-2020:106
7. Owners' money and borrowed money | equity, debt, interest | 1 | who funds the business | fs-balance; spine-09:77
8. Lenders are paid first | claim | 7 | why debt comes off | spine-09:66-67
9. Tax and the bottom line | tax, net profit | 4, 7 | after-tax operating profit | fs-tax; fs-income
10. A share is a slice | share, number of shares, share price | 7 | per-share value | spine-01:21-22; eq-markets
11. Stock market and market value | stock market, listed company, market value | 10 | whole-company price | eq-markets; spine-01:245
12. Price is not value | price, value | 10-11 | the course question | spine-01:42-53; fol-twitter-ipo:51-58
13. Two ways to put a number on a business | comparable | 12 | course map | spine-12 concept; new

**Unit 2 – The yearly report**
14. The yearly report | annual report, last twelve months | 1-11 | where inputs live | spine-annual-report:115-122; fs-filings
15. Income statement | income statement | 3-9, 14 | base-year sales and margin | fs-income; spine-statements; jud-filing-vs-claim:137-139
16. Balance sheet | balance sheet, assets, liabilities | 7, 14 | bridge inputs | fs-balance:31-45
17. Book value is not market value | book value | 11, 16 | the balance sheet is not a value | spine-statements:304-316; fol-roe
18. Profit is not cash | receivables, inventory, working capital | 15-16 | reinvestment, part 1 | fs-links:36
19. Things that last | capital spending, depreciation | 15-16 | reinvestment, part 2 | fs-capex-dep:38-47; spine-03:205-208
20. Cash flow statement | cash flow statement, operating cash flow | 18-19 | profit vs cash | spine-statements; fs-cashflow; spine-03
21. Free cash flow | free cash flow, reinvestment, cash burn | 9, 18-20 | what gets discounted | spine-03; val-dcf:83-84
22. Return on capital | invested capital, return on capital | 9, 16, 21 | growth test | spine-06:86-91; fs-ratios
23. The typical company | median, industry average | 5-6 | lever benchmarks | spine-05:83-88; num-statistics

**Unit 3 – Time and money**
24. Money now beats later | interest rate, time value of money | 7 | why discount | spine-02; present-value
25. Growth on growth | compounding, growth rate | 5, 24 | sales paths | num-compounding; spine-02:193-211
26. Bringing future money to today | present value, discount rate | 25 | discounting over several years | spine-02:39-55
27. Inflation | inflation, nominal, real | 25 | consistency rule | eco-inflation-real:29-33; eq-history:49
28. Payments that never end | perpetuity, growing perpetuity | 26 | terminal formula | spine-08:62; real-assets; bond-pricing:7
29. Bonds and yield | bond, yield, government bond | 26 | source of the safe rate | bond-pricing:36-44; bond-yield:39-48

**Unit 4 – Risk and the rate**
30. Risk and expected value | risk, expected value, risk premium | 24 | why risky cash gets a higher rate | num-probability; spine-10:115-134
31. The safe rate | risk-free rate, default | 27, 29-30 | floor of every rate | spine-07:67-72; fol-sov-ratings:49-50
32. Why shares pay extra | diversification, equity risk premium | 30-31 | market premium | spine-07:73-78, :98-116; fol-erp:50-57
33. Some businesses swing more | beta, industry beta | 32 | company-specific rate | spine-07:79-84
34. What owners require (worked) | cost of equity | 31-33 | owners' rate | spine-07; risk-capm
35. What lenders charge | cost of debt, default spread, credit rating | 9, 29, 31 | lenders' rate | bond-credit-spreads:40-46; spine-cost-of-capital:73-84
36. One rate for all the money (worked) | cost of capital, market-value weights | 11, 34-35 | lever 4 | spine-cost-of-capital; cf-wacc

**Unit 5 – The value machine**
37. Worth its future cash, today | discounted cash flow, forecast | 21, 26, 36 | the machine | spine-01:124-128; val-dcf:81-94
38. First valuation: a steady company | stable growth | 28, 37 | a whole value | new; spine-08:303
39. From business to one share | business value, equity value, value per share | 8, 10, 16, 38 | the bridge | spine-09:33-37, :378-390
40. Leases are debt | lease, lease liability | 26, 39 | bridge item | spine-09; fs-leases-debt; ana-commitments-debt:59-73
41. Staff paid in shares | employee options, stock-based pay, diluted shares | 10, 39 | bridge item | spine-09:106-111; der-options:41-47
42. Forecast years, then steady | forecast period, terminal value | 38 | two-stage shape | spine-08
43. Nothing outgrows the economy | — | 27, 31, 42 | growth cap | spine-08:51-52; ana-build-valuation:215; eco-gdp-cycles
44. Steady growth still costs money | reinvestment rate | 22, 43 | consistent terminal value | spine-06:63-64; jud-assumptions

**Unit 6 – The four levers (plus survival)**
45. Four settings decide a value | lever | 37-44 | the lever map | fol-tesla-2020:102-118
46. Lever 1: sales growth from the base year | base year, revenue growth path | 14, 25, 45 | lever 1 | fol-tesla-2020:104
47. Lever 1 checked: market × share | total market, market share, take rate | 46 | sanity check | spine-04; val-young
48. Lever 2: target margin and path | target margin | 6, 23, 46 | lever 2 | spine-05; fol-tesla-2020
49. Why rivals cap margins | competitive edge, barriers to entry | 48 | sanity check | spine-05:41-47; eco-micro-competition:40-52
50. Tax over time | loss carryforward, effective tax rate, marginal tax rate | 9, 46 | tax line | fs-tax; spine-03:66-67; spine-annual-report:28-35
51. Lever 3: sales per dollar invested | sales-to-capital | 21-22, 46 | lever 3 plus arithmetic | spine-06; spine-03
52. Does growth add value? | — | 22, 36, 51 | sanity check | spine-06:117-134
53. Lever 4: risk falls with age | cost-of-capital path | 36, 42 | lever 4 over time | spine-07 and spine-cost-of-capital reveals
54. Failure is not in the rate | chance of failure, going concern, distress sale | 30, 39 | survival weighting | spine-10; val-distress
55. All the levers at once | — | 45-54 | full valuation of a young growth company | spine-01 Amazon Case; spine-annual-report; ana-build-valuation

**Unit 7 – From story to numbers**
56. Every value starts as a story | narrative | 55 | story first | spine-11:83-92
57. Possible, plausible, probable | plausible | 56 | story tests | fol-tesla-2020:118; spine-11
58. Each part of the story sets a lever | — | 57 | mapping | spine-11 (one Case); val-young:95-104
59. A value is a range | range, sensitivity | 58 | uncertainty | spine-14
60. When news arrives | story break | 59 | updating | spine-11 case 2; spine-14 anchoring

**Unit 8 – Pricing**
61. A multiple is a scaled price | multiple, price-to-earnings, price-to-sales | 11, 13, 15 | pricing tool | spine-12; val-multiples
62. Match like with like | EBITDA, enterprise multiple | 19, 39, 61 | consistency | spine-12:65-79; spine-06 EBITDA card
63. Peers and the median | peer group | 23, 62 | a "priced at" number | spine-12 (WeWork vs IWG)
64. What a multiple assumes | justified multiple | 52, 63 | explaining gaps | spine-12 decoder; val-multiples:61, :68
65. Reading a price backwards | implied | 55, 59, 64 | critique any price | spine-13; spine-02 break-even; val-implied-erp:63-78

**Unit 9 – Every kind of company**
66. Young companies and IPOs | IPO, new shares raised | 41, 54-58 | young/IPO firms | spine-15 Zomato; spine-04/11; cf-venture; fol-twitter-ipo
67. (optional) Mature companies, as run vs run better | value of control | 38, 52 | mature firms | new
68. Shrinking and distressed companies | negative growth | 44, 54 | distressed firms | spine-10; val-distress
69. Cyclical and commodity firms | cyclical, normal year | 23, 48 | cyclicals | real-assets:43-56; eco-gdp-cycles
70. Companies built on ideas | R&D, capitalising | 19, 22 | intangibles | fol-tesla-2020:163-174; fol-roe
71. Country risk | country risk premium, sovereign rating | 32, 35 | emerging markets (engine gap) | val-india:89-107; ana-india-transfer:86-92; sov-default-country-risk
72. One currency throughout | exchange rate, currency consistency | 27, 31, 36 | multinationals | val-india:89-96; fx-basics
73. Banks | regulatory capital, return on equity, price-to-book | 17, 34, 61 | banks (engine gap) | val-banks; fs-ratios; ana-india-transfer
74. (optional) Groups that own other companies | cross-holding, minority interest, sum of the parts | 39 | holding companies | spine-09:68-69, :82-86

**Unit 10 – Capstone**
75. Finding every input | notes to the accounts | 14-23, 46-54 | gathering inputs | spine-annual-report (one country first)
76. Value a company start to finish, as of a past date | as-of date | all | full valuation and verdict | spine-15; ana-build-valuation; the Own Case Assignment

**Where today's Spine files go:**
- spine-01: lessons 12 and 55
- spine-02: 24-26
- spine-03: 21
- spine-statements: 15-20
- spine-04: 47
- spine-05: 48-49
- spine-06: 51-52
- spine-07: 31-34
- spine-cost-of-capital: 35-36
- spine-08: 42-43
- spine-09: 39-41
- spine-10: 54 and 68
- spine-11: 56-58 and 60
- spine-12: 61-64
- spine-13: 65
- spine-14: 59
- spine-15: 66 and 76
- spine-annual-report: 14 and 75

Every Spine file is reused, so the ids can be kept. Lessons 1-11, 13, 23, 27-30, 38, 44-46, 50, 53, 67 and 69-74 need new files or Electives folded in.