# Off-Spine triage: 38 Foundation Topics

Repo: /home/fedora/developer/finance-agent. All paths are relative to `course/` unless they start with `docs/`. Fact-finding only: no repo file was changed.

## Method and conventions
- Stage, title and prerequisites come from `outline.yaml`. **All 38 are `stage: foundation`** (Electives). None is on the default path (`outline.yaml:1-3`).
- "Learner-visible" means every string in the Topic YAML except comments, `sources`/`source`, `valuation:` blocks, `data`, ids and tags. The counts come from parsing the YAML (scripts in /tmp/value-it-audit/visible.py and names.py).
- **Commentators** are pundits and academics whose views are quoted. People who act in a Case (founders, officials, fund heads) are listed separately and not counted.
- **Depth 1-5** rates the explanation as teaching for a beginner:
  - 5: builds from zero with several worked examples, and every term is taught before it is used.
  - 4: scaffolded (term cards, scenes, practice templates), and one idea is taught thoroughly.
  - 3: a short concept (100-140 words) with term cards and scenes, or a single worked number. Some jargon is used without being taught.
  - 2: one dense textbook paragraph of 150-280 words that brings in many terms at once. No scenes, no term cards, 4-6 questions.
  - 1: thin.
  - No Topic scored 1 or 5.
- **Two formats.** 12 Topics have scenes and term cards: the four num-* Topics except statistics and econometrics, plus present-value and fs-income through fs-leases-debt. The other 26 are the old format: `concept`, an optional `goDeeper`, `principle`, then questions.

## Triage table

