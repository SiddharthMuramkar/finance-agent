# Off-Spine triage: 57 Topics (fact-finding only, nothing in the repo changed)

Paths are relative to /home/fedora/developer/finance-agent/. Topic files are in course/topics/. "outline" means course/outline.yaml.

**How to read the columns**
- **Rel** = how much the goal "value any company" needs this Topic. CORE = you cannot value companies without it. SUP = supporting: needed for some kinds of company, or as context. NO = not needed.
- **Names** = how often a named commentator appears in text the learner sees. That covers the outline title, why, concept, principle, youllLearn, case title, story and reveal, questions, checks and goDeeper. The number in brackets ("meta") counts mentions in fields the Tutor or Workbench reads but the page does not print directly: `piece.author`, `librarySource`, and valuation `note(s)` and source titles. Question `source:` is not rendered (src/app/quiz-panel.tsx:207-210 shows only `explanation`). People who appear as actors in a Case are not counted: Volcker, Greenspan, Rajan, Manmohan Singh, Meriwether, Black/Scholes/Merton, Neumann, Raju, Ambani, Kwarteng, Citron.
- **Depth** = how well the Topic teaches, 1 to 5.
  - 1: skeletal.
  - 2: a dense, jargon-heavy paragraph, or thin (3 questions or fewer), or mostly about a writer with little teaching.
  - 3: one adequate paragraph with a worked number.
  - 4: several worked steps.
  - 5: in depth and ready for a beginner. No Topic scores 5.
- **Structure note for every row:** all 57 files have only id, title, why, cases, concept, principle, youllLearn, questions and checks (12 also have goDeeper). None has the terms, skills, insight, explore, connections, primers or scenes that all 18 Spine files carry. Every idea is introduced inline, in one concept paragraph of 118 to 432 words, followed by 1 to 3 Cases and 2 to 9 multiple-choice questions.

