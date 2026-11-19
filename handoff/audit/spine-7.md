# Spine audit, positions 7-12 (spine-06-growth-cost ... spine-10-survival)

Conventions. `Lnn` = line in the Topic file under audit (`course/topics/<id>.yaml`). Earlier Topics are cited `spine-0x-....yaml:nn` (all in `course/topics/`). "Card" = Lingo card (`terms[]`). Explanation levels: none / one-line / example (one line plus a worked or analogy example) / in depth. "Here" = introduced in this Topic; "assumed" = used as if known. Fact-finding only; no repo file was touched.

## 0. Cross-cutting findings (these explain much of the "slop")

1. **The four-word cap pushes core terms out.** `MAX_NEW_WORDS = 4` Lingo terms per Spine Topic (`src/course/beginner-check.ts:13`). The authors' own comments say they met it by cutting words: `spine-09-to-one-share.yaml:80` ("the four-word cap is met by cutting the words"), `spine-10-survival.yaml:67-69`. Result: the central term often has no card (cost of equity in spine-07, WACC in spine-cost-of-capital), while cap slots go to repeats (reinvestment re-carded in spine-06 after `spine-03-cash.yaml:99`; cost of capital re-carded in spine-cost-of-capital after `spine-01-worth.yaml:60`) or to side words (EBITDA, basis point).
2. **Lingo cards only appear when the learner asks.** Rule 1 of the companion picker: a Lingo card shows "only when the Learner asked what a word means" (`src/tutor/companion.ts:16-19`). So a term used in the Moment gets no card at that moment unless someone wrote a scene card. Of these six Topics only spine-08 has one (`far-lingo`, L114-124).
3. **The Tutor has to squeeze the teaching.** The reply limit is 80 words at concept, your-turn and Check, and 120 at story, explore, reveal and principle (`src/tutor/instructions.ts:152`). The concepts here run 149-198 words and the stories 152-233 words, many of them numbers.
4. **Checks come before the reveal** (`src/tutor/instructions.ts:178`), yet Checks quote numbers that first appear in the reveal: spine-07 (12.84%, 12.90%), spine-cost-of-capital (12.84%), spine-09 ($1.75bn).
5. **Every Topic uses the same question template:** which_lever, price_assumes, predict, direction, cannot_hold, price_or_value. Each Check has a generic price-or-value drill. Several computed questions test how far a widget slider moves the value, not the Topic's mechanic.
6. **Amazon (Feb 2000) runs through positions 8-11, but its base story is never restated.** That story is $39bn of sales in year 10, a 10% margin and $3 of sales per $1 invested (`spine-01-worth.yaml:120,330`). Quizzes in 8-11 still move "Margin 10% to 8%" and "Sales to capital 3 to 4".
7. **Teaching text is a small share of each Topic.** Main-path teaching (concept + card lines + term `means`) runs 267-313 words per Topic, against 768-1,170 words of question and quick-try text. Counts are in each section.
8. **File headers and outline disagree on numbering.** `spine-08-far-future.yaml:1` says "Spine Topic 9" and `spine-09-to-one-share.yaml:1` says "Spine Topic 9", but `course/outline.yaml:166,181` gives spine 10 and 11. The outline's asOf dates are 2000-02-01 (`outline.yaml:141,157,171,185`); the Topic files say 2000-02-03. Author-side only.
9. **"Chance it fails" is used five or six Topics before spine-10 teaches it.** It is a computed-question option at `spine-03-cash.yaml:313`, `spine-04-growth.yaml:239,255,431` and `spine-05-margins.yaml:195,299`, and a hidden ("more") lever on every value_levers bench (`src/widgets/workbench/value-levers-model.ts:248-259`).

---

## Position 7: spine-06-growth-cost

### 1. Basics
- Title: "What does growth cost?" (L9). Goal: "Judge whether a company's growth adds value by setting what new capital earns against what it costs" (L10). 13 min (L12; `outline.yaml:117-132`, spine: 7). Case: Webvan, 30 Mar 2000.

### 2. Flow
- **Moment** (story L20-32 + scene `gcost-opening` L102-116): Webvan has one centre running at under 25% of capacity and plans 26 more at $30-35m each. It claims a full centre sells $300m a year and keeps 12%. Then four return and cost-of-capital percentages for grocers and internet firms "in Damodaran's industry data". Question: will each new centre earn more than its money costs?
- **Concept** (L43-51 + scene `gcost-two-shops` L117-134 + Primer "Spending that lasts" L142-160): growth needs capital first; reinvestment; sales to capital; return on capital; growth adds value only when the return on new capital beats the cost of capital. Ends with an unnamed reinvestment-rate idea. The Primer teaches EBITDA.
- **Explore** (L170-183, insight L162-168): value_levers in ROIC mode on Webvan's claims. Learner lowers the margin and sales-to-capital until the "Return on new capital" readout falls below its cost, then sees size stop helping.
- **Your turn** (quickTries L280-338): 7 multiple-choice tries (4.63% vs 15.27%; 15.66% vs 8.75%; two shops; a third vs all of profit put back; Oakland fewer sales; slow fill; what a sales-to-capital of 4 means).
- **Check** (pool L193-263, 4 per attempt; conversation L339-348): lever ranking, price-assumes, predict, direction, cannot-hold, price-or-value (first-day close). The conversation asks the learner to judge an analyst's "could only add value" claim.
- **Reveal** (L33-41): plan abandoned, $259.8m spent, shut 9 Jul 2001; the payback claim was in EBITDA and ignored the time value of money.
- **Principle** (L53-55): growth is bought with capital; ask what each new dollar earns.
- **Word count:** concept 183 + card lines 50 + term means 80 = **313** main path; +goDeeper 131 = 444; (+primer 51, term examples 66). Questions 471 + quick tries/talk 499 = 970.