| id | stage | title (outline) | what it actually teaches | relevance | Spine link (dup / feeds) | commentators in visible prose | depth |
|---|---|---|---|---|---|---|---|
| num-percent-bps | foundation | Percent, percentage points and basis points | Percentage points vs percent change vs basis points, and naming the base. Case: the Fed in Feb 1994. 10 questions, 7 scenes, 4 templates (`num-percent-bps.yaml:290`) | CORE (the Spine uses % from Topic 1 and never teaches it) | Feeds the 3-line primer in spine-cost-of-capital (`spine-cost-of-capital.yaml:104-121`). Should come before spine-01 | 0 | 4 |
| num-compounding | foundation | Growth and compounding | Compounding, CAGR, rule of 72 (`:43`), why a fall needs a bigger rise to recover. Log returns in goDeeper (`:48`) are not needed | CORE | Feeds the primers in spine-02 (`spine-02-money-later.yaml:192-210`) and spine-04 | 0 (actor: Harshad Mehta ×2) | 4 |
| num-probability | foundation | Probability and expected value | Probability rules, expected value, leverage wiping out capital. Framed on the LTCM hedge fund (`:15`), with "hedge fund" and "tail risk" cards | SUPPORTING (expected value for failure risk; the framing is off-goal) | Feeds the spine-10 primer | 0 (actor: Meriwether ×1) | 3 |
| present-value | foundation | Time value and present value (the file title is "Present value") | Discounting, annuity vs lump sum, the rate that makes two offers equal | CORE idea, but the **Topic is a duplicate** | Duplicates spine-02: same Mega Millions Case (`outline.yaml:33` vs `:436`) and a near-identical concept (`present-value.yaml:150` vs `spine-02-money-later.yaml:40`) | 0 | 4 |
| num-statistics | foundation | Statistics: mean, variance, correlation, regression | Mean, SD (`n-1`, `:32`), correlation, r², regression, normal curve, fat tails, all in one 184-word paragraph | SUPPORTING (only for beta and SD) | Indirect feed to spine-07 via risk-portfolio and risk-capm | 0 | 2 |
| num-econometrics | foundation | Reading empirical claims: causation, data and spreadsheet errors | Confounding, survivorship, overfitting, reproducibility | NOT NEEDED | None. Its prerequisites include eco-fiscal-debt | Reinhart 6, Rogoff 6, Herndon 1, M. Ash 1, Pollin 1 = **15** | 2 |
| fs-income | foundation | The income statement | Revenue to operating profit to interest and tax to net income, plus net margin. Good chai-stall term cards (`:72+`). It **teaches net margin, not operating margin** (0 mentions). It drops EBITDA and S-1 cards (`:91`, `:97`) before depreciation is taught | CORE | Feeds spine-statements, spine-03, spine-05 and spine-annual-report (drawsOn) | 0 (actor: Neumann ×2) | 3 |
| fs-balance | foundation | The balance sheet | Assets, liabilities, equity, the accounting equation, double entry (`:31-45`) | CORE (cash, debt and shares for the equity bridge) | Feeds spine-statements, spine-09, spine-annual-report | 0 (actor: Raju ×2) | 3 |
| fs-cashflow | foundation | The cash flow statement | Operating, investing and financing sections, FCF, burn, runway | CORE | Duplicates the spine-03 Case (Webvan burn, `outline.yaml:56` vs `:481`). Feeds spine-statements | 0 | 3 |
| fs-links | foundation | How the three statements link (accrual accounting) | Accruals, receivables, how net income flows into retained earnings and the cash flow statement. Has the only off-Spine operating margin card (`:89`) | SUPPORTING | The spine-statements primer points to it | 0 (actor: Raju ×2) | 3 |
| fs-ratios | foundation | Ratios, return on equity and DuPont | ROE, the 3-step and 5-step DuPont, leverage | SUPPORTING (ROE is needed for banks and P/B) | Feeds spine-06 via fol-roe, and val-banks | 0 (actor: Siddhartha ×1) | 3 |
| fs-revenue-runrate | foundation | Revenue recognition, run rates, gross vs net | When revenue counts, run-rate vs recorded revenue, gross vs net (principal vs agent), backlog. "IFRS 15 / ASC 606" appears with no explanation (`:36`) | SUPPORTING (platforms and take rates) | Feeds spine-04 (take rate) and spine-11 (gross bookings) | 0 | 3 |
| fs-capex-dep | foundation | Capex, depreciation, amortisation and EBITDA | Capex as an asset, straight-line depreciation (`:42`), D vs A, the EBITDA trap | CORE (the reinvestment lever) | The primers in spine-03 and spine-06 point to it | 0 | 3 |
| fs-leases-debt | foundation | Leases, commitments and debt-like items | Lease liability = PV of payments (IFRS 16 / ASC 842, `:82`), off-balance-sheet commitments, maturity mismatch | CORE idea, already on the Spine | Duplicates spine-09: same WeWork Case (`outline.yaml:191` vs `:562`); spine-09 mentions leases 48× | 0 (Damodaran ×3 in sources only) | 3 |
| fs-filings | foundation | Reading filings: S-1, 10-K, Indian annual report and Ind AS | A list of form names and Items (`:36`) plus DRHP/RHP | SUPPORTING | Overlaps spine-annual-report, which is more practical (5 jurisdictions) | 0 (actor: Neumann ×2) | 2 |
| fs-earnings-quality | foundation | Earnings quality and accounting fraud | Red flags (profit without cash, receivables growing faster than sales), the Satyam fraud | SUPPORTING | No Spine equivalent | 0 (actor: Raju ×2) | 2 |
| fs-tax | foundation | Corporate tax and after-tax cash flows | Tax on profit, interest and depreciation shields, the after-tax CF formula (`:41`), India's 34.94% effective rate, deferred tax | CORE (a tax-rate input in every DCF). It does not cover effective vs marginal rate or losses carried forward | Feeds the spine-03 tax step and spine-cost-of-capital's tax saving on interest | 0 (official: Sitharaman ×1) | 2 |
| risk-portfolio | foundation | Risk, diversification and portfolio theory | SD, correlation, two-asset variance formula, systematic vs specific risk, 1987 portfolio insurance. 241-word concept | SUPPORTING | The spine-07 primer covers the core idea in 3 lines | Markowitz 1 (`:54`) | 2 |
| risk-capm | foundation | CAPM, beta and factor models | CAPM, regression beta, standard error, the leverage effect on beta, factor models, all in a 283-word concept (`:37`) | CORE idea, already on the Spine | Duplicates spine-07: same Amazon Case (`outline.yaml:140` vs `:988`). Extras: regression and standard error | Damodaran **3** (`:17`, `:26`, `:122`) | 2 |
| mkt-efficiency | foundation | Market efficiency | Weak, semi-strong and strong forms, joint hypothesis (`:50`), limits to arbitrage | SUPPORTING (why a value-price gap needs a reason) | Context for spine-12, 13, 14. No Spine coverage | Grantham 8, Blodget 7 = **15** | 2 |
| mkt-behavioural | foundation | Behavioural finance and bubbles | Overconfidence, herding, anchoring, disposition effect (`:47`), bubbles, first-day return | SUPPORTING | Feeds spine-14 (drawsOn; anchoring card) | 0 | 2 |
| cf-capital-budgeting | foundation | NPV, IRR and capital budgeting | NPV, IRR, payback, sunk costs, multiple IRRs (`:100`) | SUPPORTING | Same Webvan Case as spine-06 (`outline.yaml:124` vs `:1037`). The Spine has NPV only as a Connection line (`spine-06-growth-cost.yaml:186`). No IRR on the Spine | 0 (Damodaran ×5 in sources and notes only) | 2 |
| cf-wacc | foundation | Cost of capital and WACC | WACC blend, after-tax debt, market weights, a project-specific rate. Says "Every pound of capital" (`:54`) | CORE idea, already on the Spine | Duplicates spine-cost-of-capital, which is richer (relevering is in its goDeeper) | 0 | 2 |
| cf-capital-structure | foundation | Capital structure and Modigliani-Miller | MM I and II, trade-off theory (`:48`), pledged shares, coverage | SUPPORTING | spine-cost-of-capital covers "more debt raises the cost of equity" | Modigliani 5, Miller 5 (including the **Topic title**) | 2 |
| cf-payout | foundation | Dividends and buybacks | MM payout irrelevance, homemade dividends (`:42`), buyback EPS illusion, signalling | NOT NEEDED for the goal (one idea, buybacks shrinking share count and FCFE for banks, could be a paragraph) | No Spine equivalent | Modigliani 1, Miller 1 | 2 |
| credit-analysis | foundation | Corporate credit analysis | Coverage, leverage, liquidity, group debt, ratings, maturity mismatch (IL&FS) | SUPPORTING (rating and coverage set the cost of debt and the failure risk) | Feeds spine-10 (interest cover) and spine-cost-of-capital, which has default spread only as a Connection line (`spine-cost-of-capital.yaml:145`) | 0 | 2 |
| val-dcf | foundation | DCF valuation | FCFF, WACC, working capital, terminal value, equity bridge, options and FCFE in one 188-word paragraph (`:81-94`) | CORE idea, already on the Spine (spread across spine-01, 03, 06, 07, cost-of-capital, 08, 09) | Same Amazon Case as spine-01, 08, 09, 13 (`outline.yaml:19,170,184,265` vs `:1113`). The only places working capital is named: `:84` (and fs-capex-dep) | Damodaran **3** (Case title `:11`, `:15`, `:29`) | 2 |
| val-multiples | foundation | Relative valuation and multiples | Equity vs EV multiples, comparables, justified P/E = payout/(r-g) (`:61`, `:68`) | CORE idea, already on the Spine | Duplicates spine-12: same WeWork/IWG Case (`outline.yaml:247` vs `:1127`) | 0 (actor: Neumann ×1) | 2 |
| val-young | foundation | Valuing young, loss-making companies | A 5-step story: market size, share, mature margin, reinvestment (sales per $ of capital, `:101`), survival. VC method (`:106`) | CORE idea, already on the Spine | Duplicates spine-04 and spine-11: same Uber Case (`outline.yaml:91` vs `:1145`) | Damodaran **3** (Case title "Uber, Damodaran against venture capital", `:29`, `:34`) | 3 |
| val-banks | foundation | Valuing banks and financial firms | Why banks are valued on equity (no sensible EV, `:56`), P/B vs ROE, NPA ratio (`:62`), thin equity | **CORE for "any company"** (FCFF and EV do not work for banks) | **Not on the Spine** (0 mentions of book value or P/B) | 0 (actors: Kapoor, Gill) | 2 |
| val-distress | foundation | Valuing distressed firms | Going concern vs distress sale weighted by probability, lenders first, equity as an option (`:109`) | CORE idea, already on the Spine | Duplicates spine-10: same Coffee Day Case (`outline.yaml:207` vs `:1178`). Extra: equity-as-option | 0 (Damodaran ×10 in sources and notes only) | 2 |
| val-implied-erp | foundation | Implied equity risk premium and market-level valuation | Historical vs implied ERP, with a worked example (index 1,000, dividends 20, g 5%, so r 7% and ERP 3%; `:71`) | CORE idea, already on the Spine | Duplicates spine-13: same 2007 Case (`outline.yaml:272` vs `:1194`) | Damodaran **9** (`:25`, `:37`, `:106`, `:112`, `:116`, `:131`, `:140`, `:145`) | 3 |
| val-india | foundation | Valuing Indian companies, currency and country risk | Matching currency to discount rate, inflation gaps driving FX, CRP = default spread × equity/bond volatility (`:89-107`) | **CORE for non-US companies** (exampleCurrency is often INR) | **Deferred by the Spine** ("taught in depth in its own Elective", `spine-15-value-yourself.yaml:156`). Needs 33 transitive prerequisites | Damodaran 1 (`:42`) | 2 |
| cf-venture | foundation | Venture finance and private rounds | Pre- and post-money with numbers, dilution, liquidation preference, VC method | SUPPORTING (pricing vs value) | Feeds spine-12 (drawsOn). The Spine says "pre-money" once, in spine-04 | 0 (Damodaran ×5 in sources only) | 3 |
| mkt-ipo-float | foundation | IPOs, book building and float | Book building, float, lock-ins, greenshoe (`:63`), underpricing | NOT NEEDED | Feeds spine-12 (drawsOn) | 0 (actor: Siddhartha ×1) | 2 |
| eq-markets | foundation | Equity markets, exchanges, SEBI, NSE and BSE | Primary vs secondary markets, broker vs dealer, clearing and settlement (`:49`), SEBI, BSE and NSE | SUPPORTING, only for "what a share and a market price are". The Spine never defines a share (no term card); the rest is not needed | No Spine equivalent | 0 (fictional Kapoor, Raju) | 2 |
| eq-history | foundation | Market history and long-run returns | Arithmetic vs geometric averages (`:37`), real vs nominal (worked, `:49`), historical premium | SUPPORTING (historical ERP and inflation, which the Spine never mentions) | Context for spine-07 and spine-13 | 0 | 3 |
| sov-default-country-risk | foundation | Sovereign default and country risk | Sovereign default spread, local vs foreign-currency debt, haircut (`:53`), CRP, transfer risk | SUPPORTING (feeds the local riskfree rate and CRP in val-india) | No Spine coverage | 0 (actors: Argentine presidents) | 2 |