| id | stage | title | what it actually teaches | Rel | Spine dup / feeds | Names visible (meta) | Depth |
|---|---|---|---|---|---|---|---|
| eco-supply-demand | foundation | Supply, demand and prices | Equilibrium price, a shift versus a movement along the curve, elasticity, price ceilings and export curbs. Case: India's 2019 onion prices | NO | none | 0 | 3 |
| eco-micro-competition | foundation | Competition, market structure and pricing power | Four market structures. Pricing power comes from entry barriers, differentiation and switching costs. When a threat to fight a newcomer is believable (Jio, 2016) | SUP | feeds spine-05-margins (already in its drawsOn); better than spine-05 | 0 | 3 |
| eco-money-banking | foundation | Money, banks and credit creation | A loan creates a deposit. Capital, demand and the policy rate limit lending. A credit-fuelled boom (1992 securities scam) | NO | none | 0 (Harshad Mehta is an actor) | 3 |
| eco-central-banks | foundation | Central banks and monetary policy | Policy rate, open market operations, reserve requirements, expectations, rates and bond prices (1994 Fed) | NO | none (weak link to spine-07, risk-free rate) | 0 | 2 (3 questions; bond prices used before bonds are taught, eco-central-banks.yaml:48) |
| eco-inflation-real | foundation | Inflation, nominal vs real rates | Real rate = (1+nominal)/(1+inflation) − 1. Who gains and who loses. Headline versus core inflation | CORE (the idea; the Topic is framed as macro) | gap: Spine has 0 hits for inflation, nominal or real rate. Should feed spine-02, spine-07, spine-08 | 0 | 3 |
| eco-gdp-cycles | foundation | GDP, growth and business cycles | GDP by spending, real versus nominal GDP, the cycle, leading and lagging indicators, growth paid for with borrowing (India 1990) | SUP | could feed spine-08 (cap on stable growth) and spine-05 (cyclical margins) | 0 | 2 (2 questions) |
| eco-fiscal-debt | foundation | Fiscal policy and government debt | Deficit versus debt, debt-to-GDP, crowding out, leveraged bond holders (UK gilts, 2022) | NO | none | 0 | 2 |
| eco-trade | foundation | Trade and globalisation | Comparative advantage, who wins and loses from tariffs, quotas and licences, import squeeze (India 1991) | NO | none | 0 | 3 |
| in-rbi-policy | foundation | India: RBI, repo rate, liquidity and inflation targeting | LAF, repo and reverse repo, MSF, CRR, SLR, the 4% ±2 inflation target (Sept 2013 package) | NO | none | 0 (Rajan is an actor) | 2 (acronym-dense) |
| in-gsec | foundation | India: G-secs, T-bills, SDLs and the corporate bond market | Indian government securities, why corporate bonds pay more, lakh and crore, whether collateral really exists (1992 scam) | SUP | the rupee risk-free rate that spine-15 uses (spine-15-value-yourself.yaml:41) | 0 | 2 |
| in-economy | foundation | India's economy and the 1991 reforms | Emergency stabilisation versus structural reform, the licence system, devaluation, dual exchange rate, SLR and CRR again | NO | none | 0 (Manmohan Singh is an actor) | 2 |
| bond-pricing | foundation | Bond basics and pricing | Price = present value of promised payments. Par, premium and discount. Long bonds move more | SUP | good bridge for spine-02 ("with payments nobody promised", bond-pricing.yaml:7) | 0 | 3 |
| bond-yield | foundation | Yield to maturity, coupon and current yield | Coupon, current yield and YTM. YTM as the return a price implies. Leverage (Orange County) | SUP | spine-13 (the return a price implies); pre-tax cost of debt for spine-cost-of-capital | 0 | 3 |
| bond-yield-curve | foundation | Yield curve and term structure | Upward, flat and inverted curves. The curve as a forecast of short-term rates (1994) | NO | none | 0 | 3 |
| bond-duration | foundation | Duration and convexity | Macaulay and modified duration, convexity, funding long assets with short money (SVB) | NO | none | 0 | 3 |
| bond-credit-spreads | foundation | Credit spreads, ratings and default | Spread over government bonds (worked: 150 bp), the rating scale, the investment-grade line, flight to safety (LTCM) | CORE | feeds spine-cost-of-capital (already in drawsOn) and spine-10 (reads ratings that the Spine never teaches) | 0 | 3 |
| fx-basics | foundation | Exchange rates and parity | Two-way quotes, appreciation measured from the right base, devaluation, PPP, covered interest parity (rupee 1991) | SUP | gap: currency is absent from the Spine | 0 | 3 (covered interest parity used before forwards are taught, fx-basics.yaml:47-48) |
| fx-bop | foundation | Balance of payments and capital flows | Current and capital accounts, financing a deficit, months of import cover (India 1990-91) | NO | none | 0 | 3 |
| fx-regimes-crises | foundation | Exchange-rate regimes and currency crises | The range from float to hard peg, defending a peg, crisis spirals, foreign-currency debt (Thailand 1997) | NO | none | 0 | 3 |
| der-forwards | foundation | Forwards and futures | Forward versus future, F = S(1+r)^T, contango and backwardation, cost of rolling a hedge (Metallgesellschaft) | NO | none | 0 | 2 |
| der-options | foundation | Options and payoffs | Call and put payoffs, intrinsic value plus time value, protective put, copying an option by trading (1987) | SUP | feeds spine-09 (employee options are given as a figure there) | 0 | 3 |
| der-option-pricing | foundation | Binomial and Black-Scholes | Risk-neutral probability, delta replication, what drives Black-Scholes, model assumptions (LTCM) | SUP (low priority) | spine-09 options | 0 commentators; Scholes, Merton, Black and Meriwether named about 13 times as Case actors | 2 |
| der-rates-fx | foundation | Interest-rate and currency derivatives, swaps | Covered interest parity forward, currency swap, interest-rate swap (FCNR(B) 2013) | NO | none | 0 | 2 |
| der-hedging | foundation | Hedging and risk management | Hedge versus bet, minimum-variance hedge ratio, basis risk, leverage × duration (Orange County) | NO | none | 0 | 2 |
| bank-regulation | foundation | Bank regulation, capital and liquidity | CET1, risk-weighted assets, leverage ratio, LCR, tailoring, gaps in the rules (SVB) | SUP (banks only) | gap: the Spine never values a bank | 0 | 2 (acronym-dense) |
| crisis-bank-runs | foundation | Bank runs and interest-rate risk in banks | Solvent versus liquid, held-to-maturity losses, self-fulfilling runs, deposit insurance, lender of last resort | NO | weak link to spine-10 (solvency versus liquidity) | 0 | 3 |
| struct-securitisation | foundation | Securitisation, MBS and CDOs | Tranches, waterfall, 23% subordination worked out, correlation in CDOs | NO | none | 0 | 3 |
| private-credit | foundation | Shadow banks, private credit and SPVs | Shadow-bank definition, rollover risk, opaque SPVs, NAV runs (IL&FS) | NO | weak link to spine-10 (rollover risk, private-credit.yaml:57) | 0 | 2 |
| funds-passive | foundation | Mutual funds, ETFs and passive investing (incl. India AIFs) | NAV, ETF versus mutual fund, the arithmetic of active versus passive, fees compounding, AIFs | NO | none | Buffett 5, Damodaran 1 (1); "as Damodaran sets it out" in the concept, funds-passive.yaml:53 | 3 |
| ins-risk-transfer | foundation | Insurance and risk transfer | Pooling, law of large numbers, adverse selection, moral hazard, CDS versus insurance (AIG) | NO | none | 0 | 3 |
| real-assets | foundation | Real estate and commodities | Cap-rate value from rent, leverage on a deposit, commodity supply lags, gold has a price but no value from discounting | SUP | spine-02 (perpetuity) and spine-12 (price versus value) | Shiller 2, Damodaran 1 (Damodaran 3, Shiller 3) | 3 |
| hist-macro-regimes | foundation | Inflation regimes and stagflation | Real policy rate, stagflation, quantity versus price targeting (Volcker 1979) | NO | repeats eco-inflation-real's real-rate idea | 0 (Volcker is an actor) | 2 |
| gov-ethics | foundation | Governance, ethics and fraud | The agency problem, related-party deals, checks on insiders (Satyam and Maytas) | SUP | gap: the Spine has 0 hits for governance or related party | 0 | 3 |
| crisis-leverage | foundation | Leverage, liquidity spirals and systemic risk | Leverage ratio, haircuts, margin calls, fire sales (LTCM lenders) | NO | none | 0 | 3 |
| fol-uber-2014 | follow | Follow: Damodaran, crowd valuation of Uber (Dec 2014) | Story to inputs: market × share × slice. Different stories give different values | CORE idea, but a **duplicate** | duplicates spine-04-growth and spine-11; spine-11 borrows its valuation block (spine-11-story-to-numbers.yaml:57) | Damodaran 9 (9) | 2 |
| fol-twitter-ipo | follow | Follow: Damodaran, Twitter IPO valuation (Oct 2013) | An offer price comes from negotiation and underwriting incentives, not from a valuation. Keep price and value apart | SUP | feeds spine-01 and spine-12 (already in drawsOn) | Damodaran 9 (6) | 3 |
| fol-tesla-2020 | follow | Follow: Damodaran, Tesla valuation (Feb 2020) | The four levers defined clearly, industry ranges, the trap of taking the best case on every lever, R&D treated as investment (one question) | CORE idea, but a **duplicate** | duplicates spine-05 and spine-14 (both borrow fol-tesla-2020-diy: spine-05-margins.yaml:17, spine-14-being-wrong.yaml:18); feeds spine-01 | Damodaran 10 (11) | 3 |
| fol-roe | follow | Follow: Damodaran, ROE, earnings yield and efficiency (Feb 2025) | ROE (a book measure) versus earnings yield (a market measure), price to book, good company versus good investment, accounting distortions (R&D) | SUP | feeds spine-06 (already in drawsOn) and spine-12 (no P/E or P/B on the Spine) | Damodaran 12 (7) | 3 |
| fol-sov-ratings | follow | Follow: Damodaran, sovereign ratings and default risk (Jun 2025) | Sovereign rating ladder, rating lags, risk-free rate = government yield minus default spread | SUP | gap: risk-free rate and country risk; feeds spine-07 | Damodaran 8 (5) | 2 (the valuation point is squeezed into the last sentence, fol-sov-ratings.yaml:49-50; uses "riskfree" while the Spine says "risk-free rate") |
| fol-subprime-ai | follow | Follow: Zitron, The Subprime AI Crisis (Sep 2024) | Who pays when a product sells below cost. Run rate, valuation against revenue. Separating reported, inferred and analogy | NO | weak link to spine-05 | Zitron 8 (1) | 2 (learner must paste the article) |
| fol-systemic-risk | follow | Follow: Zitron, OpenAI Is A Systemic Risk (Apr 2025) | Following the money along a chain of dependencies; announced versus received funding | NO | weak link to spine-10 | Zitron 6 (1) | 2 (paste) |
| fol-money-trap | follow | Follow: Zitron, AI Is A Money Trap (Aug 2025) | Run-rate revenue, revenue multiples, gross margin when the main cost is bought from a supplier, a funding round versus profit | SUP | spine-12 and spine-annual-report (run rate and gross margin are absent from the Spine) | Zitron 8 (1) | 2 (paste) |
| fol-erp | follow | Follow: Damodaran, The Price of Risk (Aug 2023) | Historical, Fed-model and implied equity risk premium, and what each assumes | SUP | feeds spine-13 (already in drawsOn) and spine-07 | Damodaran 8 (6) | 3 |
| jud-rating-boundary | judge | Judge: where does junk start? | Each agency's investment-grade line; checking a claim (mislabel, mismatch, overreach) | NO | weak link to spine-cost-of-capital | Damodaran 1 (3) | 2 |
| jud-assumptions | judge | Judge: the no-growth assumption in ROE versus earnings yield | Earnings yield equals the cost of equity only with no growth; growth = retained share × ROE; growth that earns only the cost of equity adds no value | SUP | spine-06 and spine-12 | Damodaran 4 (9) | 3 |
| jud-narrative-numbers | judge | Judge: stories into inputs (Uber 2014 versus outcome) | Sort numbers by where they came from; revenue versus gross bookings versus take rate; three different profit lines; what a filing can and cannot settle | SUP | **duplicates spine-11's Cases** (Uber S-1 2019 is in both) | Damodaran 5 (Damodaran 11, Gurley 8) | 3 |
| jud-ipo-forecast | judge | Judge: Twitter's 2013 IPO valuation versus what happened | Sort errors by kind and size; pro forma versus "as adjusted" share counts; hindsight rule | SUP | spine-09 (share counts); spine-14 (already in drawsOn) | Damodaran 2 (7) | 3 |
| jud-predicted-outcomes | judge | Judge: Zitron's predictions versus later events | Score forecasts claim by claim; forks that cannot lose; required pace | NO | weak link to spine-14 | Zitron 3 (2) | 2 (paste) |
| jud-units-periods | judge | Judge: units, periods and labels | Run rate versus a quarter; "5× = 400% more = 500% of"; look definitions up at the source | SUP | spine-annual-report and the percent primer | Zitron 3 (3) | 3 (paste) |
| jud-filing-vs-claim | judge | Judge: claim versus filing | Trace a number to its line; ties out, mislabel, mismatch or overreach; income statement order; millions versus billions | SUP | spine-annual-report | Damodaran 1, Zitron 2 (D2, Z1) | 3 (paste) |
| jud-rating-conflict | judge | Judge: junk or BB+? | Counting notches; issuer versus issue rating; matching borrower, agency, date and condition | NO | weak link to spine-cost-of-capital | Zitron 5, Damodaran 1 (Z1, D2) | 2 (paste) |
| ana-build-valuation | analyse | Analyse: build a valuation as of a past date | A complete DCF built by hand: revenue path or unit build, margin path, reinvestment, falling cost of capital, FCFF steps, NOLs, terminal value, stable growth ≤ risk-free rate, IPO cash and new shares, options, sensitivity | CORE | the only end-to-end recipe; feeds spine-08, spine-15, spine-annual-report (already in drawsOn) | Damodaran 3 (13) | 4 |
| ana-who-pays-whom | analyse | Analyse: trace who pays whom | Payment chain; operating versus financing cash flow; how long each payment is promised (WeWork) | SUP | spine-03, spine-statements, spine-10 | 0 (Neumann is an actor) | 3 |
| ana-commitments-debt | analyse | Analyse: commitments as debt | Discount the commitment schedule at the pre-tax cost of debt; non-cancellable versus option; dates needed; state the assumption | SUP | feeds spine-09 (already in drawsOn); the Spine states the idea but not the method | Damodaran 2 (5); "Damodaran's treatment … is the model" in the concept, ana-commitments-debt.yaml:61 | 3 |
| ana-india-transfer | analyse | Analyse: transfer to India (G-sec, bank, rupee) | Currency and inflation consistency, converting a rate between currencies, country risk premium, valuing a bank's equity, NPA ratios | CORE | gap: spine-15 uses rupee rates without teaching them (spine-15-value-yourself.yaml:41,64,156) | Damodaran 2 (5) | 3 (three big ideas in one paragraph) |
| ana-decide-between | analyse | Analyse: decide between writers, facts versus framing | Sort claims into fact, definition, forecast and framing; incentives; arguments, not reputations (Blodget versus Grantham, 2000) | NO | none | Blodget 8, Grantham 4 | 3 |
| ana-anthropic-s1 | analyse | Analyse: the writers' opposing readings of the Anthropic S-1 | Check each figure's line, label, period and scope; hedged verbs; framing judged against precedent | NO | none | Damodaran 7, Zitron 6 (D2, Z1) | 2 (paste) |