### 3. Term ledger
| Term / stand-in | First appears | Explained there | Here / assumed | Earlier Spine teaching |
|---|---|---|---|---|
| sales / "sold $13.3 million" (revenue) | story L23 | none | assumed | `spine-03-cash.yaml:16` (goal "revenue (its sales)"), `spine-04-growth.yaml:50` |
| "lost $144.6 million" (net loss) | story L23 | none | assumed | `spine-statements.yaml:102-103` (net income card) |
| capacity / utilisation | story L22-24 ("built to handle ... 18 supermarkets", "under 25% of the capacity") | context only; link to sales-to-capital only in Q explanation L241 and quickTry L316-317 | here | NONE |
| capital spending ("$300m-$350m of spending in 2000") | story L26 | none in story (reinvestment card inStory L79) | assumed | `spine-03-cash.yaml:99-104` (reinvestment card), `:204-208` (primer) |
| "keep 12% as operating profit" (operating margin) | story L27 | none (third wording after "operating margin" and "operating income") | assumed | `spine-01-worth.yaml:54-55`, `spine-05-margins.yaml:38,71-72` (in depth) |
| sold shares to the public at $15 (IPO / offer price) | story L27-28 | none | assumed | mention only: `spine-03-cash.yaml:28-30`, Q `:283-287`; never defined |
| return on capital ("earning 15.66% a year on their capital") | story L29 | none in story; concept L45-46 one sentence (directional); card L86-91 example (on request) | here, **used in Moment before the concept** | NONE |
| capital (noun) | story L29 | concept L44 by examples ("warehouses, trucks, systems, stock") | here | only inside "cost of capital", `spine-01-worth.yaml:60` |
| cost of capital ("which cost them 8.75%") | story L29 | none in story; concept L46-47 reframes it as "the return investors could get elsewhere for the same risk" (new opportunity-cost framing) | assumed | `spine-01-worth.yaml:60-61` (one line, as "how risky it is"); built only at pos 8-9 |
| "industry data" | story L28-29 | none | assumed | NONE |
| reinvestment | concept L45 | one line + card L74-79 (bakery) | re-introduced (duplicate card) | `spine-03-cash.yaml:99-100` card, `:63` goDeeper |
| sales to capital | concept L45 | one line + card L80-85 (food truck $3 per $1) | name here, idea assumed | `spine-01-worth.yaml:120,330` ("$3 of sales for each dollar invested"), `spine-03-cash.yaml:51` |
| "keeps more of each sale" | concept L46 | assumed | assumed | spine-01, spine-05 as above |
| return on **new** capital | concept L46 | none (new vs existing capital never told apart) | here | NONE |
| how margin and sales-to-capital make the return | concept L45-46 | directional only; no formula. The widget computes margin x sales-to-capital x (1 - tax) (`src/finance/valuation-case.ts:327-328`) | here, hidden | NONE |
| value destroyed by growth | concept L48 | asserted | here | NONE |
| reinvestment rate, unnamed ("put back nearly all its profit to grow a little") | concept L49-51 | none (named only in goDeeper L63-64); tested in quickTry L306-313 | here | NONE |
| loan cost (Asha/Ravi branches) | scene L122-134 | plain analogy | here | NONE |
| EBITDA | primer L146-148 (at concept); card L92-97; reveal L39-40 | primer 3 lines; card one line + taxi example | here (concept text never uses it) | NONE |
| depreciation ("cost of buildings and equipment wearing out"), the word itself | card L93; word in reveal L40 | one clause; the word "depreciation" never defined | assumed | idea: `spine-03-cash.yaml:206-208`, `spine-statements.yaml:47` |
| "spending on things that last" | primer L146 | one line | assumed | `spine-03-cash.yaml:204-208`; **same Primer title "Spending that lasts"** reused (`spine-03-cash.yaml:204` vs L144) |
| interest ("before interest") | card L93 | none | assumed | `spine-03-cash.yaml:88` |
| widget levers: "Sales in year 10", "Operating margin once mature", "Sales for each $1 invested", "Cost of capital while it grows", hidden "Chance it fails" | explore (`value-levers-model.ts:201-251`) | labels only; "while it grows" vs mature never explained here | assumed | mature margin `spine-05-margins.yaml:77-78`; chance of failure untaught until pos 12 |
| "Return on new capital 78%, above the 12.35% it costs" (readout on opening settings: 12 x 10 x 0.65) | explore (`value-levers-model.ts:522-526`); note L183 | none: 78%, 12.35% and the formula appear nowhere in the text | here | NONE |
| "Cash it makes each year, then after year 10" bars (terminal value) | explore (`value-levers-model.ts:348,481`; `value-levers-view.tsx:323`); insight hint L168 "watch the early cash-flow bars" | none | **used before taught** (pos 10) | NONE |
| revenue in year 10 $8.4bn | Q L203, L217, L225-226 | none (28 x $300m is only an author comment, `spine-statements.yaml:321`) | here, unexplained | NONE |
| sales per $1 invested = $10 | Q L204 | none (story gives $300m / $30-35m) | here, unexplained | NONE |
| cost of capital 12.35% | Q L205, L215 | none (story gives 8.75% and 15.27%) | here, unexplained | NONE |
| "How risky it is" (stand-in for cost of capital) | Q L239 | none | assumed | `spine-01-worth.yaml:61,117-118` |
| market value ("a market value of $7.9 billion"), first day of trading | Q L256 | only in a mistake fix L260 | assumed | quiz-only: `spine-05-margins.yaml:247-253`; never carded |
| bankruptcy protection | reveal L38 | none | assumed | mention only: `spine-03-cash.yaml:39` |
| payback claim | reveal L39 | none | here | NONE |
| head-office costs | reveal L40 | none | here | NONE |
| time value of money (phrase) | reveal L40-41 | none | assumed | idea: `spine-02-money-later.yaml:39`; phrase never used before |
| return on equity, "equity" | goDeeper L60-61 | one line | here (optional) | "equity" never defined in Spine 1-6 (only `spine-04-growth.yaml:46` reveal) |
| reinvestment rate (named), after-tax operating profit | goDeeper L63-64 | one line | here (optional) | NONE |
| operating loss | goDeeper L65 | none | assumed | `spine-03-cash.yaml:63` |
| Bechtel (company name) | story L25 | none | — | — |

### 4. Jumps
- **J1, story L28-30:** "Damodaran's industry data of January 1999 showed grocers earning 15.66% a year on their capital, which cost them 8.75%, and internet companies earning 4.63% on capital that cost them 15.27%." Two new ideas (return on capital, cost of capital as a pair), four numbers and an unknown name, all in the Moment, before the concept defines either (L45).
- **J2, concept L45:** "Sales to capital says how many dollars ... What that capital earns is the return on capital". Two ratios in two sentences, then "return on new capital" (L46) with no new-vs-old distinction. No worked example ties them, e.g. "$1 of capital brings $10 of sales; keeping 12% after tax gives X% a year".
- **J3, concept L49-51:** "A company that must put back nearly all its profit to grow a little earns little on that money" drops the reinvestment-rate idea at the end, unnamed. It is then tested (quickTry L308 "One puts back a third of its profit ..., the other puts back all of it").
- **J4, explore readout:** on Webvan's claims it shows about 78% "Return on new capital" against "the 12.35% it costs". The story's anchors are 15.66% and 4.63%. Nothing explains 78%, 12.35% or how the readout is computed (`src/finance/valuation-case.ts:328`).
- **J5, Q L203-205:** "Revenue in year 10 $8.4bn to $4.2bn", "Sales for each $1 invested $10 to $4", "Cost of capital 12.35% to 15%". Three baselines the Topic never states.
- **J6, insight hint L168:** "watch the early cash-flow bars". The bench also draws an "after year 10" bar, three Topics before terminal value.
- **J7, reveal L39-41:** "Its payback claim was an EBITDA figure, before tax, depreciation and head-office costs, that ignored the time value of money." Five unexplained items in one sentence. EBITDA gets a card and a Primer although the concept never uses it.
- **J8, Q L256-262:** a price-or-value drill on the first-day close tests spine-01's idea, not growth cost.
- **J9, Q L208-217 (price_assumes):** "keeping 17%", "$16 of sales for each $1", "10% cost of capital". It can only be answered by reading the widget's sensitivities, not by reasoning from the concept.

### 5. Names (learner-visible)
- "Damodaran": story L28, story L31, term inStory L91. **Count 3.** (Also in question `source` L253, which the quiz panel does not render: `src/app/quiz-panel.tsx` shows only `explanation`.) No "professor".

### 6. Depth verdict: 2/5
1. Return on capital and sales to capital are only described directionally (L45-46). No formula, no worked numbers, yet the widget shows 78% with no explanation.
2. The Moment front-loads untaught ratios and a named outsider (L28-31). Questions rest on baselines never given (L203-205).
3. Side material crowds out the core mechanic: EBITDA card and Primer (L92-97, L142-160), return on equity and reinvestment rate (L59-66), a price-or-value drill (L254-263). The core mechanic is how a growth plan becomes reinvestment: new sales ÷ sales-to-capital = money to invest, which comes off cash flow.