Totals:
- Relevance: CORE 18, SUPPORTING 17, NOT NEEDED 3 (num-econometrics, cf-payout, mkt-ipo-float).
- Of the 18 CORE Topics, 10 are already taught on the Spine and are effectively duplicates: present-value, fs-leases-debt, risk-capm, cf-wacc, val-dcf, val-multiples, val-young, val-distress, val-implied-erp, fs-cashflow (partial).
- Zitron appears 0 times in this batch.

## Structural findings
- **11 off-Spine Topics share their Case with a Spine Topic.** This is by design ("each Case is copied from the Elective entry that holds it", `outline.yaml:9-10`):
  - present-value / spine-02
  - fs-cashflow / spine-03
  - cf-capital-budgeting / spine-06
  - risk-capm / spine-07
  - val-dcf / spine-01, 08, 09, 13
  - fs-leases-debt / spine-09
  - val-distress / spine-10
  - val-multiples / spine-12
  - val-implied-erp / spine-13
  - val-young / spine-04
  - val-india / spine-15
  - So a learner who opens an Elective meets the same Case twice.
- **The prerequisite graph is bloated:**
  - val-dcf needs 24 transitive prerequisites, including eco-central-banks, eco-supply-demand, bond-pricing and bond-yield.
  - cf-wacc needs 22.
  - val-india needs 33, including fx-bop, in-rbi-policy and eco-gdp-cycles.
  - The off-Spine "valuation" Topics cannot be reached in a linear order.