**Tally:** CORE 6 (fol-uber-2014 and fol-tesla-2020 duplicate the Spine, so 4 are unique). SUP 23. NO 28.
**Visible commentator mentions across the 57:** Damodaran 86, Zitron 41, Blodget 8, Buffett 5, Grantham 4, Shiller 2. Gurley appears only in meta (8).

## (a) CORE and SUPPORTING content that today lives only off the Spine

The evidence that the Spine lacks each item comes from grepping all 18 spine-*.yaml files.

**CORE**
1. **Nominal versus real, and inflation consistency.** Found in eco-inflation-real.yaml:29-33 (exact link at :32) and ana-india-transfer.yaml:86 ("nominal with nominal"). The Spine has 0 hits for "inflation", "nominal" or "real rate".
2. **Currency consistency, and converting a discount rate between currencies.** Found in ana-india-transfer.yaml:86-89 plus its goDeeper, and in fx-basics. The Spine uses a rupee 10-year rate of 7.58% and says "the rupee cost of capital had risen" (spine-15-value-yourself.yaml:41,64) without teaching either. It then defers: "taught in depth in its own Elective" (:156).
3. **Country risk premium, and a risk-free rate cleaned of default risk.** Found in ana-india-transfer.yaml:91-92 (default spread × the ratio of equity to bond volatility) and fol-sov-ratings.yaml:49-50 (government yield minus default spread). The Spine mentions it only in one connection line, spine-15-value-yourself.yaml:156.
4. **Cost of debt from a default spread or rating.** Found in bond-credit-spreads.yaml:40-46 (worked 150 bp at :43, the investment-grade line at :46). The Spine defines cost of debt only as "the interest lenders charge" (spine-cost-of-capital.yaml:73-77), and default spread is just a connection line (:145). Yet spine-10-survival.yaml:55 tells learners to read failure odds from "a bond rating's history of defaults", and the Spine never teaches ratings.
5. **Building a DCF yourself, end to end.** Found in ana-build-valuation.yaml:201-230 and its goDeeper at :234:
   - FCFF steps (:211-212)
   - tax is zero while losses are carried forward (:212)
   - stable growth ≤ risk-free rate (:215)
   - cost of capital falls as beta moves toward 1 (:211)
   - IPO cash and new shares (:218)
   - options are worth at least their intrinsic value (:219)
   - revenue built from units (:205)
   - sensitivity tests (:224)

   The Spine only judges published valuations: spine-15's goal, and ADR 0020 (docs/adr/0020-judge-stories-first-18-topics.md).