### 7. Valuation skill and gaps
- **Contributes:** lever 3 (reinvestment / sales-to-capital) and the "return on new capital vs cost of capital" test for whether growth creates value.
- **Leaves out:**
  - the reinvestment arithmetic: reinvestment = change in revenue ÷ sales-to-capital, and how it feeds free cash flow (after-tax operating income minus reinvestment);
  - after-tax margin x sales-to-capital = return on capital;
  - how to pick a sales-to-capital (company history, industry average);
  - tax on operating income;
  - growth = reinvestment rate x return on capital (needed later for terminal value).

---

## Position 8: spine-07-risk

### 1. Basics
- Title: "Risk: what return should shareholders require?" (L9). Goal: "Build the cost of equity from its layers, and judge how much the choice of beta moves a value" (L10). 13 min (L12; `outline.yaml:133-148`, spine: 8). Case: Amazon, 3 Feb 2000.

### 2. Flow
- **Moment** (story L21-29; **no scene**): Damodaran needs a discount rate. 6.5% Treasury bond; 4% equity risk premium "implied" 1960-1999; beta 2.29 (own measure, standard error 0.50) vs 1.60 (internet retailers) vs 1.00 (specialty retailers); picks 1.60 fading to 1.00. Ends with six numbers and no result.
- **Concept** (L39-47 + Primer "Spreading risk" L98-116): cost of equity = risk-free rate + beta x premium; only risk you cannot spread away earns a premium; borrow peers' beta for a young firm; Amazon has almost no debt; the rate moves value less than growth and margins.
- **Explore** (L126-138, insight L118-124): wacc_stack, equity-led. Move beta between 1.0 and 2.29; value moves about a fifth; no beta reaches $84.
- **Your turn** (L244-296): 6 tries (which part pays for risk; peer beta; beta 1.6 vs 1; beta can't explain price; computed lever; ask about story first).
- **Check** (pool L146-227, 4 of 7; conversation L297-301).
- **Reveal** (L30-37): 12.90% cost of equity, 12.84% year-one rate, $35.08 vs $84; margins and growth mattered most; Jan 2001 revaluation $20.83.
- **Principle** (L49-51).
- **Word count:** concept 149 + card lines 57 + means 61 = **267**; +goDeeper 39 = 306 (+primer 51, examples 65). Questions 544 + tries/talk 395 = 939.

### 3. Term ledger
| Term / stand-in | First appears | Explained there | Here / assumed | Earlier Spine teaching |
|---|---|---|---|---|
| price ($84) | story L21 | none | assumed | `spine-01-worth.yaml:42-43` |
| discount rate | story L22 | inline: "the return investors should require for waiting and for the risk they bear" | assumed (link to required return made here) | `spine-02-money-later.yaml:79-80` card |
| US Treasury bond / "bond" | story L23 | none: "bond" and "Treasury" are never defined in Spine 1-8 | assumed | only "safe government loans" in `spine-02-money-later.yaml:36` (reveal) |
| yield ("pays 6.5%"; "Treasury yield") | story L23; word at card pro L70, card line L239, Q L198, quickTry L247 | none | assumed | NONE |
| risk-free rate | story L23 | concept L42 one line; card L67-72 example | here | NONE |
| equity risk premium (and the word "equity") | story L24 | inline gloss + card L73-78 example | here; "equity" undefined | NONE |
| "average shares" / the market | story L24 | none | assumed | NONE |
| implied premium ("the average the market implied from 1960 to 1999") | story L24 | none on main path; goDeeper L58-59 one sentence | here, unexplained | NONE |
| beta / relative risk | story L25 | card L79-84 example; concept L43 | here | only "how risky it is", `spine-01-worth.yaml:61` |
| regression beta ("from two years of Amazon's weekly prices, gives 2.29") | story L26 | none (how it is measured) | here | NONE |
| standard error ("its likely miss, the standard error, is 0.50") | story L27 | 3-word gloss; no card; never used again | here | NONE |
| industry / peer beta ("Internet retailers average 1.60") | story L27 | concept L44 one clause | here | NONE |
| beta fading as the firm matures | story L27-28 | none | assumed | life cycle: `spine-04-growth.yaml:63-66` (goDeeper) |
| **cost of equity** | concept L41-42 ("For shareholders that return, the cost of equity, is built in layers") | one clause; **no Lingo card** (the Topic's central term); card line L238 | here | NONE |
| CAPM sum: risk-free + beta x premium | concept L42-43; card line L239 (in words) | never computed. 6.5% + 1.60 x 4% = 12.90% is not worked anywhere in the text; the widget draws the layers | here | NONE |
| diversification / risk you cannot spread away | concept L43-44 | one line + primer L101-104 (3 lines) + card L85-90 | here | NONE |
| market risk vs company risk | primer L102-103 | one line each | here | NONE |
| lenders / "what its lenders charge" | concept L44-46 | forward reference | deferred | lenders: `spine-statements.yaml:53` |
| "a rate bent to fit the price hides where the real disagreement is" | concept L47 | compressed | here | price-assumes idea `spine-01-worth.yaml:130` |
| widget: "Share of debt" lever, "Debt in the mix" layer, "Lenders: 1.2%, cost 8%", "Whole rate, with debt" | explore (`wacc-stack-model.ts:141-158, 222, 250-253, 358-361`) | labels only | **used before taught** (pos 9) | NONE |
| "Premium for shares", "Relative risk ... 1 is the average share" | explore (`wacc-stack-model.ts:113,121,135`) | caption | here | — |
| Amazon's margin 10%, sales to capital 3, revenue $60bn / $50bn in year 10 | Q L155, L157, L167, L170 | none in this Topic | assumed | `spine-01-worth.yaml:120,330` (6 Topics back) |
| 12.84% "rate while it grows" | Q L156, L158, L286 | none before the reveal L32 (Check precedes reveal) | here, unexplained in Check | NONE |
| 15.57% "the measured beta's", 10.47% "a retailer's beta of 1" | Q L156, L158, L168, L178-179 | none. They are debt-blended (0.988 x 15.66% + 0.012 x 8%), the next Topic's arithmetic; 6.5 + 2.29 x 4 gives 15.66 (as `outline.yaml:142` says) | **used before taught** | NONE |
| 9.61% "once mature" | Q L169 | none | **used before taught** (pos 9) | NONE |
| "while it grows" / "once mature" phases of the rate | Q L156, L169 | none | assumed | lever label in spine-01 Qs (`spine-01-worth.yaml:155`) |
| percentage point ("a quarter of a percentage point") | Q L198 | none | assumed | "points" of margin: `spine-05-margins.yaml:42` |
| 12.90% cost of equity | Q L220 (in Check); reveal L31 | none (result never derived) | here | NONE |
| "sustainable margins and revenue growth" | reveal L34 | none | assumed | spine-04, spine-05 |
| 2001 revaluation: beta 2.18, 13.81%, $20.83 | reveal L35-36 | none | here | — |
| historical vs implied premium | goDeeper L58-59 | one sentence | here (optional) | NONE |
| capital asset pricing model (name) | connections L141 | none | here | NONE |
| savings account | dailyLife L55 | plain | assumed | — |

### 4. Jumps
- **J1, story L23:** "The US Treasury bond pays 6.5%, his risk-free rate." Bond, Treasury and yield are used cold. No Spine Topic has defined a bond.
- **J2, story L24:** "the average the market implied from 1960 to 1999". The idea of an implied premium is dropped mid-sentence.
- **J3, story L26-27:** "His own measure, from two years of Amazon's weekly prices, gives 2.29, but it is rough: with so short a history its likely miss, the standard error, is 0.50." That is a regression and a statistic in one sentence, and the standard error never returns.
- **J4, missing sum:** the story ends on six numbers (L23-28) with no result. The sum 6.5 + 1.60 x 4 = 12.90 is never shown (card line L241 lists only inputs). The first "12.90%" a learner reads is Q L220, inside the Check.
- **J5, concept L41-42:** the Topic's core term is a subordinate clause with no card. The four card slots went to risk-free rate, ERP, beta and diversification.
- **J6, concept L44-46 + widget:** "the whole rate the Workbench shows is almost exactly its cost of equity; the next Topic adds what its lenders charge". The bench still shows a "Share of debt" slider, a "Debt in the mix" layer and "Lenders: 1.2%, cost 8%" one Topic early.
- **J7, Q L156, L158, L178-179:** "Rate while it grows 12.84% to 15.57%, the measured beta's" and "10.47%, a retailer's beta of 1". A learner who applies the card's rule gets 15.66% and 10.50%; the gap is the next Topic's blend.
- **J8, Q L155, L157, L167-170:** "Margin 10% to 8%", "Sales to capital 3 to 4", "$60bn of revenue in year 10, keeping 12.5%". Amazon's base levers are not in this Topic.
- **J9, Q L169:** "his 9.61% once mature" is the next Topic's number.
- **J10, Q L218-227 (price_or_value):** "Is the $84 a price or a value?" A spine-01 drill.
- **J11, reveal L35-36:** new numbers in the epilogue (beta 2.18, 13.81%, $20.83).

### 5. Names (learner-visible)
- **"Aswath Damodaran, a valuation professor at New York University"** story L21; "Damodaran" at reveal L31, goDeeper L58, inStory L72, Q L149, Q L220, quickTry L247, quickTry L282, conversation L299. **Count 9 named mentions.**
- Plus about 20 "he/his" references to him: story L22-28, reveal L32-35, inStory L78/84/90, insight L119-123, Q L151/168/169/173/178/224/226, quickTry L272. The widget chip label "his measure" (L135) is on screen.
- The workbench source title "Damodaran, The Dark Side of Valuation..." (L134) feeds the Tutor's reading text (`wacc-stack-model.ts:420`). Question `source` L195/206/217/227 are not rendered.

### 6. Depth verdict: 2/5
1. The core term (cost of equity) has no card and the layer sum is never worked (L41-43, L238-241).
2. The Moment throws bond, yield, implied premium, regression beta and standard error at a beginner (L23-27).
3. The Check relies on next-Topic numbers (12.84%, 15.57%, 10.47%, 9.61%) and on spine-01's Amazon levers. Half the Check repeats the meta-message "the rate matters less" (skill `rate-matters-less`, L95-96; Q L147-184, L270-296) instead of drilling the build.

### 7. Valuation skill and gaps
- **Contributes:** lever 4, part 1 (cost of equity by CAPM; choosing a beta for a young firm).
- **Leaves out:**
  - what a government bond and its yield are;
  - how to choose the risk-free rate (currency, long-term, default-free);
  - where an equity risk premium comes from and its typical size;
  - country risk (needed for "any company", e.g. the rupee Case at pos 12);
  - where to find industry betas;
  - un- and re-levering (deferred to pos 9 goDeeper);
  - a worked CAPM example.

---

## Position 9: spine-cost-of-capital

### 1. Basics
- Title: "What does all of a company's money cost?" (L10). Goal: "Blend what shareholders and lenders each require into one rate, and judge how much the mix moves a value" (L11). 12 min (L13; `outline.yaml:149-162`, spine: 9). Case: Amazon, 3 Feb 2000.

### 2. Flow
- **Moment** (story L22-30; **no scene**): cost of equity 12.90%; debt 1.2% "at market prices" at 8% before tax; losses mean no tax saving. By year 10: 15% debt at 7%, 35% tax rate, 4.55% after tax, equity at 10.50%.
- **Concept** (L39-47 + Primer "Basis points" L104-122): two investor types; debt is cheaper because lenders are paid first; tax saving; blend by weights = cost of capital (WACC); the blend leans to the biggest funder; more debt makes shares riskier; the mix matters less than growth and margins.
- **Explore** (L132-140, insight L124-130): wacc_stack, debt-led, mature Amazon (15%, 7%, 35%, beta 1 = 9.61%). Moving debt to none shifts the rate about half a point.
- **Your turn** (L233-285): 6 tries.
- **Check** (pool L148-216, 4 of 6). **No conversation check** (only Topic of the six without one).
- **Reveal** (L31-36): 12.84% then 9.61%; $35.08 vs $84.
- **Principle** (L49-51).
- **Word count:** concept 174 + card 58 + means 63 = **295**; +goDeeper 173 = 468 (+primer 43, examples 68). Questions 442 + tries 326 = 768.

### 3. Term ledger
| Term / stand-in | First appears | Explained there | Here / assumed | Earlier Spine teaching |
|---|---|---|---|---|
| cost of equity (12.90%) | story L23 | none | assumed | spine-07 concept L41-42 (no card); 12.90% only in spine-07 reveal and Check |
| shareholders / lenders as funders | story L23-24 | plain | assumed | `spine-statements.yaml:53`; `spine-01-worth.yaml:20-21` (a share) |
| cost of debt | story L24 | inline + card L73-78 example; concept L40 | here | NONE |
| interest | story L24 | assumed | assumed | `spine-03-cash.yaml:88` |
| market-value weights ("At market prices ... 1.2% of its funding") | story L24-25 | none on main path; goDeeper L58-59 | here, unexplained; **tested** in Q L209 | NONE |
| before tax / after tax | story L25, L29 | plain | assumed | tax step `spine-03-cash.yaml:380-381` |
| tax saving on interest | story L25-26 | one sentence + card L79-84 worked ($100 interest, $65 cost) | here | "before interest and tax" `spine-03-cash.yaml:88`; net income `spine-statements.yaml:103` |
| losses mean no tax saving | story L26 | explained | here | — |
| target mix ("funded like a traditional retailer, 15% by debt") | story L27-28 | none | here | NONE |
| tax rate 35%; after-tax cost of debt 4.55% | story L28-29 | 7% x (1 - 0.35) not shown | here | NONE |
| 10.50% mature cost of equity | story L29 | not derived here | assumed | spine-07 reveal L31-32 only |
| priority ("lenders are paid first") | concept L40-41 | one clause | here | NONE (spine-09 teaches claims later) |
| cost of capital as a blend | concept L42-43 | two sentences + card L85-90 (example with no numbers) | re-introduced (re-carded) | `spine-01-worth.yaml:60-61` ("how risky it is"); used as a lever in spine-01 to spine-07 |
| weights ("by how much ... each puts in") | concept L42 | plain; **no worked weighted average**: 0.85 x 10.50 + 0.15 x 4.55 = 9.61 never shown | here | NONE |
| WACC / weighted average cost of capital | concept L43-44 | name only; no card | here | NONE |
| leverage raises equity risk | concept L45-46 | one clause; formula only in goDeeper L61-63 | here | NONE |
| basis point | card L91-96; primer L108-110 | example (100 cents analogy) | here; **used nowhere else in the Topic** except artificial inStory L96 | NONE |
| percentage point | primer L108-109 | one line | assumed | spine-05, spine-07 |
| central bank, "the Fed" | primer L110; card pro L94 | none | assumed | NONE |
| widget: "Share of debt" (first lever, "No debt" chip), "Cost of equity", "After-tax cost of debt", "Debt in the mix" (negative layer), "Cost of capital", "Shareholders: 85%, want x" / "Lenders: 15%, cost 4.55%" | explore (`wacc-stack-model.ts:137-158, 248-372`) | labels; re-levering silently moves the cost of equity when debt moves (explained only in goDeeper L65) | here | — |
| Amazon margin 10% to 8%; revenue $60bn / $50bn | Q L157, L168, L170 | none | assumed | `spine-01-worth.yaml:120,330` |
| 12.84% "rate while it grows" | Q L158-159, quickTry L261, L275 | only in reveal L32 (after the Check) | here | spine-07 Check/reveal |
| 13.27% / 12.82% / 13.05% (30%, 0%, 15% debt from year one) | Q L158-159, L169, L178-179; quickTry L261, L275 | derivation (re-levering) **only in goDeeper** L61-64 | here, unexplained on main path | NONE |
| market value of equity ($28,626m = $84 x 340.79m) | Q L209; goDeeper L58-59 | goDeeper only | here; **tested** | quiz-only `spine-05-margins.yaml:251-253` |
| unlevered beta, "re-levered", formula with "debt ÷ equity", Boston Chicken | goDeeper L61-63 | formula, no example; Boston Chicken never introduced | here (optional) | NONE |
| mortgage | dailyLife L55 | plain | assumed | — |
| default spread | connections L145 | none | here | NONE |

### 4. Jumps
- **J1, story L24-25:** "At market prices Amazon's debt is only 1.2% of its funding". Market-value weighting is assumed; it is explained only in goDeeper (L58-59), yet tested in Q L209.
- **J2, story L28-29:** "with a 35% tax rate that interest costs it 4.55% after tax". The 7% x 0.65 is not shown.
- **J3, story L29:** "shareholders then require 10.50%" is not derived here.
- **J4, no worked blend anywhere:** reveal L33 just states 9.61%; card example L89 has no numbers. The Topic's whole skill (`blend-build`, L99-100) is never demonstrated with arithmetic.
- **J5, concept L43-44:** "Analysts call this the WACC". A name dropped once, never used again in learner text.
- **J6, concept L45-46 + Qs:** "More debt also makes the shares riskier ... that takes back much of what cheaper debt saves". The main path tests numbers that depend on re-levering: 13.27% (Q L158, L169, L178; quickTry L261), 12.82% (Q L159, L179), 13.05% (quickTry L275). The rule lives in goDeeper.
- **J7, goDeeper L61-63:** "he re-levered Boston Chicken's beta from its industry's beta with no debt: beta with debt = beta with no debt x (1 + (1 − tax rate) x debt ÷ equity)". Unknown company, jargon, algebra.
- **J8, basis-point card and Primer (L91-121):** off-topic. Its inStory is contrived ("Damodaran's rates, such as Amazon's 12.84%, move by points and basis points", L96). No question uses basis points.
- **J9, concept L40-41:** "lenders are paid first" is introduced as a passing justification, two Topics before the bridge teaches claim order.
- **J10, Q L207-216 (price_or_value):** a price-or-value drill on market capitalisation.

### 5. Names (learner-visible)
- **"Aswath Damodaran, a valuation professor at New York University"** story L22; "Damodaran" at story L27, reveal L32, goDeeper L58, inStory L96, insight question L125, Q L151, Q L209, quickTry L271. **Count 9.**
- Plus about 10 "he/his": story L27, reveal L33-34, goDeeper L59/61, insight L125-126, Q L169/215. Source title L139 and Q `source` L195/206/216 are not rendered.

### 6. Depth verdict: 2/5
1. No worked weighted average or after-tax arithmetic; the core skill is asserted.
2. Check numbers (13.27%, 12.82%, 13.05%, $28,626m) depend on ideas that live only in goDeeper (re-levering, market-value weights).
3. A card slot and the Primer go to basis points (unused), while WACC, weights and leverage get no card. There is no conversation check and no scene.

### 7. Valuation skill and gaps
- **Contributes:** lever 4, part 2 (blending equity and after-tax debt into the discount rate).
- **Leaves out:**
  - how to estimate a cost of debt (risk-free + default spread from a rating);
  - market vs book weights on the main path;
  - marginal vs effective tax rate;
  - whether leases count as debt in the weights (pos 11 adds leases to the bridge but never to the rate);
  - how to choose a target mix;
  - a worked WACC example;
  - country / currency consistency.

---

## Position 10: spine-08-far-future

### 1. Basics
- Title: "What about the years you cannot forecast?" (L8). Goal: "Say how much of a value rests on the years after the forecast, and which two settings it hangs on" (L9). 12 min (L14; `outline.yaml:163-176`, spine: 10). Case: Amazon, 3 Feb 2000.

### 2. Flow
- **Moment** (story L26-34 + scene `far-opening` L99-113): Amazon's 10-year cash forecast (losses for 6 years, +$1.8bn in year 10); rate 12.84% easing to 9.61%; after year 10, 6% growth for ever at 9.61%. Where does the value sit?
- **Concept** (L47-58 + scene `far-lingo` L114-124, the only written Lingo scene in these six): terminal value packs the years after the forecast into one lump; two settings; the closer growth is to the rate, the bigger the lump; the growth-years rate matters less; for a young firm the terminal value can exceed 100% of value.
- **Explore** (L140-146, insight L132-138): terminal seesaw (years 1-10 vs after); move growth after year 10 and the rate after year 10.
- **Your turn** (L273-336): 6 tries.
- **Check** (pool L156-256, 4 of 7; conversation L338-342).
- **Reveal** (L36-44): terminal value $52,148m; business $15,170m; $35.08 "once its debts and other claims were taken off"; years 1-10 worth less than nothing.
- **Principle** (L66-69).
- **Word count:** concept 198 + card 54 + means 43 = **295**; +goDeeper 62 = 357 (no primer; examples 49). Questions 565 + tries/talk 316 = 881.

### 3. Term ledger
| Term / stand-in | First appears | Explained there | Here / assumed | Earlier Spine teaching |
|---|---|---|---|---|
| "cash it will have left each year, after paying to run and to grow" (free cash flow) | story L27-28 | plain gloss | assumed | `spine-03-cash.yaml:93-94`, `:379-381` (worked example) |
| forecast / ten years / forecast period | story L28-29 | card L89-94 (trip analogy) | name here | ten-year horizon: `spine-01-worth.yaml:120` |
| negative cash in years 1-6; cash-positive in year 7 | story L29-31 | plain | here | burn: `spine-03-cash.yaml:105-106` |
| "investors want 12.84% ... easing to 9.61% by year 10" | story L31 | none here | assumed | spine-cost-of-capital reveal L32-33 |
| "he sets a few things once, and two matter most" | story L32-33 | none: the third setting (return on capital after year 10 = 20%, `val-dcf.yaml:58`) is hidden | here | NONE |
| growth for ever / stable growth | story L33 | card L83-88 (tree analogy) | here | NONE |
| cost of capital after year 10 | story L33-34; concept L52-53 | one clause ("usually lower than in the risky growth years") | assumed | pos 9 |
| terminal value ("one lump") | concept L49; scene L114-124; card L77-82 | example | here | NONE (an after-year-10 bar is already on spine-06's bench) |
| discounted back to today | concept L50 | none | assumed | `spine-02-money-later.yaml:39,51` |
| "cannot beat the economy for ever" | concept L51-52 | none: no figure for economic growth, no link to the risk-free rate | here | NONE |
| "The closer growth comes to the cost of capital, the bigger the lump" | concept L52 | statement; formula only in goDeeper L62 | here | NONE |
| growth-years rate moves value less | concept L52-54 | asserted | here | NONE |
| forecast years worth "less than nothing"; terminal value > 100% of value | concept L55-56 | short explanation | here | NONE |
| perpetuity ("6% a year in perpetuity") | stable-growth card pro L85 | none | here | NONE |
| seesaw: "Growth after year 10", "Cost of capital after year 10", "Terminal value at year 10", "Value a share", "Value for the owners", "After year 10 holds x%" | explore (`terminal-seesaw-model.ts:68-145`) | labels | here | — |
| "value a share" (runs the equity bridge silently) | explore; reveal L37-38 ("once its debts and other claims were taken off") | none | **used before taught** (pos 11) | `spine-01-worth.yaml:124-127` (goDeeper only) |
| infinite value when growth >= rate | Q explanation L226 | one clause | here (not on main path) | NONE |
| reinvesting to grow ("keeps investing to do so") | Q choice L222-224 | none | **tested, not taught** | NONE |
| longer forecast shifts the split (15 years) | Q L244-255 | inferable | here | — |
| rivals copying (competitive edge) | Q L199 | — | assumed | `spine-05-margins.yaml:89-90` |
| "a mature water company" (utility) | quickTry L303 | plain | here | — |
| $52,148m (= 1,881 / (9.6075% - 6%)) | reveal L36; Q L231 | none: 1,881 and the division never shown | here | NONE |
| "Widget re-works his figures from his rounded rates" | reveal L39-40 | meta | — | — |
| formula in words ("next year's cash flow divided by the gap") | goDeeper L62 | one line | here (optional) | NONE |
| flat to rent out | dailyLife L13 | plain | — | — |

### 4. Jumps
- **J1, story L32-33:** "he sets a few things once, and two matter most". A third setting is hidden, yet Q L222-224 offers "It grows with the economy and keeps investing to do so", which tests reinvestment-for-growth the Topic never teaches.
- **J2, concept L51-52:** "growth after year 10, which cannot beat the economy for ever". No number for how fast the economy grows, so the learner cannot judge whether 6% is high.
- **J3, concept L52:** "The closer growth comes to the cost of capital, the bigger the lump." The formula is only in goDeeper L62. The $52,148m figure (reveal L36, Q L231) is never worked; 1,881 never appears.
- **J4, concept L52-54:** "The cost of capital in the growth years only changes how far the lump and the early cash are discounted back, so a point on it moves the value far less than a point on either far-future setting." Asserted without numbers, then tested twice (Q L156-179).
- **J5, card pro L85:** "in perpetuity" is unexplained.
- **J6, reveal L37-38 and widget headline "Value a share":** the equity bridge (pos 11) is used.
- **J7, Q explanation L226:** "with no end to it once growth gets there, and a company growing that fast for ever would end up bigger than the economy". New idea in a quiz explanation.
- **J8, reveal L39-40:** rounding note ("re-works his figures from his rounded rates").
- **J9, goDeeper L63-64:** "the share of value after the forecast can rise" when the far future shrinks. A counter-intuitive oddity; the insight hint L138 also warns about it.

### 5. Names (learner-visible)
- Case title "Damodaran values Amazon.com" L19.
- Story L26-27 "Aswath Damodaran, a professor at New York University".
- Reveal L36 "Damodaran's published terminal value".
- inStory L94 "Damodaran forecasts".
- **Scene cast name "Aswath Damodaran"** (L105, on screen, role "values Amazon"; he speaks two beats L109, L111).
- Q L231.
- **Count 6**, plus about 11 "his/he": story L28/32/34, reveal L39, Q L159/172/199/237/239, quickTry L276/329. Question `source` L211/240/256 are not rendered.

### 6. Depth verdict: 3/5
The idea is told in plain words with a fitting widget and a Lingo scene.
1. The key formula and its arithmetic are off the main path (goDeeper L62; $52,148m never worked).
2. The economy cap on growth is unquantified (L51-52).
3. The reinvestment that growth for ever needs is hidden ("two matter most", L33), though a question tests it (L222-224).

### 7. Valuation skill and gaps
- **Contributes:** terminal value; judging how much value sits after the forecast and which two settings drive it.
- **Leaves out:**
  - the stable-growth formula with a worked example;
  - capping growth at the risk-free rate or the economy's growth, with a number;
  - reinvestment in stable growth (reinvestment rate = growth ÷ return on capital; the hidden 20%);
  - discounting the lump back with a factor;
  - why the mature cost of capital uses a beta near 1;
  - which year's cash flow feeds the lump.

---

## Position 11: spine-09-to-one-share

### 1. Basics
- Title: "How do you get from the business to one share?" (L10). Goal: "Walk a value from the whole business to one share, and say who is paid before shareholders" (L11). 13 min (L14; `outline.yaml:177-199`, spine: 11). Cases: Amazon (Feb 2000) and WeWork (14 Aug 2019).

### 2. Flow
- **Moment** (two stories: Amazon L26-31; WeWork L43-50; no story scene):
  - Amazon: business value from Damodaran's story; cash $26m, debt $349m, staff options valued at $2,892m, 340.79m shares.
  - WeWork: 15-year leases vs 15-month members; $17.9bn of lease obligations, $1.3bn debt, $2.7bn convertible notes; $47.2bn of rent "not discounted", $13.1bn not yet started.
- **Concept** (L61-70 + Primer "Business value and share value" L126-145): business value, plus cash and stakes in other companies, less debt, leases and options = equity value, then ÷ shares. Claims are paid in full first; the bridge changes ownership, not the business.
- **Explore** (L156-175, insight L147-153): value_bridge with a queue scene (lenders, staff with options, one shareholder).
- **Your turn** (L335-421): 8 tries, including a worked bakery bridge (L378-390).
- **Check** (pool L185-318, 4 of 9; conversation L423-427).
- **Reveals:**
  - Amazon (L33-37): 15,170 + 26 - 349 = 14,847; - 2,892 = 11,955; = $35.08 a share. Steps shown.
  - WeWork (L52-57): Damodaran counted $23.8bn of debt with leases; about $26 a share; IPO withdrawn; Chapter 11.
- **Principle** (L72-75).
- **Word count:** concept 172 + card 52 + means 63 = **287**; +goDeeper 93 = 380 (+primer 48, examples 56). Questions 733 + tries/talk 437 = 1,170 (the most of the six).

### 3. Term ledger
| Term / stand-in | First appears | Explained there | Here / assumed | Earlier Spine teaching |
|---|---|---|---|---|
| business value / "Amazon's operations, the business itself" | story L27 | plain gloss + card L94-99 (house analogy) | here | `spine-01-worth.yaml:124-127` (goDeeper) |
| cash ($26m) | story L28-29 | none | assumed | everywhere |
| debt ("owes $349 million of debt") | story L29 | none: "debt" never carded in Spine | assumed | "what it owes" `spine-statements.yaml:50,91`; pos 9 cost of debt |
| employee options and their value ($2,892m) | story L29-30 | plain gloss + card L106-111 (coupon analogy); concept L65. How they are valued: none | here | `spine-01-worth.yaml:127` ("promised its staff"), `spine-03-cash.yaml:79` |
| number of shares (340.79m), per share | story L30; concept L66 | none | assumed | `spine-01-worth.yaml:20-21` |
| claims paid before shareholders | story L30-31; concept L66-67 | one sentence | here | "lenders are paid first" pos 9 concept L40-41 |
| parent company ("WeWork's parent, The We Company") | story L43 | none | here | NONE |
| IPO prospectus | story L43-44 | none | assumed | IPO mentions only (spine-03, spine-06) |
| leases / lease obligations | story L44 | plain + card L112-117; concept L64 ("they work like debt") | here | NONE (a "warehouse it rents" in `spine-statements.yaml:53`) |
| members on short contracts vs long leases | story L45-46 | plain | here | — |
| balance sheet | story L46 | none | assumed | `spine-statements.yaml:90-91` |
| long-term (obligations, debt) | story L46-47 | none | here | NONE |
| convertible notes | story L47-48 | none | here | NONE |
| "not discounted" ($47.2bn vs $17.9bn) | story L48-49 | none: why the two figures differ is never explained | here | discounting `spine-02-money-later.yaml:39` |
| discounted cash flow (phrase) | concept L61 | none | here | method sketched `spine-01-worth.yaml:124-127` |
| "worth the same whoever funds them" | concept L61-62 | assertion; clashes with pos 9 (the mix moves the rate) | here | — |
| residual claim ("A share is a claim on what is left") | concept L62 | one line | here | — |
| non-operating assets ("what the business does not need to run, such as cash") | concept L62-63 | one line | here | NONE |
| dilution ("turn into new shares at a low price") | concept L65 | one clause | here | NONE |
| equity value | concept L65 | card L100-105 (house less mortgage) | here | "equity" never defined before |
| stakes in other companies (cross-holdings) | concept L68-69 | one sentence | here | "stakes" in another sense: `spine-04-growth.yaml:28` |
| "whole-business measure" vs "share measure" (multiples) | primer L131 | none | **used before taught** (val-multiples) | NONE |
| market value ("stock market value of IWG") | primer quickTry L136 | none | assumed | quiz-only spine-05/06 |
| widget: "Business value", "Plus cash", "Less debt (and leases)", "Less options", "Left for shareholders", "Each share is worth" | explore (`value-bridge-model.ts:89-139`) | labels + scene beats L170-173 | here | — |
| $1.75bn "other debt in its end-2018 accounts" | Q L239 | only in WeWork reveal L53-54 (Check precedes reveal); conflicts with story's $1.3bn + $2.7bn at 30 Jun 2019 | here, unexplained | — |
| Coffee Day, Mindtree, 17.12% stake | Q L247 | none (Coffee Day is introduced only at pos 12) | here | NONE |
| funding round ($47bn) | Q L296 | none | assumed | "venture round" `spine-04-growth.yaml:28` |
| "$218 million invested in other companies" | quickTry L369 | — | here | — |
| bakery bridge ($10m + $1m - $3m = $8m) | quickTry L380 | worked example (the only one) | here | — |
| "about $22 billion of leases, counted his own way"; $23.8bn of debt; "$26 a share" | WeWork reveal L52-54 | none (third lease figure; no price to compare) | here | — |
| Chapter 11, liabilities, restructuring, "rejected leases" | WeWork reveal L55-56 | none | here | bankruptcy mentions only |
| subsidiary, minority interests, non-controlling interests, Sical | goDeeper L82-86 | one line + shop analogy | here (optional) | NONE |
| mortgage | dailyLife L77 | plain | assumed | pos 9 dailyLife |

### 4. Jumps
- **J1, story L29-30:** "Its staff hold options to buy shares cheaply, which he values at $2,892 million." The value is handed over with no method, and it is 8x the debt.
- **J2, two Cases at once (L43-50):** a second company in a second era, with parent company, IPO prospectus, convertible notes, "not discounted", leases not yet started, and seven figures.
- **J3, story L46-49:** "$17.9 billion of long-term lease obligations" vs "The rent it had signed up to pay, not discounted, came to $47.2 billion". The gap (present value) is never explained. The reveal adds a third figure, "about $22 billion of leases, counted his own way" (L53).
- **J4, concept L61-62:** "A discounted cash flow gives the value of the business: its operations, worth the same whoever funds them." New phrase, and it contradicts pos 9's lesson that the mix moves the rate (spine-cost-of-capital L45-47).
- **J5, primer L131:** "Match like with like: a whole-business measure goes with business value, a share measure with equity value". This refers to multiples, which no Spine Topic has taught.
- **J6, Q L233-243:** "leaving the $1.75 billion of other debt in its end-2018 accounts". The figure appears only in the later reveal and disagrees with the story's 30 Jun 2019 debt.
- **J7, Q L247 and goDeeper L85-86:** Coffee Day, Mindtree and Sical appear one Topic before Coffee Day is introduced.
- **J8, Q L296:** "a funding round that put a value of $47 billion on the whole company, a different figure from the $47.2 billion of rent it owed". Near-identical numbers side by side in a price-or-value drill.
- **J9, WeWork reveal L55-56:** "Chapter 11 bankruptcy with nearly $19 billion of liabilities ... rejected leases" is unexplained.
- **J10, goDeeper L82-84:** "minority interests (accounts also say non-controlling interests)". Two synonyms for a beginner.

### 5. Names (learner-visible)
- Case title "Damodaran values Amazon.com" L19.
- Story L26-27 "Aswath Damodaran, a professor at New York University".
- WeWork reveal L52 "Damodaran valued WeWork".
- inStory L99 "Damodaran's value".
- Q L309 "Damodaran put Amazon's common stock".
- **Count 5**, plus about 10 "he/his": story L27/28/30, reveal L35/53, Q L188/201/315/317, quickTry L360. Question `source` L276/292/318 are not rendered.

### 6. Depth verdict: 3/5
The bridge itself is clear: the reveal shows each step and the bakery try is worked.
1. The WeWork second Case adds three unexplained terms and three lease figures (L46-53).
2. Option values and lease measurement are given, never explained (L29-30, L46-49).
3. Pre-introduces Coffee Day and multiples (L131, L247, L85-86). The Check uses a reveal-only number (L239).

### 7. Valuation skill and gaps
- **Contributes:** the equity bridge (business value to value per share), including leases as debt and cross-holdings.
- **Leaves out:**
  - how to value employee options;
  - how to turn lease commitments into debt (present value at the cost of debt);
  - convertibles;
  - minority interests on the main path;
  - net debt;
  - diluted share counts;
  - cash the business needs to run.

---

## Position 12: spine-10-survival

### 1. Basics
- Title: "What if it does not survive?" (L12). Goal: "Weigh a value that assumes survival against what is left if the company fails" (L13). 12 min (L16; `outline.yaml:200-216`, spine: 12). Case: Coffee Day Enterprises, 29 Jul 2019. Currency switches to INR (L17).

### 2. Flow
- **Moment** (story L24-33; no scene): Coffee Day group with ₹7,200 crore of borrowings and a ₹456 crore interest bill; Mindtree stake sold to pay down debt; founder's shares pledged; market value ₹4,070 crore (₹193 a share). The survival story is set to equal the price.
- **Concept** (L49-58 + Primer "Expected value" L115-134): going concern; signs of failure; distress sale; expected value; three ways to get a probability; debt paid in full first.
- **Explore** (L144-162, insight L136-142): value_levers failure mode with a survive/fail fork and lenders/Coffee Day scene lines.
- **Your turn** (L277-342): 6 tries.
- **Check** (pool L172-260, 4 of 6; conversation L344-351).
- **Reveal** (L35-45): founder's death; two 20% limit-down days; ratings cut to BB+ then D; promoters' stake from 54% to 17%; SEBI order and 2026 tribunal.
- **Principle** (L60-63).
- **Word count:** concept 176 + card 46 + means 54 = **276**; +goDeeper 93 = 369 (+primer 43, examples 55). Questions 456 + tries/talk 394 = 850.

### 3. Term ledger
| Term / stand-in | First appears | Explained there | Here / assumed | Earlier Spine teaching |
|---|---|---|---|---|
| group / conglomerate ("owns businesses in logistics, tech parks and finance") | story L24-25 | plain | here | — |
| borrowed / debt | story L25-26 | none | assumed | pos 9 (cost of debt), pos 11 (debt on the bridge) |
| crore (₹) | story L26 | none | here | NONE (all earlier Spine Cases are in USD) |
| interest bill | story L26-27 | plain | assumed | `spine-03-cash.yaml:88` |
| stake sale used to pay down debt | story L27-28 | plain | assumed | pos 11 cross-holdings |
| prospectus | story L28 | none | assumed | pos 11 mention |
| pledged shares, in plain words ("put up shares to back group loans, which lenders could take and sell") | story L28-29 | gloss; term in goDeeper L71-75 | here | NONE |
| market value ("₹4,070 crore, about ₹193 a share") | story L29-30 | none | assumed | quiz-only spine-05/06 |
| survival story calibrated to the price | story L30-33 | explained | here | — |
| going concern | concept L49 | inline gloss + card L83-88 (tea stall) | here | NONE |
| "operating income only a little above its interest bill" (interest cover) | concept L50 | plain; named in goDeeper L72-73; quickTry L313 ("about one and a half times") | here | operating income `spine-03-cash.yaml:87-88` |
| chance of failure | concept L51 | card L95-100 (restaurant example) | here | **used before taught** as a lever: `spine-03-cash.yaml:313`, `spine-04-growth.yaml:239,255,431`, `spine-05-margins.yaml:195,299`; mention `spine-05-margins.yaml:57-58` |
| distress sale / "sold in a hurry for far less" | concept L51-52 | inline + card L89-94 (furniture). How much less: none | here | NONE |
| assets | concept L51 | none | assumed | "what it owns" `spine-statements.yaml:91` |
| expected value | concept L53-54 | one sentence + card L101-106 + primer L117-120. **No worked number** (₹300 x 1/4 = ₹75 never computed; primer try L125 asks only "is it worth the full ₹300?") | here | NONE |
| going-concern value x P(survive) + distress value x P(fail) | concept L53-55 | in words; no worked example | here | NONE |
| bond rating, "history of defaults" | concept L55-56 | none | here | NONE |
| price of its bonds | concept L56 | none | here | NONE ("bond" never defined) |
| "each ten points more chance of failure takes a bit more than a tenth off the value" | concept L56-57 | unexplained arithmetic | here | — |
| debt paid in full first | concept L57-58 | one clause | assumed | pos 11 |
| widget: "Chance it fails" lever, survive/fail fork ("x in 100", value a share each way), "If it survives" readout, lenders' line | explore (`value-levers-model.ts:248-259, 527-530, 914-924`; L160-162) | labels | here | — |
| cost of capital 9.4% in rupees; "₹2 of sales for each ₹1 invested" | Q L198-199; quickTry L307-308 | none: base levers never stated; how a rupee rate is built never mentioned | here, unexplained | pos 8-9 build only USD rates |
| rating agency, "on watch for a downgrade" | Q L203 | none before the reveal L39-41 | here | NONE |
| "profit before interest and tax ... one and a half times that bill" | quickTry L313 | half-done step L314 | here | operating income spine-03 |
| "20% daily limit" (circuit limit) | reveal L37-38 | none | here | — |
| ₹4,970 crore borrowings on 31 Jul (vs ₹7,200 crore in story) | reveal L39 | none | here | — |
| ICRA ratings BB+ ("a weak borrower"), D ("in default") | reveal L39-41 | parenthetical glosses | here | — |
| promoters | reveal L41 | parenthetical gloss | here | — |
| private equity partner | reveal L36 | none | here | NONE |
| SEBI, appeals tribunal | reveal L42-44 | partial gloss | here | — |
| ₹5,000 loan | dailyLife L65 | plain | — | — |

### 4. Jumps
- **J1, story L25-26:** "about ₹7,200 crore". The unit and currency change with no gloss.
- **J2, concept L55-56:** "The chance of failure can be read from a bond rating's history of defaults, from the price of its bonds, or argued from the story." Three methods in one sentence, all on untaught words, none demonstrated.
- **J3, concept L56-57:** "each ten points more chance of failure takes a bit more than a tenth off the value". An arithmetic claim with no worked example. Expected value is never computed with numbers, in the concept or the Primer.
- **J4, concept L52:** "for far less than the business was worth alive". The Topic never says how much less, or how a distress value is set, though the widget's "fails" road shows a figure.
- **J5, Q L198-199:** "Cost of capital while it grows, 9.4% to 10.4%" and "₹1.50 ... not ₹2". Coffee Day's base levers are never stated.
- **J6, Q L203:** "A rating agency puts a company's loans on watch for a downgrade". Rating agencies are explained only in the reveal (L39-41).
- **J7, reveal L39:** "the group's borrowings at ₹4,970 crore on 31 July". This contradicts the story's ₹7,200 crore with no explanation.
- **J8, reveal L37-38, L42-44:** "fell by the 20% daily limit"; SEBI's ₹3,535 crore finding and a 2026 tribunal order. Legal detail off the Topic's point.
- **J9, cross-Topic:** a rupee cost of capital (9.4%) after Topics 8-9 built only dollar rates on a US Treasury yield. Country risk is never raised.

### 5. Names (learner-visible)
- **0 commentator mentions.** "V. G. Siddhartha" (reveal L35) is the founder, a Case subject. Damodaran appears only in non-rendered question `source` (L215) and author comments (L5-6, L10).

### 6. Depth verdict: 3/5
The concept is readable and the cards fit.
1. No worked expected-value example anywhere (L53-58, L101-106, L117-125).
2. No method for either input, the probability (L55-56 names three untaught routes) or the distress value (L52).
3. Unexplained base levers and figures (L198-199; ₹7,200 vs ₹4,970 crore), and a reveal loaded with legal epilogue (L42-44).

### 7. Valuation skill and gaps
- **Contributes:** failure risk, weighing a going-concern value against distress proceeds.
- **Leaves out:**
  - how to get a probability (rating, then cumulative default rate; bond price, then implied probability) with numbers;
  - how to set a distress value (share of going-concern or book value);
  - a worked expected-value calculation;
  - not double-counting with the cost of capital;
  - how proceeds reach shareholders in failure (debt first, often nothing left);
  - building a cost of capital in another currency or country.

---

## Summary table
| Pos | id | Main-path teaching words | Question + try words | Lingo cards (4 max) | Named-commentator mentions | Depth |
|---|---|---|---|---|---|---|
| 7 | spine-06-growth-cost | 313 | 970 | reinvestment (repeat), sales to capital, return on capital, EBITDA | 3 | 2 |
| 8 | spine-07-risk | 267 | 939 | risk-free rate, equity risk premium, beta, diversification (no cost of equity) | 9 | 2 |
| 9 | spine-cost-of-capital | 295 | 768 | cost of debt, tax saving on interest, cost of capital (repeat), basis point (no WACC) | 9 | 2 |
| 10 | spine-08-far-future | 295 | 881 | terminal value, stable growth, forecast period | 6 | 3 |
| 11 | spine-09-to-one-share | 287 | 1,170 | business value, equity value, employee options, lease obligations | 5 | 3 |
| 12 | spine-10-survival | 276 | 850 | going concern, distress sale, chance of failure, expected value | 0 | 3 |

Total learner-visible named-commentator mentions, positions 7-12: **32**, plus about 60 "he/his" references to the same unnamed-to-learners professor. Biggest use-before-teach items across this block:
- "Chance it fails": positions 3-6, taught at 12.
- Terminal value bar: position 7, taught at 10.
- Debt-blended rates: position 8, taught at 9.
- Equity bridge ("value a share"): position 10, taught at 11.
- Multiples: position 11 primer, not taught in the Spine so far.
- "Bond", "yield" and "equity": used from position 7-8, never defined.