- **The jump-before-teach pattern also happens off the Spine:**
  - fs-income, the first FS lesson, adds EBITDA and S-1 term cards (`fs-income.yaml:91`, `:97`) before depreciation (fs-capex-dep) or filings (fs-filings) are taught.
  - fs-revenue-runrate cites "IFRS 15 ... ASC 606" (`:36`); fs-leases-debt cites "IFRS 16 and ASC 842" (`:82`).
  - num-statistics says "divide by n - 1" (`:32`).
  - val-dcf packs 7 new ideas into one paragraph (`:81-94`).
- **Operating margin is taught properly nowhere before Spine Topic 6:**
  - spine-01 gives a one-line card (`spine-01-worth.yaml:54-59`), and spine-04 uses it in a choice (`spine-04-growth.yaml:289`).
  - The real teaching is spine-05 (`spine-05-margins.yaml:38`, 6th in Spine order).
  - Off the Spine, fs-income teaches only *net* margin (0 mentions of operating margin), and fs-links has just a term card (`fs-links.yaml:89`) inside an accruals lesson.
- **Words the Spine's visible text never uses:**
  - "inflation" and "currency": 0 hits.
  - "working capital": 0 hits. It appears only in comments, e.g. `spine-03-cash.yaml:175`; the plain-words version is "cash tied up in goods on the shelves", `spine-statements.yaml:62`.
  - "regression", "accrual", "receivable", "book value"/"price-to-book", "IRR", "dilution", "standard deviation": 0 hits each.
  - There are no term cards for "revenue", "sales" or "share" (spine-01 comment `:38`: "The Topic says 'sales', never 'revenue'").