**SUPPORTING**

6. **Valuing banks and other financial firms.** ana-india-transfer (equity, P/B against ROE, NPA ratios) and bank-regulation (CET1, LCR). The Spine has none.
7. **How employee options are valued.** der-options.yaml:41-47 (intrinsic value plus time value) and ana-build-valuation.yaml:219. The Spine just hands over "$2,892 million" (spine-09-to-one-share.yaml:108).
8. **Treating R&D as an investment.** fol-tesla-2020.yaml:163-174, fol-roe.yaml:60,117, jud-ipo-forecast.yaml:39. The Spine has 0 hits.
9. **Earnings and book multiples.** fol-roe.yaml:50-60 (ROE versus earnings yield, P/B) and jud-assumptions.yaml:75-84 (g = retained share × ROE). spine-12 has no P/E or P/B (0 hits).
10. **Why equity risk premium estimates differ.** fol-erp.yaml:50-57. spine-07 gives a single figure; spine-13 covers only the implied premium.
11. **Method for turning leases and commitments into debt.** ana-commitments-debt.yaml:59-73. spine-09 says leases "work like debt" but gives no method.
12. **Share counts for a per-share value** (pro forma, "as adjusted"). jud-ipo-forecast.yaml:45,65. The Spine has none.
13. **Reading inputs correctly:**
    - run rate versus reported revenue: fol-money-trap.yaml:48-52, jud-units-periods.yaml:110-116
    - gross margin: fol-money-trap.yaml:54
    - revenue versus bookings versus take rate, and the three profit lines: jud-narrative-numbers.yaml:180
    - income statement order and table units: jud-filing-vs-claim.yaml:137-139

    The Spine has 0 hits for run rate or gross margin.
