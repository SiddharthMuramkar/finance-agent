# Adversarial verification of /tmp/value-it-audit/report.md

Checked 2026-11-19 against the repo (/home/fedora/developer/finance-agent, branch feat/visual-polish-batch-1). No repo file touched.
Scripts used: /tmp/value-it-audit/verify-scripts/first.py (first Spine use of a pattern, comments and `source` excluded), wc.py (word counts).
Paths: `T/` = course/topics/.

Note: report.md line 2 says "I could not create report.md"; the file exists (written later). Stale line only.

## 1. Term-order table (28 rows re-read)

CONFIRMED (cited lines say what the report says, and no earlier Topic teaches the term on the main path):
- Row 1 revenue: no `terms` entry anywhere on the Spine; only a gloss in T/spine-03-cash.yaml:16 and the take-rate card T/spine-04-growth.yaml:92-97. (Caveat in WRONG #3.)
- Row 2 DCF method: T/spine-01-worth.yaml:119 "Set the four levers and code works out a value"; never put together on the main path.
- Row 6 EMI: T/spine-02-money-later.yaml:65.
- Row 7 tax rate, row 8 working capital (the word appears only in YAML comments, T/spine-03-cash.yaml:175, T/spine-statements.yaml:197), row 9 depreciation (word only in T/spine-06-growth-cost.yaml:40 story; EBITDA card :93 glosses "wearing out").
- Row 11 goodwill amortisation: T/spine-03-cash.yaml:347 ("spreading the price it paid for HomeGrocer").
- Row 12 annual report: scene caption at pos 3 (T/spine-03-cash.yaml scenes "the annual report for 2000"), card at pos 18 (T/spine-annual-report.yaml:144). Pos 4 story only says it "holds three pages that matter".
- Row 14 credit sale: T/spine-statements.yaml:452-459. Row 15 book vs market: :302-316.
- Row 17 multiples: T/spine-01-worth.yaml:215 "ten times its sales"; taught pos 14.
- Row 18 failure: T/spine-03-cash.yaml:313, T/spine-04-growth.yaml:239,255,431, T/spine-05-margins.yaml:195,299; taught pos 12 (T/spine-10-survival).
- Row 19 standard error: T/spine-07-risk.yaml story "the standard error, is 0.50".
- Row 20 equity bridge: T/spine-01-worth.yaml:127 (goDeeper), :182 band; value-levers-model.ts:460.
- Row 24 terminal value: "After year 10, in today's money" bar, value-levers-model.ts:481, drawn even on firstLook (value-levers-view.tsx:323).
- Row 33 implied: T/spine-07-risk.yaml:24 -> card T/spine-13-price-assumes.yaml:79.
- Row 36, 37, 39, 44, 47, 49: lines read as cited. Operating margin: concept bracket T/spine-01-worth.yaml:120, Workbench label "Operating margin once mature" value-levers-model.ts:216, taught T/spine-05-margins.yaml:38-47. Owner's complaint verified.

WRONG / overstated:
1. Row 3 "cost of capital that changes over time: never". It is stated with a reason at pos 8 story (T/spine-07-risk.yaml: beta "fading to 1.00 by year ten as Amazon matures"), on the visible pos 9 card (T/spine-cost-of-capital.yaml card line 4: "12.84% with almost no debt at first, 9.61% once mature with 15% of debt") and pos 10 story ("easing to 9.61% by year 10 as Amazon matures"). Thin, not never. Same fix for worst-10 #3.
2. Row 48 "multi-year discounting only in goDeeper/primer, yet tested at :393-417". The visible card says it: T/spine-02-money-later.yaml:377 "The higher the rate, or the longer the wait, the less a later payment is worth." The tries at :393-417 test direction only. Only the per-year sum is goDeeper (:52). Also fixes depth-table row pos 2.
3. Headline 1 / row 1 "no card for revenue anywhere". The Value levers Full sheet has an inline Revenue Lingo card (src/widgets/workbench/full-sheet-words.ts:18-26; rendered value-levers-view.tsx:446-483 inside the collapsed "Go deeper: the Full sheet"). On demand, not main path, but it exists.
4. Row 21 stock split, gap 10. Story :20 never says "split"; pos 6's own reveal glosses it: T/spine-05-margins.yaml:31-32 "split its shares 5-for-1 ... so one February 2020 share became 15". Same-Topic gloss (after the Check).
5. Row 10 IPO. Pos 3 (T/spine-03-cash.yaml:29-30 "sold shares to the public") and pos 5 (T/spine-04-growth.yaml:40-41 "priced its shares at $45 ... began trading the next day") are plain words. The jargon first appears: "offer price" T/spine-06-growth-cost.yaml question explanation (pos 7); "IPO" T/spine-09-to-one-share.yaml WeWork story (pos 11, Tutor-worded) and T/spine-12 reveal.
6. Row 4 market value. Pos 1 :245 says the idea in plain words ("counting every share at that day's price"). The term first appears at pos 6 in a fix that defines it (T/spine-05-margins.yaml:251). "Never carded" is true.
7. Row 5 bond/yield "never". One-line definitions exist: T/spine-02-money-later.yaml:214-215 connection ("A bond is a loan paid back in fixed payments over years", shown in the Notebook) and the risk-free-rate Lingo example T/spine-07-risk.yaml:70. The main path still never teaches them, and the visible card uses "a safe bond's yield" with no gloss. Keep the row, fix "never" to "glossed only off the main path".
8. Row 28 percentage point "taught pos 9". The pos 9 primer assumes it ("a hundredth of a percentage point", T/spine-cost-of-capital.yaml:104-109). It is first used at pos 1 (:148) and never taught on the Spine; only the Elective num-percent-bps teaches it.
9. Row 22 re-levering "tested". The questions put the re-levered rate in the label (T/spine-cost-of-capital.yaml:158 "13.27%, borrowing 30% at 8%"). The Learner is never asked to re-lever.

## 2. Headline findings

- H1 CONFIRMED with corrections: the after-year-10 bar is always on screen. "Chance it fails" sits under a collapsed "More settings" (value-levers-model.ts:258 `more: true`; view :312-319), and the 17-row Full sheet is collapsed (17 rows confirmed). They are one tap away, not "on screen". Revenue: see WRONG #3.
- H2 CONFIRMED: cash comes before statements (T/spine-03-cash.yaml:52-53; the file's own comment admits it). Lever order is roughly 3 -> 1 -> 2 -> 3 -> 4 (reinvestment idea at pos 3, ratio at pos 7). "338 terms / 46%": UNSURE (hand tally).
- H3 CONFIRMED: exactly 1 card (spine-check.ts:60-61). L3 card limits (lesson-lint.ts:133-134). Concept is never drawn: the card replaces it at the converted Concept step (context.ts:30-36, 175). Word caps are 80 at concept, your turn and check, and 120 elsewhere (reply-checks.ts:80-86). All five sums are unworked: the spine-07 card lists 6.5%, 1.60 and 4% but never adds them; the expected-value card and concept have no numbers; the terminal-value formula is only in goDeeper. My word counts: teaching 255-346, testing 768-1,288 (report: 243-332 and 745-1,330). Same picture, different method.
- H4 CONFIRMED: 12.84% appears in spine-07 only in the reveal and in labels. Hidden baselines: T/spine-06-growth-cost.yaml:203-205 ($8.4bn, 12.35% only in labels); T/spine-11-story-to-numbers.yaml:173-174 (comment) tested at :202-204; T/spine-15-value-yourself.yaml:170-173. The spine-09 :239 figure is printed in the label itself (weak example).
- H5 PARTLY WRONG: the Amazon Feb-2000 Case (valuationFrom amazon-dcf-2000) is in **8** of 18 Topics, not 7: spine-01, spine-07, spine-cost-of-capital, **spine-08-far-future** (case spine-08-amazon-2000), spine-09, spine-13, spine-15, spine-annual-report. Lingo repeats: **11 exact** of 71; 13 only if renames count (revenue slice = take rate, operating profit = operating income). The contradiction T/spine-04-growth.yaml:59-60 vs T/spine-05-margins.yaml:188 is CONFIRMED. The Insight repeat T/spine-01-worth.yaml:76 vs T/spine-13-price-assumes.yaml:100 is CONFIRMED.
- H6 names: "Damodaran" 125 in 14/18 Spine Topics is an exact match. About 76 of the 125 are in fields code draws (cards, tries, questions, terms, connections, chips, casts); about 49 are Tutor-only (concept, goDeeper, case title, story, reveal). "Professor": I count 28, not 25. Gurley 13 matches. Off-Spine: Damodaran 126 (not 124), Zitron 43, the rest exact. App list: see section 3.
- H7 CONFIRMED: inflation has 0 Spine hits, and no R&D or country-risk teaching. The only end-to-end recipe is T/ana-build-valuation.yaml:201-230.
- H8 CONFIRMED: see section 4.

## 3. Name exposure: what is truly learner-visible

CONFIRMED visible:
- copy.ts:256-260: the Home and How it works source line.
- copy.ts:464-466: the About page.
- examples.ts:127, 131: rendered on the Example page.
- LeversWidget.tsx:481-482: on the public Example page via src/app/(site)/signal-widget.tsx.
- Market-reading credits: readings.ts:113; yardsticks.ts:36, 60; drawn at market-readings-view.tsx:28-36.
- range-check-view.tsx:19-21.
- Library credit lines: sources.json:8, 20, 31; drawn at reply-markdown.tsx:79.
- Follow and Judge titles at outline.yaml:1472, 1485, 1501, 1516, 1528, 1585 (Damodaran) and 1542, 1556, 1572, 1663 (Zitron). The Topic files carry the same titles.
- Scene casts: T/spine-11:167-168, T/spine-13:121, T/spine-14:105.
- caseStory chips in 6 Spine files: spine-01:100, spine-04:173, spine-05:154, spine-11:175, spine-13:113, spine-14:96.
- Connections shown in the Notebook: spine-01:109, spine-04:219, spine-05:180, spine-14:119.
- Tutor-only, CONFIRMED: Case titles (context.ts:164), instructions.ts:187-188 and :306, wacc-stack-model.ts:420, value-levers-model.ts:866.

WRONG:
- "10 widget defaults (set-workbench.ts:224-352)" and "recipe source titles (:191-193, :263-264, :533-535)" are not defaults and not learner-visible. They are the recipe `examples`, which only tests read (recipes.test.ts:26-28, set-story.test.ts:212, guided-tasks-truth.test.ts). No production code reads `recipe.examples`.
  - The real default chip label is "The Case's story" (value-levers-model.ts:663).
  - The Tutor meets the name through the schema description `such as "Damodaran's story"` (set-workbench.ts:125), sent via recipeSignature (src/widgets/recipes/define.ts:240-249). It reaches the screen only if the Tutor copies it.
- "Follow/Judge/Analyse built on a named writer: 19 of 23". It is **18** of 23 (case `piece.author`). The count of 8 that ask for a paste is CONFIRMED.

## 4. Code constraints

CONFIRMED:
- spine-check.ts:
  - one card (:60-61);
  - 3-5 terms (SPINE_TERMS), capped at 4 by MAX_NEW_WORDS (beginner-check.ts:13);
  - 6-8 Quick tries;
  - at most 2 quiz Checks, 4 per attempt, pass at 3.
- Lingo cards show only when asked (companion.ts:16-19, 117-137).
- No term-order check exists. The Tutor sees only the current Topic's terms (context.ts:139-141).
- SPINE_LENGTH and SPINE_MAX are 18; Spine Topics may not have prerequisites (outline.ts:15-21, 136).
- SPINE_LIVE_WITH fallback (navigator.ts:110-128) and spinePassed re-lock (:137-140; own-cases.ts:44).
- Multi-Check Topics: num-percent-bps has 4 Checks, 4 cards and 16 tries; num-compounding has 5, 5 and 16.
- `required` defaults to false (map.ts:281, 349; navigator.ts:86-89).
- 17 non-test files list step names. 93 Topics are on LESSON_NOT_YET_CONVERTED.
- HOME_TOPIC_ID and the Example topicIds as cited. check-course.mjs:85-86 (readings).

WRONG or overstated:
- "Every Spine Topic needs a Case with a valuation block". The annuity and cash_waterfall Topics are exempt (spine-check.ts:40-43).
- "Engine cannot value country risk". There is no country-risk input, but any 10-year cost-of-capital path can be typed, so country risk can be baked in by hand. The gap is a missing input, not an impossibility.
- "(c) new step needs a migration (ADR 0001)". ADR 0001:22 does say so, but topic_progress.step is free text (schema.ts:165). Adding a step needs no schema change; only removing one strands rows.
- "51 src tests and 12 e2e specs". By exact Spine id: 50 src test files and 9 e2e specs. With any "spine-" string: 56 src and 11 specs plus 2 support files. Order of magnitude right.
- In code-facts.md (not the report): "firstLook relabels lever 1" is wrong. "Sales in year 10" is the label always (value-levers-model.ts:203). firstLook only hides the after-year-10 share readout (:763, :865; view :266-267).

## 5. Draft curriculum (76 lessons)

CONFIRMED:
- 76 lessons, 74 core.
- Every prerequisite number is earlier.
- No lesson lists more than 3 new terms.
- Covers the four levers, terminal value, the bridge, failure, relative valuation, pricing vs value, story to numbers, updating, and the capstone.

Term-before-lesson violations in the draft:
- "revenue" is used at L46 ("revenue growth path") and L47, but L1 introduces "sales". Pending owner decision 2.
- "earnings" is used at L61 (price-to-earnings), but L9 introduces "net profit". Earnings per share (skill-tree B3) is never introduced, so a gap the report lists stays unfixed.
- "enterprise multiple" is used at L62, but L39 says "business value". Pending decision 2.
- "dividend", "buyback" (payouts) and "index" are never introduced. L65 reuses spine-13 and val-implied-erp:63-78, whose implied premium is read from an index's payouts. L73 (banks) needs cash paid to owners.
- L59 reuses spine-14, which rests on "simulation" and "percentile"; neither is in any draft term list.
- "price" is introduced at L12 but used at L2 ("selling price") and L10 ("share price"). Everyday sense; cosmetic.

End state:
- Mature companies (L67) and holding companies (L74, with cross-holdings and minority interests in the bridge) are optional. "Any company" is therefore partly optional.
- "Assets in place vs growth" (D4-D5) and "parsimony" (E8) have no lesson.

## 6. UNSURE (not reproducible)

- The ~338 terms / ~155 untaught (46%) and the per-Topic term tallies (section 3): hand counts.
- Depth scores (/5).
- "about 100 he/his".
- The off-Spine CORE / SUPPORTING / NOT NEEDED triage.
- Case Data source strings (in the database).