## (a) CORE and SUPPORTING content found only off the Spine

**CORE (the Spine never teaches it, or only in a 3-line primer or one Connection line):**
1. **Percent arithmetic: points vs percent vs bps.** Home: num-percent-bps. The Spine uses % from Topic 1; bps appear only as a primer at Spine Topic 9.
2. **Compounding, CAGR, recovering from a fall.** Home: num-compounding. The Spine has only primers.
3. **What revenue is, and the income-statement ladder down to net income and net margin.** Home: fs-income. The Spine gives one sentence (`spine-statements.yaml:47-49`).
4. **The accounting equation; assets, liabilities, equity.** Home: fs-balance. The Spine gives one sentence.
5. **Depreciation and amortisation mechanics.** Home: fs-capex-dep. The Spine says only "a slice each year".
6. **Working capital as part of reinvestment.** Named only at `val-dcf.yaml:84` and in fs-capex-dep; fs-cashflow and fs-links describe it without the name.
7. **Tax as a DCF input.** Home: fs-tax (after-tax operating income, depreciation shield). Effective vs marginal rate and losses carried forward are taught nowhere.
8. **Currency consistency, inflation, a rupee riskfree rate, country risk premium.** Homes: val-india, sov-default-country-risk, eq-history (real vs nominal). The Spine explicitly defers this (`spine-15-value-yourself.yaml:156`).
9. **Valuing banks and financial firms.** Home: val-banks (equity-only valuation, P/B vs ROE, loan quality).
10. **Estimating the cost of debt from rating, coverage and default spread.** Only partly covered, in credit-analysis (and bond-credit-spreads, outside this batch). The Spine has one Connection line.
11. **Regression beta and its standard error.** Homes: risk-capm, num-statistics. The Spine says a young beta is "noisy" and borrows peers' average beta (`spine-07-risk.yaml:39-46`).
12. **FCFF as one explicit formula, and FCFE as the alternative.** Home: val-dcf.
13. **Where a justified multiple comes from: P/E = payout/(r-g).** Home: val-multiples. Spine-12 has only a card that says what it is (`spine-12-price-or-value.yaml:106-109`).

**SUPPORTING (only off the Spine):**
- Accrual accounting and receivables (fs-links)
- ROE and DuPont (fs-ratios)
- Gross vs net revenue, run rates, revenue recognition (fs-revenue-runrate)
- Earnings-quality red flags (fs-earnings-quality)
- Filing anatomy (fs-filings)
- SD, correlation, regression (num-statistics)
- Diversification maths (risk-portfolio)
- Market efficiency and limits to arbitrage (mkt-efficiency)
- Biases beyond anchoring (mkt-behavioural)
- NPV, IRR, payback (cf-capital-budgeting)
- Optimal debt mix and trade-off theory (cf-capital-structure)
- Pre/post-money, dilution, liquidation preferences (cf-venture)
- Historical returns, geometric vs arithmetic, real returns (eq-history)
- Sovereign default spreads (sov-default-country-risk)
- Equity as an option in distress (val-distress)
- What a share and a stock exchange are (eq-markets)

## (b) Off-Spine explanations notably better than the Spine's, to reuse
1. **val-implied-erp concept** (`val-implied-erp.yaml:63-78`, worked example `:71`, formula goDeeper).
   - Spine-13's concept is 128 words, with no goDeeper and no worked number (`spine-13-price-assumes.yaml:47`).
   - Reuse it with "Damodaran" removed.
2. **num-percent-bps** (concept `:290`, 7 scenes, 4 templates, 10 questions).
   - The Spine has only a 3-line primer (`spine-cost-of-capital.yaml:104-121`), yet uses "percentage point" in spine-07 and spine-cost-of-capital.