14. **Competitive structure as the source of margins.** eco-micro-competition.yaml:40-52.
15. **Governance and related-party leakage.** gov-ethics.yaml:49-56. The Spine has 0 hits.
16. **Cycles, and nominal versus real growth as the ceiling for stable growth.** eco-gdp-cycles.yaml:38-44. spine-08 says growth "cannot beat the economy" but never says what the economy's growth is.
17. **Real-asset and commodity businesses, and assets with no cash flow.** real-assets.yaml:43-56. The Spine has 0 hits for commodity.
18. **Rupee risk-free instruments and YTM as the pre-tax cost of debt.** in-gsec.yaml:45-56, bond-yield.yaml:39-48.
19. **Who funds the gap, and liquidity versus solvency** (feeds spine-10). ana-who-pays-whom.yaml:43-50, crisis-bank-runs.yaml:46, private-credit.yaml:57.

## (b) Off-Spine explanations notably better than the Spine's (reusable once names are stripped)

- **fol-tesla-2020.yaml:102-118, the four levers.** Each lever is defined in plain words:
  - year-10 revenue as a dollar figure, because "the dollar figure is easier to judge than a growth rate" (:104)
  - margin "after operating costs, before interest" (:106)
  - sales to capital (:106-107)
  - risk = cost of capital plus the chance of failure (:108)
  - industry ranges for each lever (:110)
  - the trap of taking "the best case on every lever at once" (:118)

  spine-01-worth's concept brings in operating margin only as a parenthetical inside the Amazon example. This is the best available replacement text for spine-01.
- **eco-micro-competition.yaml:40-52, against spine-05-margins.** It names where pricing power comes from (barriers, differentiation, switching costs, :46-47) and gives the credible-threat test. spine-05 says only that rivals come in and that you need an "edge rivals cannot copy".
- **bond-credit-spreads.yaml:40-46, against spine-cost-of-capital.yaml:73-77.** A worked spread (7.9% against 6.4% is 150 bp), why the spread exists, and the investment-grade line.
- **ana-build-valuation.yaml:201-230 and its goDeeper (:234), against spine-08, spine-09 and spine-15.** The only step-by-step recipe for FCFF, terminal value and the equity bridge.
- **ana-commitments-debt.yaml:59-73, against spine-09.** The actual discounting method, and the scope test (fixed versus cancellable).
- **fol-erp.yaml:50-57, against spine-07.** Explains why estimates of the risk premium disagree.
- **eco-inflation-real.yaml:29-33 and its goDeeper (10% nominal with 6% inflation gives about 3.8% real).** Clean, and nothing on the Spine covers it.
- **bond-pricing.yaml:7 and :36-44.** "A company is valued the same way, with payments nobody promised" is a strong bridge for spine-02.
- **fol-twitter-ipo.yaml:51-58.** Why an IPO price is not a value (underwriting incentives, :54). Could enrich price versus value in spine-01 and spine-12.
- **jud-units-periods.yaml:114.** "5 times B means 400% more and 500% of B", a sharp beginner trap for the percent primer.
- **Not better:** fol-uber-2014's concept (:86-87) is nearly the same text as spine-11 (:89), and jud-narrative-numbers reuses spine-11's Cases.