3. **num-compounding** (CAGR, rule of 72 `:43`, fall and recovery).
   - The Spine has only 3-line primers in spine-02 and spine-04.
4. **fs-income concept and term cards** (`fs-income.yaml:39-49`, `:72+`).
   - It walks revenue, running costs, operating profit, interest and tax, then net income, with chai-stall examples. That is the ladder a beginner needs before "operating margin".
   - Drop its EBITDA and S-1 cards.
5. **fs-balance accounting equation and double entry** (`:31-45`), where spine-statements has one sentence.
6. **fs-links' credit-sale example** (`fs-links.yaml:36`: "A sale on credit raises revenue ... and receivables ... and brings no cash"). The Spine has no accrual idea at all.
7. **fs-capex-dep's straight-line depreciation and D vs A** (`:38-47`), where the Spine has one primer.
8. **fs-tax's after-tax cash flow and depreciation tax shield** (goDeeper `:41`). The Spine treats tax only as a waterfall step (spine-03) and as a saving on interest (spine-cost-of-capital).
9. **risk-capm on regression beta and standard error** ("true beta roughly within two standard errors", `:37-56`), where spine-07 says only "noisy".
10. **val-young's 5-step story checklist** (`val-young.yaml:95-104`): market size, share, mature margin, reinvestment, survival. It is a compact map of the four levers plus failure risk; the Spine spreads it over spine-04, 05, 06, 10 and 11.
11. **val-multiples' justified P/E derivation** (`:61`, `:68`), where the spine-12 card only names it.
12. **val-dcf's one-paragraph FCFF definition** (`:83-84`), usable as a recap card.
13. **cf-venture's numbered pre/post-money example** (`:47-55`).
14. **eq-history's real-return worked example** (`:49`); the Spine has no inflation at all.
15. **val-india's currency-matching paragraph** (`:89-96`); the Spine has nothing.

Not better than the Spine:
- present-value: about the same as spine-02.
- fs-leases-debt: spine-09 is richer.
- cf-wacc: spine-cost-of-capital is richer.
- val-distress: spine-10 is more beginner-friendly.
- val-multiples prose overall: spine-12's goDeeper (EV/EBITDA, PEG) is richer, apart from the justified-P/E maths.

## (c) Topics whose premise is a named person

No Topic in this batch is a "Follow: X" Topic. The closest:
- **mkt-efficiency**: the whole Case is "Blodget versus Grantham on the dot-com valuations" (`mkt-efficiency.yaml:11`), with 15 mentions; questions `:127` and `:156` refer to "the Blodget and Grantham debate".
- **num-econometrics**: the whole Case is "Reinhart and Rogoff's 90% debt threshold" (`num-econometrics.yaml:11`), with 15 mentions of 5 academics.
- **cf-capital-structure**: the Topic title is the theorem's name, "Capital structure and Modigliani-Miller" (`cf-capital-structure.yaml:4`).
- **val-dcf / val-young**: the Cases are named for Damodaran's valuations ("Damodaran values Amazon.com", `val-dcf.yaml:11`; "Uber, Damodaran against venture capital", `val-young.yaml:11`). The teaching itself is generic.
- **val-implied-erp**: the Case data is Damodaran's ERP series, with 9 mentions. Question `:145` turns on "Meera, because she uses Damodaran's own growth figure".
- **risk-capm**: the name appears in the story and explanation (`:17`, `:122`); the premise is generic.

Outside this batch, from `outline.yaml` titles and Case titles:
- Damodaran premise: fol-uber-2014, fol-twitter-ipo, fol-tesla-2020, fol-roe, fol-sov-ratings, fol-erp.
- Zitron premise: fol-subprime-ai, fol-systemic-risk, fol-money-trap, jud-predicted-outcomes.
- Both: ana-anthropic-s1 (Case titles).
- funds-passive: the Case "Warren Buffett bets an index fund against hedge funds".
- Spine Case titles naming Damodaran: spine-01, 02, 04, 05, 08, 09, 11, 13, 14, annual-report; also jud-narrative-numbers.

Raw "Damodaran" also appears in comments, sources and valuation notes (not counted above): cf-capital-budgeting 5, val-distress 10, cf-venture 5, val-banks 5, val-young 12 raw, val-implied-erp 20 raw. If sources are ever shown, these appear too.