## (c) Topics whose whole premise is a named person

- **A person is named in the title** (outline line):
  - Damodaran: fol-uber-2014 (:1471), fol-twitter-ipo (:1484), fol-tesla-2020 (:1500), fol-roe (:1515), fol-sov-ratings (:1527), fol-erp (:1584)
  - Zitron: fol-subprime-ai (:1541), fol-systemic-risk (:1555), fol-money-trap (:1571), jud-predicted-outcomes ("Zitron's predictions", :1662)
- **Neutral title, but every Case is a named commentator's piece** (`piece.author`):
  - Damodaran: jud-rating-boundary, jud-assumptions, jud-narrative-numbers, jud-ipo-forecast
  - Zitron: jud-units-periods (3 pieces)
  - Damodaran against Zitron: jud-filing-vs-claim, jud-rating-conflict, ana-anthropic-s1
  - Blodget against Grantham: ana-decide-between (ana-decide-between.yaml:18-19)
- **Named in passing only:**
  - funds-passive: the Case is built on Buffett's bet, plus "as Damodaran sets it out" at :53
  - real-assets: Shiller at :21
  - ana-build-valuation: Damodaran in the reveals at :36, :135, :144
  - ana-commitments-debt: :61
  - ana-india-transfer: :171, :185
- **Totals:**
  - 19 of the 23 Follow, Judge and Analyse Topics are built on a named writer's piece.
  - 8 of them make the learner paste the article themselves (`from: paste`; for example fol-subprime-ai.yaml:2,19,163): fol-subprime-ai, fol-systemic-risk, fol-money-trap, jud-predicted-outcomes, jud-units-periods, jud-filing-vs-claim, jud-rating-conflict, ana-anthropic-s1.

## Structural findings that bear on the redesign

1. **The default path breaks progressive disclosure right after the Spine.**
   - The default path is the 18 Spine Topics followed by all 23 Follow, Judge and Analyse Topics, in outline order (src/course/navigator.ts:103-130). Electives are not on it.
   - Every Follow, Judge or Analyse Topic has Elective prerequisites that the path never visits. Counted transitively, that ranges from 8 Electives (fol-systemic-risk) to 46 (ana-anthropic-s1). Most need 20 to 35.
   - The app surfaces these as `unmetPrerequisites` (navigator.ts:219), so nearly every post-Spine Topic would show the learner unmet prerequisites.
2. **The order after the Spine hops between subjects.** outline :1471-1839 runs Uber → Twitter IPO → Tesla → ROE → sovereign ratings → AI subsidies → OpenAI systemic risk → AI money trap → risk premium → junk line → and so on. This is the binge-scroll pattern the owner describes.
3. **Ideas are used before they are taught inside the Electives.**
   - eco-central-banks.yaml:48 uses bond prices, but bond-pricing's own prerequisite chain runs through eco-central-banks.
   - fx-basics.yaml:47-48 uses a forward premium, but der-forwards requires fx-basics.
   - bond-yield.yaml:47 and eco-fiscal-debt.yaml:44 use leverage, which crisis-leverage teaches much later.
4. **Duplication off the Spine.**
   - hist-macro-regimes repeats eco-inflation-real's real-rate idea.
   - in-rbi-policy and in-economy both re-teach SLR and CRR.
   - Pairs built on the same piece: fol-roe and jud-assumptions; fol-sov-ratings and jud-rating-boundary; fol-money-trap and jud-predicted-outcomes; jud-filing-vs-claim and ana-anthropic-s1. fol-uber-2014, jud-narrative-numbers and spine-11 share one piece.
5. **Hard dependency to handle before retiring any Follow Topic.**
   - spine-05-margins.yaml:17 and spine-14-being-wrong.yaml:18 take `valuationFrom: fol-tesla-2020-diy`.
   - spine-11-story-to-numbers.yaml:57 takes `valuationFrom: fol-uber-2014-crowd`.
   - Those valuation blocks must be moved before fol-tesla-2020 or fol-uber-2014 can be deleted.
