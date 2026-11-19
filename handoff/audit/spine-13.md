# Audit: Spine positions 13-18 (spine-11 … spine-annual-report)

All paths are relative to `/home/fedora/developer/finance-agent/course/topics/` unless they start with `src/`, `docs/` or `course/`.
Depth codes: **N** = not explained, **C** = one-line card or gloss, **E** = explained with an example, **D** = explained in depth.
"Here" = brought in by this Topic. "Assumed" = used as if known (the earlier Topic that taught it is given, or "never" if none did).
Word counts come from a YAML walk (script: /tmp/value-it-audit/scripts/wc.py). "Explanatory" = concept + Check card lines + term `means` + goDeeper + primer lines.

## Cross-cutting findings (read first)

1. **The last stretch mostly re-runs earlier Cases instead of moving forward.**
   - spine-11 retells spine-04's Uber 2014 Case: same $17bn round, ~$6bn value, Gurley, $53.4bn, $40bn talk, $45 IPO, $61.7bn, "first and fatally flawed" (spine-04-growth.yaml:29-49 vs spine-11-story-to-numbers.yaml:23-50, 72-76).
   - spine-12 retells spine-09's WeWork/IWG $4.45bn. spine-09 already has a quick try on IWG's $4.45bn (spine-09-to-one-share.yaml:136).
   - spine-13 retells spine-01's Amazon at $84, and its skill is spine-01's stated goal: "say what a price assumes" (spine-01-worth.yaml:12). The Insight is near-verbatim: spine-01-worth.yaml:76 "The price needed a much bigger or richer Amazon than the professor's story" vs spine-13-price-assumes.yaml:100 "the price needed a far bigger or far richer company than the professor's story".
   - spine-14 retells spine-05's Tesla Feb 2020 Case: same $427, $748.96, splits, $1tn, VW revenue / Apple margins, $106-$2,106 (spine-05-margins.yaml:19-36).
   - Amazon Feb 2000 is the Case in spine-01, 07, cost-of-capital, 09, 13, 15 and annual-report. Coffee Day appears in spine-10 and spine-15.
2. **Hidden baselines.** Questions move levers away from starting values that no learner-visible text ever states:
   - spine-11: margin 40%, sales to capital 5, cost of capital 12%→8%, failure 10%. These appear only in a YAML comment (L173-174) but are tested at L202-204.
   - spine-13: 12.84% first appears inside a choice label (L174).
   - spine-14: sales to capital 3 is implied by "a quarter more … than his story" (L135, L291).
   - spine-15: Rs 1.30, 11.8% and Rs 7,660 crore (L171-173). "his 10%" (L193) is never stated in the Amazon story.
   - annual-report: "Cash Rs 135,960m" (L369).
3. **One idea, many names. Nothing reconciles them.**
   - Operating margin is called "what it keeps", "kept as operating profit", "the profit left after costs", "profit from its business", "keeps X% of each sale" and "loses 31 cents of each dollar".
   - Operating income is called "operating profit", "loss from operations", "income from operations", "lost … on its operations" and "operating loss".
   - Sales to capital is called "what growth costs", "sales for each $1 invested", "Sales to capital 5" and "cheaper-to-grow".
   - Cost of capital is called "how risky", "cheaper money" and "cost of capital while it grows".
   - spine-04's "take rate" becomes "revenue slice" in spine-11 (L129), then "Take Rate" again in the same Topic (L66).
   - spine-09's "business value" becomes "enterprise value" in spine-12 (L100). Neither file says they are related, and GLOSSARY.md has no entry for either.
   - spine-11 says "20% of each fare **kept** as revenue" (L25-26). The same verb "keeps" means operating margin everywhere else, and spine-11's own quick try then has to correct exactly that confusion (L341).
4. **Duplicate Lingo cards spend the four-word budget on old words.**
   - equity risk premium: spine-07:73 and again at spine-13:73.
   - operating margin: spine-01:54, spine-05:71 and again at spine-15:97.
   - cost of capital: spine-01:60, cost-of-capital:85 and again at spine-15:103.
   - income statement and balance sheet: spine-statements:84/90 and again at annual-report:150/156.
   - total market and market share: spine-04:80/86 and again at spine-11:117/123.
   - "operating profit" (annual-report:162) is spine-03's "operating income" (spine-03-cash.yaml:87) under another name.
   - Meanwhile the words that really are new are left as parenthetical glosses or have no explanation at all.
5. **Why it happens.** `src/course/beginner-check.ts:12-13` caps a Spine Topic at `MAX_NEW_WORDS = 4` Lingo cards. It counts cards, not terms actually used, so authors move extra words into prose or goDeeper. `src/course/spine-13-beginner.test.ts:4-5` says so: "with EV/EBITDA moved to Go deeper". ADR 0001 says the course check catches a Check "that tests a Skill no earlier card teaches". That check works at Skill level, not term level, so used-before-taught words pass CI.
6. **"Four levers" vs five on screen.** The Value levers widget shows five levers: "Sales in year 10", "Operating margin once mature", "Sales for each $ invested", "Cost of capital while it grows" and "Chance it fails" (`src/widgets/workbench/value-levers-model.ts:203-251`). The Topics keep saying "four levers" (spine-13:20, spine-15:69, spine-15:93), and the fifth lever is tested without being named in the concept.
7. **Names.** Damodaran is named in learner-visible prose and widget casts **62 times** across the six Topics, plus "professor" 7 times and Bill Gurley 10 times. Only spine-12 keeps him to the reveal. Totals per Topic are in the table at the end.

---

## 1. Position 13: spine-11-story-to-numbers

**1. Header.** "How does a story become numbers?" (L6). Goal: "Turn a story about a young company into lever settings, and check that the settings fit together." (L10). 14 min (L8; course/outline.yaml:217-221).

**2. Flow**
- **Moment** (cases[0].story L22-40): December 2014 Uber. Damodaran's June story (a $100bn market, 6% growth, 10% share, 20% slice → $6bn) against Gurley's story ($300bn, 3%, 40% → $53.4bn). Also: the leaked $10bn of fares, a $3.5bn→$700m step, the reader's control ranges, a sample story, the range of sample stories ($799m to $90.5bn) and the $40bn talk. **287 words, 32 numbers.**
- **Concept** (L83-92): each part of the story sets one number. Market, growth, share and slice set size. The edge sets "what it keeps". Growth cost and risk "set the rest". Values differ because stories differ, and a story must hold together.
- **Explore** (L153-182): value_levers in two_stories mode. It opens on $3.58bn of year-10 sales, against a $21.5bn "market grows fast" story. All five levers are on screen. Cast: Damodaran and Bill Gurley. Insight: every lever at its best is a wish (L143-151).
- **Your turn** (L323-376): six taps (which lever a fact moves, a computed which-lever, whether local→global holds, whether a smaller slice holds, price or value).
- **Check**: a quiz drawing 4 of 7 questions, pass at 3 (L308-322), plus conversation s11-talk (L378-390).
- **Reveal** (L41-51; second Case L59-81): the $40bn round. The 2019 S-1 tests the inputs ($495m vs $700m, "not like for like"). Damodaran's 2019 value of $61.7bn, the IPO at $45/$82.4bn, results to 2025.
- **Principle** (L94-99): story first, check the fit, later facts test inputs one at a time.
- **Words:** explanatory ≈ **391** (concept 153, card 61, means 59, goDeeper 118, of which goDeeper is optional). Questions and quick tries ≈ 1,080. Stories and reveals ≈ 732.

**3. Term ledger**

| Term / stand-in | First appears | Depth | Here / assumed |
|---|---|---|---|
| private company ("still private") | story L23 | N | assumed; spine-04:29-30 |
| value / valued ("valued that Uber at about $6 billion") | story L26 | N | assumed; spine-01:48 |
| total market ("$100 billion market") | story L25 | C (card L117) | repeat card; spine-04:80 |
| market growth rate ("growing 6% a year") | story L25 | N | assumed; spine-04 |
| market share ("a 10% share") | story L25 | C (card L123) | repeat card; spine-04:86 |
| revenue slice / take rate ("20% of each fare kept as revenue") | story L25-26 | C (card L129) | renamed; spine-04:92 "take rate" |
| revenue | story L26 | N | assumed; spine-03 goal L16 |
| venture investors | story L26 | N | assumed; spine-04:30 inline gloss |
| funding-round valuation ("put in $1.2 billion at $17 billion") | story L26-27 | N | assumed; spine-04:330 |
| real option ("a chance worth $10 billion or more") | story L29 | N | never taught |
| spreadsheet (valuation model) | story L32 | N | assumed; spine-04:33 |
| fares / gross bookings ("$10 billion of fares") | story L34-35 | N | here; named "Gross Bookings" L47, defined only at L64-65 |
| arithmetic $3.5bn × 20% = $700m | story L35 | N (unshown) | n/a |
| network effect ("how strongly more riders draw more drivers") | story L37 | E, but only in goDeeper L103-108 | here (optional) |
| sample story / range of reader values | story L38-39 | N | here |
| price ("talk of $40 billion", "the $40bn talk") | story L39-40 | N | assumed; spine-01:42 |
| first public filing | reveal L44 | N | assumed; never defined |
| unaudited | reveal L45 | N | never taught |
| accounting rules then in force | reveal L46 | N | never taught |
| like for like | reveal L47 | N | never taught |
| Gross Bookings | reveal L47 | N there; C at L64-65 | used before defined, in file order |
| registration statement (Form S-1), share listing | case 2 story L63 | C (name only) | IPO never defined in Spine (spine-09:43 uses "IPO prospectus" with no gloss) |
| loss from operations | case 2 story L65-66 | N | assumed; spine-03:87 "operating income" |
| Take Rate | case 2 story L66 | N | assumed; spine-04:92 (this Topic's card calls it "revenue slice") |
| total addressable market ($5.7 trillion) | case 2 story L67 | N | assumed (total market) |
| equity value ("valued Uber's shares … $61.7 billion in all") | reveal L72 | N | assumed; spine-09:100 |
| IPO price range ("$44 to $50 range") | reveal L74-75 | N | never taught |
| options and restricted stock | reveal L75 | N | options: spine-09:106; restricted stock never taught (spine-04:131 deck only) |
| raised $8.1 billion (IPO proceeds) | reveal L76 | N | never taught |
| last private round | reveal L76 | N | assumed; spine-04 |
| offer price, first-day close | reveal L77 | N | never taught (spine-06:210 uses "offer price" only in an explanation) |
| operating income ("made $5.6 billion from its operations") | reveal L78-79 | N | assumed; spine-03:87 |
| "how big it gets" (revenue lever) | concept L86 | C | assumed; spine-01:71, spine-04 |
| competitive edge ("its edge over rivals") | concept L87-88 | N | assumed; spine-05:89 |
| operating margin ("what it keeps, the profit left after costs") | concept L88 | C (the gloss drops "share of each sale") | assumed; spine-01:54, spine-05:71 |
| reinvestment ("what growth costs") | concept L88 | N | assumed; spine-03:99, spine-06:74 |
| cost of capital ("how risky the business is") | concept L88-89 | N | assumed; spine-01:60, cost-of-capital:85 |
| narrative | terms L111 | E | here |
| five widget levers incl. sales to capital 5, cost of capital 12%→8%, margin 40%, failure 10% | explore (values only in comment L173-174) | N | assumed; spine-06:80, spine-10:95 |
| sales to capital ("Sales to capital 5 to 10") | question L202 | N | assumed; spine-06:80 |
| chance of failure ("Chance of failure 10% to none") | question L204 | N (not in concept at all) | assumed; spine-10:95 |
| revenue in year 10 ("Share in year 10 25% to 40%") | question L201 | N | assumed; spine-04 |
| pre-money valuation ("$17 billion before the new money") | question L296 | N | never taught (spine-04:31 has "before counting their new money", unexplained) |
| price vs value | question L294-304 | C | assumed; spine-01:42-53 |

**4. Jumps**
- The Moment is a wall of figures: 287 words with 32 numbers, two people's stories, a leaked document, reader ranges and sample stories, all before the concept (L22-40).
- "Damodaran counted giving up cars apart, as a chance worth $10 billion or more" (L29): an option-like idea dropped mid-sentence and never taught.
- "Gross Bookings" is used at L47 but defined only at L64-65.
- "unaudited, kept under the accounting rules then in force … so the two are not like for like" (L45-47): three accounting ideas in one clause, none taught.
- The concept says "What growth costs and how risky the business is set the rest" (L88-89). That is 9 words for two levers, and failure is not mentioned, yet s11-q-lever tests both (L202-204).
- The widget opens with margin 40%, sales to capital 5, 12% falling to 8% and 10% failure, but those values appear only in an author comment (L173-174). The questions say "Sales to capital 5 to 10" and "Cost of capital 12% to 10%" (L202-203) from bases the learner never saw.
- "kept as revenue" (L25-26) vs "what it keeps" (L88). The quick-try fix "The slice is revenue, so it sits in how big it gets" (L341) repairs a confusion the story created.
- "$17 billion before the new money" (L296): pre-money is not taught.
- In the second story's label, "growing fast" stands in for 10.39% a year (comment L178-182). The learner is not told how $21.5bn follows.
- Repeats spine-04's Case almost entirely (see cross-cutting 1).

**5. Names** (learner-visible, non-`source` fields)
- Damodaran, **16**:
  - case titles and stories: title L20, story L24, L29, reveal L43, L50, case-2 story L67, reveal L72
  - Lingo card: inStory L116
  - widget: cast L167, below L169, story label L175
  - questions and checks: explanation L210, choice L220, prompts L242 and L260, quick try L371
- "valuation professor": **1** (L24).
- Bill Gurley, **10**: story L27, L30, inStory L116, cast L168, near L170, above L171, says L182, prompt L242, quick try L371, talk L381.
- Bloomberg (news outlet): 1 (L42).
- `source` fields name Damodaran 3× (L256, L273, L291) and Gurley 1× (L255). These do not appear to be rendered: `src/app/quiz-panel.tsx` has no `source` reference.

**6. Depth verdict: 2/5.** The three worst problems:
1. Binge-style Moment: 32 numbers and two narrators before any teaching (L22-40).
2. The concept dismisses three of the five levers in one clause (L88-89), while the widget and questions move those levers from hidden values (L173-174, L202-204).
3. It re-runs spine-04's Uber Case with a renamed term ("revenue slice" for "take rate", L129) and a verb clash ("kept as revenue", L25).

**7. Contribution to the goal.** Turning a narrative into lever settings, and checking that a story is internally consistent (the "narrative → numbers" step). **Missing:**
- How to set growth from a base-year revenue, not only market × share × slice.
- How to pick margin, reinvestment and risk settings that fit the story.
- How to tell a plausible story from a merely possible one.
- A worked conversion: story → $3.58bn of year-10 sales → value.

---

## 2. Position 14: spine-12-price-or-value

**1. Header.** "Is a price a value? Multiples and comparables" (L12). Goal: "Read a multiple as a price, and say what growth, margins and risk it would need to hold" (L16). 13 min (L14; outline L240-244).

**2. Flow**
- **Moment** (L28-36): WeWork's $47bn round is 26× 2018 revenue. IWG has the same desks and is priced at 1.4×. Is $47bn a value?
- **Concept** (L52-62), with **primer** at concept (L119-139): a multiple is price over a measure; a comparable must be alike; a multiple hides growth, margin and risk; other denominators (profit, the whole business). Primer: enterprise value; shareholders are paid after lenders; match shares with sales only when debts are alike.
- **Explore** (L149-186): multiple_decoder. Sliders: growth in years 1-5, cost of capital, operating margin. Held still and shown on screen: "Holding tax at 25%, 1.68 of sales for each unit invested and growth after year 10 at 1.6%" (`src/widgets/workbench/multiple-decoder-model.ts:159`). The justified multiple is plotted against WeWork at 26× and IWG at 1.4×.
- **Your turn** (L328-407): seven taps (price or value ×2, best comparable, EV vs P/E across different debt, what explains the gap, a computed least-moving change, which story justifies 26×).
- **Check**: a quiz drawing 4 of 8 (L313-327), plus talk (L408-412).
- **Reveal** (L37-46): Damodaran on 9 Sep 2019 ($26 a share, ~$10bn), the IPO withdrawn, the SoftBank rescue at ~$8bn.
- **Principle** (L81-85).
- **Words:** explanatory ≈ **540** (concept 167, card 45, means 52, goDeeper **227**, primer 49). 42% of it is optional goDeeper. Questions and quick tries ≈ 1,330.

**3. Term ledger**

| Term / stand-in | First appears | Depth | Here / assumed |
|---|---|---|---|
| lease, members, short contracts | story L29-30 | C (plain words) | assumed; spine-09:112 "lease obligations" |
| funding-round valuation ("at a valuation of $47 billion") | story L30 | N | assumed; spine-04:330, spine-09:296 |
| selling shares to the public (IPO) | story L31 | C (plain words) | IPO never defined in Spine |
| revenue ("sold $1.82 billion") and loss ("lost $1.93 billion", which loss is not said) | story L31-32 | N | assumed; spine-statements:102 |
| growth rate ("growing 86% a year") | story L32 | N | assumed |
| multiple ("about 26 times its 2018 revenue") | story L32-33 | E (card L88, concept L53) | here; used in Moment before card |
| listed (on an exchange) | story L33-34 | N | never taught |
| profit ("makes a small profit") | story L34 | N | assumed |
| market capitalisation ("the stock market puts IWG's shares at $4.45 billion") | story L35 | N | assumed; spine-06:260 (mistake fix only), spine-09:136 |
| operating margin ("a margin of 12.5% from year 6") | reveal L39 | N | assumed; spine-01:54, spine-05:71 |
| cost of capital ("near 8%") | reveal L39 | N | assumed; cost-of-capital:85 |
| chance of failure ("one-in-five chance that WeWork fails") | reveal L39-40 | N | assumed; spine-10:95 |
| value per share / equity value ("$26 a share, about $10 billion for the shares") | reveal L40-41 | N | assumed; spine-09:100 |
| IPO proceeds ("hoped-for money from the listing") | reveal L40-41 | N | never taught |
| IPO valuation, IPO withdrawn | reveal L43-44 | N | IPO never defined |
| rescue (down round) | reveal L44-45 | N | never taught |
| comparable | concept L55 | E (card L94) | here |
| "how much of each sale is kept" (margin) / "how risky that cash is" (risk) | concept L56-57 | C | assumed |
| profit multiple (P/E, in plain words) | concept L60 | N | never taught |
| "the whole business, lenders included, against what it earns" (EV/EBIT) | concept L60-61 | N | here, unnamed |
| enterprise value | primer L123 / card L100 | E | here; **conflicts** with spine-09:94 "business value" (never linked) |
| shareholders as residual claimants ("what is left once the lenders are paid") | primer L124 | C | assumed; spine-09:100 |
| justified multiple | card L106 | C (example L109); no mechanism shown | here |
| EV/EBITDA | goDeeper L66 | E (café example L67-68) | here (optional); EBITDA: spine-06:92 |
| "wear on the assets" (depreciation) | goDeeper L67 | C | assumed; spine-06:92 |
| earnings | goDeeper L66 | N | never used in any earlier Spine Topic |
| price-to-earnings | goDeeper L71 | C | here (optional) |
| PEG ratio | goDeeper L75-79 | C | here (optional) |
| revenue growth years 1-5 / cost of capital / operating margin sliders | explore (widget) | N | assumed |
| tax 25%, sales per unit invested 1.68, growth after year 10 1.6% | explore caption (multiple-decoder-model.ts:159; values at L176) | N | assumed; spine-06:80, spine-08:83 |
| "growth that costs more than it earns" (0× headline) | widget (multiple-decoder-model.ts:129) | N | assumed; spine-06:86 |
| mature margin ("keeps 13% of each sale once it is grown up") | question L199 | C | assumed; spine-05:77 |
| "cost of capital is a point higher, at 9%" | question L208 | N | base 8% is only in the reveal L39, yet the decoder opened at 9% (L177) |
| "Nothing left for shareholders" | question L224 | N | assumed; spine-09 |
| present value ("what WeWork's future cash is worth today") | question L242 | N | assumed; spine-02:73 |
| run-rate ("revenue was running at $3.3 billion a year") | question L254 | N | never taught |
| fixed costs / operating leverage (long leases, short contracts) | question L269-280 | C (in explanation) | here |
| fit-out spending (reinvestment) | question L289 | N | assumed; spine-03:99 |
| "More risk means a higher cost of capital, which pulls a multiple down" | mistake fix L305 | C | here, only shown on a wrong tap |
| EBITDA in plain words, P/E, "borrowed heavily" | quick try L362-372 | N in the main path (goDeeper only) | tests goDeeper content |

**4. Jumps**
- The reveal and questions give three different WeWork stories, with clashing baselines:
  - decoder opening: 50% growth, 9% cost of capital, 10% margin (L177)
  - question preset: 13% margin, 25% failure (L199, L205)
  - Damodaran's reveal: 60%, 12.5%, ~8%, 20% failure (L38-40)
  - The decoder opens the learner at 9% cost of capital. s12-q-lever then calls 9% "a point higher" (L208) against an 8% base shown only in the reveal, which comes later.
- The justified multiple is never derived. The card says "The multiple a story about growth, margins and risk can support" (L107), with no worked case of how 50% growth and a 10% margin become N× sales. The widget does all the work.
- The primer says "set shares against sales only for companies with like debts" (L125). The Topic then compares WeWork's equity price/sales (26×) with IWG's shares-only price/sales (1.4×), and the decoder's justified multiple is the engine's value of the business per unit of revenue (`multiple-decoder-model.ts:17-18`). WeWork's $22bn of leases (comment L47-49) make the debts unlike. None of this is addressed.
- goDeeper crams EV/EBITDA, depreciation, P/E, interest effects, PEG and the "fair by habit" idea into 227 words (L65-79). The file says "No Check, Skill or Lingo term tests it" (L64), yet s12-try-ebitda (L360-372) tests the P/E-vs-EV-and-debt reasoning that is laid out only in goDeeper (L71-74).
- "running at $3.3 billion a year" (L254): run-rate, unexplained.
- The concept reduces a multiple to "the same three beliefs" (L61-62: growth, margin, risk), yet s12-q-hold tests that growth costs money (L284-296) and the decoder holds sales to capital at 1.68.
- "enterprise value" is brought in as new (card L100) for the same IWG figure spine-09 used to teach "business value"/"equity value" (spine-09-to-one-share.yaml:94-101, 136).

**5. Names**
- Damodaran **1** (reveal L38). The comment (L7) says he is kept to the reveal on purpose.
- Adam Neumann 1 (L43, a person in the Case, not a commentator).
- Forbes 1 (quick try L331, news outlet).
- "An analyst" 1 (generic, L242).
- `source` fields: Damodaran L251, journalist Konrad Putzier L311 (not rendered in the quiz panel).

**6. Depth verdict: 2/5.** The three worst problems:
1. The justified multiple, the Topic's core idea, is computed by the widget and never explained (L106-111, L149-177).
2. Three WeWork stories with clashing baselines (L177, L199-208, L38-40).
3. The EV/business-value vocabulary forks from spine-09, and goDeeper-only content is tested (L100, L360-372).

**7. Contribution to the goal.** Pricing vs value; reading a multiple as an implied story (the "relative valuation" step). **Missing:**
- An actual relative valuation: choosing a peer group, computing a median or average multiple, applying it to the company's revenue or earnings, and adjusting for differences in growth, margin and risk.
- Matching EV-based multiples with business-level measures and equity multiples with equity measures, as a procedure.
- When multiples fail (negative earnings, different leases).

---

## 3. Position 15: spine-13-price-assumes

**1. Header.** "What does the price assume?" (L8). Goal: "Read a price backwards into the story it needs, and judge whether that story is believable" (L9). 13 min (L11; outline L258-262).

**2. Flow**
- **Moment** (L18-22, 69 words): Amazon at $84. "four levers", but only two are given ($39bn of sales, a 10% margin) → $35. "what would buyers at $84 have to believe?"
- **Concept** (L47-53): forwards vs backwards. Hold what you trust and move levers until value = price. Several stories reach a price. The same move for a market gives the implied premium.
- **Explore** (L106-128): value_levers in match_price mode. The price story is $60bn and 12.5%. The readout lists the one-lever routes. Market reading: US 10-year Treasury, end of 1999. Cast: Damodaran and "The market".
- **Your turn** (L252-304): six taps (which way to move, what $84 leans on, index up → premium down, the price cannot pick a story, all-best = wish, the premium moved).
- **Check**: a quiz drawing 4 of 7 (L237-251), plus talk (L305-309).
- **Reveal** (L23-29): Amazon's 2009 sales of $24.5bn at a 4.6% margin, the 2011 margin of 1.79%, Damodaran quotes. Second Case: the 2007 implied ERP story L34-39 and reveal L40-45 (2008 crash, 6.43%).
- **Principle** (L55-59).
- **Words:** explanatory ≈ **247** (concept 128, card 56, means 63, goDeeper 0). Questions and quick tries ≈ 1,170.

**3. Term ledger**

| Term / stand-in | First appears | Depth | Here / assumed |
|---|---|---|---|
| share price ("shares trade at about $84") | story L19 | N | assumed; spine-01:42 |
| losing money | story L19 | N | assumed |
| four levers | story L20 | N (only two given) | assumed; spine-01:71 |
| revenue in year 10 ("$39 billion of sales in ten years") | story L20 | N | assumed; spine-04 |
| operating margin / operating profit ("10% of each sale kept as operating profit") | story L21 | N | assumed; spine-01:54, spine-05:71 |
| value per share ("about $35 a share") | story L21 | N | assumed; spine-09 |
| what the price assumes ("turns the question round") | story L21-22 | C (card L67) | here, but already spine-01's goal (spine-01:12) and Insight (L76) |
| operating income ("operating income of $1,129 million, a margin of 4.6%") | reveal L24-25 | N | assumed; spine-03:87 |
| forecast vs actual ("forecast revenues 'were higher than the actual numbers'") | reveal L27-28 | N | here |
| S&P 500 / index | case 2 story L35 | C (inline gloss; card L85 has no `pro`) | here; "index" never in an earlier Spine Topic |
| safe government bond yield / risk-free rate ("Safe US government bonds pay 4.02%") | case 2 story L35-36 | N (unnamed) | assumed; spine-07:67 |
| equity risk premium ("extra return … from shares over the bonds") | case 2 story L36-37 | C (card L73) | **repeat** card; spine-07:73 |
| expected payouts ("the cash the companies are expected to pay out") | case 2 story L37 | N | never taught (dividends and buybacks never taught) |
| percentage points ("4.37 points") | case 2 story L38 | N | assumed; cost-of-capital:91-95 |
| historical premium ("take one premium from history") | case 2 story L38-39 | N | assumed; spine-07:58 (touch) |
| Treasury bond rate | case 2 reveal L41-42 | N | assumed; spine-07:72 |
| dividend yield | case 2 reveal L42 | N | **never taught** anywhere in the Spine |
| implied premium | case 2 reveal L42 | C (card "implied" L79) | here; spine-07:24, 58, 78 used "implied" without definition |
| the engine | concept L48 | N | assumed; spine-01 |
| "hold what you trust" | concept L49 | N | here |
| expected cash flows worth the index's level (solving for a rate) | concept L52-53 | N | assumed; spine-02 goal L11 "find the rate that makes two offers equal" (link not drawn) |
| risk-free reading (US Treasury end-1999) | explore readings L128 | N | assumed; spine-07:67 |
| five widget levers incl. "Chance it fails" | explore | N | assumed; spine-10:95 |
| cost of capital ("His story with a 10% cost of capital") | question L150 | N (base not given) | assumed; cost-of-capital:85 |
| sales to capital ("$5 of sales for each $1 invested") | question L161 | N | assumed; spine-06:80 |
| chance of failure ("a 20% chance it fails") | question L162 | N | assumed; spine-10:95 |
| 12.84% cost of capital | question L174 | N | first appearance is inside a choice label |
| recovery on failure ("with nothing recovered") | question L175 | N | assumed; spine-10:89 |
| "Nothing left for shareholders" | question L190 | N | assumed; spine-09 |
| cost of equity | explanation L221 | N | assumed; spine-07 |
| "cheaper-to-grow Amazon" (sales to capital) | quick try L260 | N | assumed |
| "cheaper money" (cost of capital) | quick try L265 | N | assumed |
| price up, return down for the same cash | quick try L273-279 | C (fix only) | assumed; spine-02 |

**4. Jumps**
- "sets his story as four levers: $39 billion of sales in ten years, with 10% of each sale kept as operating profit" (L20-21) names four levers and gives two.
- "A cost of capital of 14%, not 12.84%" (L174): 12.84% first appears inside an answer choice. "His story with a 10% cost of capital" (L150) moves from an unstated base.
- The second Case jumps from one company to the whole market: index, expected payouts, solving for a premium, and "dividend yield" (L42, never taught). The concept covers it in one clause (L52-53).
- The reveal says he over-forecast revenue: "higher than the actual numbers every year through 2010" (L27-28). It then quotes him calling Amazon "a company that I have consistently under estimated" (L28) with no explanation of the apparent contradiction.
- No worked backward example. The engine solves it. The concept never walks through "hold margin at 10%: what sales reach $84?"
- Both cards and Insight duplicate spine-01 (spine-01-worth.yaml:12, 76).
- s13-q-size-alone says "a bigger company or a richer one alone, by these amounts, falls short" (L143). s13-try-alone says "a much bigger Amazon alone can reach $84, and so can a much richer margin alone" (L265). The two are consistent only if you notice "by these amounts" vs "much".

**5. Names**
- Damodaran **14**:
  - stories and reveals: story L20, reveal L25, case-2 story L36, case-2 reveal L42
  - Lingo cards: inStory L72, L78
  - widget: caseStory label L113, cast L121, near L124
  - questions, quick tries and talk: prompts L141, L193; quick tries L255, L265; passCriteria L308
- "professor" **3** (L20, Insight L100, explanation L167).
- `source` fields: 3 (L206, L222, L235).

**6. Depth verdict: 2/5.** The three worst problems:
1. Thin: a 128-word concept, no goDeeper, no worked backward solve (L47-53).
2. Hidden or partial lever settings: "four levers" with two given (L20-21), and 12.84% first shown in a choice (L174).
3. A second, harder idea (implied market premium, dividend yield) bolted on in one clause (L34-45, L52-53). The core skill repeats spine-01.

**7. Contribution to the goal.** Pricing vs value: reverse-engineering what a price implies, and where the market's risk premium comes from. **Missing:**
- A step-by-step backward solve the learner could repeat without the engine.
- How to judge whether the implied settings are plausible (against industry margins, market size and history).
- How an implied ERP is actually used in a cost of capital.

---

## 4. Position 16: spine-14-being-wrong

**1. Header.** "How do you live with being wrong?" (L8). Goal: "Give a value as a range, and name the lever that would change your mind" (L9). 14 min (L11; outline L279-283).

**2. Flow**
- **Moment** (L19-25): Tesla at $427 from four lever settings. He sells his shares at $640. A 100,000-draw simulation gives "eight times in ten" between $237 and $673. The price hits $887.
- **Concept** (L34-40): a value is a range. Move each lever over its likely span, rank the levers by effect, watch the top one, and when the price is outside the range ask which lever buyers set differently. Moving one lever gives a narrower range than the simulation.
- **Explore** (L89-114): value_levers in range mode, with per-lever bands (revenue $91-171bn, margin 9.23-15.28%, sales to capital 2.2-3.8, risk 6.36-7.64%). The readout gives the range and a "By effect" ranking (`value-levers-model.ts:544`). Cast: Damodaran and "You".
- **Your turn** (L247-326): seven taps (range vs point, percentile, which lever to watch, computed lift, anchor vs news, rivals → margin, a price falling back proves nothing).
- **Check**: a quiz drawing 4 of 8 (L232-246), plus talk (L327-331).
- **Reveal** (L26-32): 15-for-1 splits, ~$5,124 per Feb-2020 share in Oct 2021, his stories ran $106-$2,106, the "Volkswagen-like revenue and Apple-like margins" quote.
- **Principle** (L42-46).
- **Words:** explanatory ≈ **243** (concept 121, card 61, means 61, goDeeper 0). Questions and quick tries ≈ 1,060.

**3. Term ledger**

| Term / stand-in | First appears | Depth | Here / assumed |
|---|---|---|---|
| value per share ("about $427 a share") | story L20 | N | assumed; spine-09 |
| revenue in year 10 ("$126 billion of sales in 2030"; 2030 = year 10 not said) | story L21 | N | assumed; spine-04 |
| operating margin ("keeping 12% of each sale") | story L21 | N | assumed; spine-01:54, spine-05:71 |
| cost of capital ("a 7% cost of capital") | story L21-22 | N | assumed; cost-of-capital:85 |
| chance of failure ("one-in-ten chance it fails") | story L22 | N | assumed; spine-10:95 |
| reinvestment ("what its growth costs") | story L23 | N (no value given) | assumed; spine-06:80 |
| simulation ("draw those four 100,000 times") | story L23-24 | E (card L59, dice example L62) | here |
| probability distribution ("a spread of likely values") | story L24 | N | never taught |
| 10th-90th percentile ("Eight times in ten … between about $237 and $673") | story L24-25 | C (card "percentile" L64-68 defines 90th only) | here; the mapping from "eight in ten" to 10th-90th is not explained |
| range of values | card L54 | E | here |
| stock split ("split each February 2020 share into 15") | reveal L27-28 | C (by consequence) | assumed; spine-05:31 used it unexplained |
| market value / market cap ("market value passed $1 trillion") | reveal L29 | N | assumed; spine-06:260 (fix only) |
| comparator margins/revenue ("Volkswagen-like revenue and Apple-like margins") | reveal L31-32 | N | assumed; spine-05:22-23, 31 |
| sensitivity ranking ("Rank the levers by how far they move it") | concept L36-37 | C | here (unnamed) |
| anchoring | card L69 | E | here |
| lever bands (10th-90th of his simulation) | explore L110-114 (comment L97-99) | N | here |
| "a quarter more sales per $1 invested than his story" | question L135 | N (base 3 never stated) | assumed; spine-06:80 |
| mature margin ("his margin ends at 8.3% (Volkswagen's)") | question L155 | N; the VW 8.3% appears nowhere else in the Spine | assumed; spine-05:77 |
| "a 6.36% cost of capital" | question L172 | N (a band edge, unexplained) | n/a |
| competitive pressure on margins ("Rivals … cut their prices") | question L175-187 | C | assumed; spine-05:89 |
| reinvestment needed for growth ("builds almost no new factories") | question L207-213 | C | assumed; spine-06 |
| median/centre ("centred near $400") | quick try L256 | N | never taught |
| share count | quick try L314 | N | assumed; spine-09 |

**4. Jumps**
- The simulation is described in one sentence: "has a computer draw those four 100,000 times from a spread of likely values" (L23-24). How a spread is chosen, what one draw is, and how results become a range are all left out.
- "Eight times in ten the value lands between about $237 and $673" (L24-25). The percentile card defines only the 90th (L65). The link from 10th to 90th and "eight in ten" is never made, though quick try L250 relies on it.
- The story lists four guesses including "what its growth costs" (L23) but gives no value for it. The questions then use "a quarter more" and "a sixth more sales per $1 invested than his story" (L135, L291).
- "his margin ends at 8.3% (Volkswagen's)" (L155): a new number with no source in the learner text. "a 6.36% cost of capital" (L172) is an unexplained band edge.
- The concept asserts "Moving one lever at a time gives a narrower range than his simulation" (L39) with no reason.
- "with the price at $640, he sells his own shares" (L22): that he owned shares, and why it matters, is not set up.
- It re-runs spine-05's Case and reveal almost verbatim (spine-05-margins.yaml:19-36).
- None of the four `terms` has an `emoji` field (L54-73). `src/course/scenes.ts:43-45` `buildTermCard` returns null for such terms. The only caller found is `src/app/dev/scenes/page.tsx`, so the effect on the learner-facing card is unverified.

**5. Names**
- Damodaran **10**:
  - case title L16, story L20
  - Lingo card: inStory L63
  - widget: caseStory label L96, cast L105, below L107, above L109
  - connection L119 (rendered in the Notebook: `src/app/notebook/filled-part.tsx:54-58`)
  - explanation L187, talk L329
- "professor" **1** (L20).
- `source` fields: 3 (L188, L214, L230).

**6. Depth verdict: 3/5.** The core message (a value is a range; watch the top lever; change your mind on news, not on price) is clear and well drilled. The three worst problems:
1. The simulation and percentiles are named but not explained (L23-25, L64-68).
2. Hidden reinvestment baseline and unexplained figures (L135, L155, L172).
3. A re-run of spine-05's Tesla Case, so nothing new is shown (spine-05-margins.yaml:19-36).

**7. Contribution to the goal.** Uncertainty and sensitivity: stating a value as a range and knowing which lever matters. **Missing:**
- How to set a plausible low and high for each lever (from industry data or the company's history).
- A worked one-lever-at-a-time sensitivity table the learner builds.
- How to read a simulation's output beyond one band.

---

## 5. Position 17: spine-15-value-yourself

**1. Header.** "Judge a published valuation, as of a past date" (L13). Goal: "Judge a published valuation as of a past date: the lever it rests on, and what the price assumed" (L14). 15 min (L16; outline L296-300). The id says "value-yourself", but the learner judges and does not value (comment L4-6; ADR 0020).

**2. Flow**
- **Moment**: three Cases, picked by chip.
  - Amazon (L25-28, 57 words): **no lever settings given**.
  - Coffee Day IPO in rupees (L38-44): a "course story", 15% margin.
  - Zomato IPO (L53-59): Damodaran's Rs 16,600 crore of sales, 35% margin.
- **Concept** (L67-73): fix the date; read four levers; find the lever the value rests on; check the story holds (growth needs capital, rivals cap margins); ask what the price assumes. Then: what the widget's bars mean (yearly cash after tax and growth, plus "one bar for every year after year 10").
- **Explore** (L124-151): value_levers in match_price mode with three Case chips. Cast: "You" and "The market".
- **Your turn** (L287-365): seven taps (as-of ×3, a reason for a 35% margin, which Coffee Day story holds, what to ask first, a computed price_assumes).
- **Check**: a quiz drawing 4 of 8 (L272-286). No conversation Check.
- **Reveal**: Amazon (L29-33), Coffee Day (L45-48), Zomato (L60-65).
- **Principle** (L75-79).
- **Words:** explanatory ≈ **255** (concept 115, card 45, means 95, goDeeper 0). Two of the four cards repeat earlier ones. Questions and quick tries ≈ 1,200.

**3. Term ledger**

| Term / stand-in | First appears | Depth | Here / assumed |
|---|---|---|---|
| share price ("its shares cost $84") | Amazon story L26 | N | assumed; spine-01:42 |
| trailing twelve months ("In the twelve months to September 1999") | Amazon story L27 | N | never taught as an idea |
| operating loss ("lost $410 million on its operations") | Amazon story L27 | N | assumed; spine-03:87 |
| industry margin ("Specialty retailers keep about 10% of each sale") | Amazon story L27-28 | N | assumed; spine-05:83 "industry median" |
| Value levers (widget) / published story | Amazon story L28 | N | assumed (product term) |
| margin as cents per dollar ("about 31 cents of each dollar") | Amazon reveal L31-32 | C | assumed |
| IPO / listing / issue price ("priced its shares at Rs 328 for its listing") | Coffee Day story L39-40 | N | IPO never defined in the Spine |
| Rs (rupee) | Coffee Day story L39 | N | spine-10 used ₹, never Rs |
| crore | Coffee Day story L40 | N | **never defined** (spine-10:26 uses it without a gloss) |
| operating margin ("kept about 4.4% of each sale as profit from its business") | Coffee Day story L40-41 | N | assumed; spine-05:71; repeat card L97 |
| local-currency risk-free rate ("lending to India's government for ten years pays 7.58%") | Coffee Day story L41-42 | C (plain words) | assumed; spine-07:67 (unnamed here) |
| hurdle above the risk-free rate ("a café chain has to promise more than that") | Coffee Day story L42 | C | assumed; spine-07 |
| course story vs expert's story | Coffee Day story L43 | C | here |
| BSE (stock exchange) | Coffee Day reveal L47 | N | glossed only later, in annual-report L47 |
| issue price, first-day close | Coffee Day reveal L46-47 | N | never taught |
| offer price ("which buyers pay before the shares first trade") | Zomato story L54-55 | C | here (inline) |
| oversubscription ("bids for many times the shares on offer") | Zomato story L57 | C (plain words) | here |
| platform | Zomato story L58 | N | assumed; spine-04:93 mention |
| lock-up expiry ("when early holders were free to sell") | Zomato reveal L63 | C (plain words) | here |
| rupee cost of capital ("mostly because the rupee cost of capital had risen") | Zomato reveal L64 | N | never taught (country risk is in an Elective) |
| as-of date | concept L68 / card L87 | E | here |
| four levers (named in plain words) | concept L68-69 | C | assumed; spine-01:71 |
| "growth needs capital" / "margins are capped by what rivals allow" | concept L70-71 | C | assumed; spine-06, spine-05 |
| free cash flow ("the cash it makes each year, left after tax and after paying for growth") | concept L71-73 | C (unnamed) | assumed; spine-03:93 |
| terminal value ("one bar for every year after year 10") | concept L72-73 | C, ambiguous: reads as one bar per year | assumed; spine-08:77 |
| Valuation story | card L92 | E (maps the 4 levers to metrics) | here (product term); omits the 5th lever |
| cost of capital | card L103 | E | **repeat** card; spine-01:60, cost-of-capital:85 |
| sales per rupee invested ("Rs 1.56, not Rs 1.30") | question L171 | N (base hidden) | assumed; spine-06:80 |
| "cost of capital 11.8% to 9.44%" | question L172 | N (11.8% never derived) | n/a |
| "sales in ten years Rs 7,660 crore" | question L173 | N (never in the story) | n/a |
| chance of failure ("with no chance it fails") | question L184 | N | assumed; spine-10:95 |
| "margins end at 4%, not his 10%" | question L193 | N (his 10% not in the Amazon story) | n/a |
| use of IPO proceeds / capex ("Rs 288 crore … new cafés, vending machines and a roasting plant") | question L216 | N | assumed; spine-03:99 |
| barriers to entry ("Rivals can enter … freely") | question L236-241 | C | assumed; spine-05:89 |
| "loses about 37 cents of each dollar" ($410m / $1,117m) | question L257 | N (arithmetic unshown) | n/a |
| "a 12.84% cost of capital" | question L266 | N | assumed; spine-01:62 (pro) |
| bond yield ("India's 10-year bond yield") | quick try L309 | N | "yield" never defined (spine-07:70 uses it) |
| moat ("Two apps share the market, and new rivals struggle to get in") | quick try L330 | C | assumed; spine-05:89 |

**4. Jumps**
- The Amazon Moment states none of the story's lever settings (L25-28). The questions then test "his 10%" (L193), "$39bn in year 10" and "12.84%" (L263-266). The reveal cites "about 13 cents in the first year" (L32), never set up.
- Coffee Day brings in crore, Rs, issue price, BSE, a rupee risk-free rate and an 11.8% rupee cost of capital (L39-47, L172) with no teaching. The connection text defers this to an Elective (L156-157).
- "a fifth more … Rs 1.56, not Rs 1.30" and "Rs 7,660 crore to Rs 9,192 crore" (L171-173): bases never shown.
- yourself-q-direction (L214-229): raising money for new cafés and a roasting plant. The "what growth costs" lever is **not offered** as a choice, and the explanation admits "they cost capital to build" (L228).
- The concept explains the widget's bars for the first time at Topic 17 (L71-73), in a sentence that reads as "one bar per year after year 10".
- "today it loses about 37 cents of each dollar" (L257): unshown division of story figures.
- Uses "four levers" (L69, L93) while the widget and questions use a fifth (failure, L184).

**5. Names**
- Damodaran **9**: reveal L30, Zomato story L57, Zomato reveal L61, prompts L176, L245, L257, quick tries L313, L324, L347.
- "one professor's published story" **1** (L28).
- `source` fields: 2 (L242, L270), plus URLs.

**6. Depth verdict: 2/5.** The three worst problems:
1. Hidden lever settings across all three Cases (L25-28 vs L171-173, L193, L257-266).
2. The Indian Case relies on untaught currency, IPO and risk-free mechanics (L39-47, L64, L172).
3. Effectively no new teaching. Two of the four cards are repeats (L97-108), the concept is 115 words, and there is no conversation Check.

**7. Contribution to the goal.** Synthesis: reading a full published valuation lever by lever, as-of discipline, and comparing value to price. **Missing:**
- Building a valuation (the Spine never asks the learner to set all levers from data; ADR 0020 defers this to Assignments).
- Deriving a cost of capital for a non-US company (country risk, currency).
- Checking the base-year inputs.
- Terminal value and equity bridge in this capstone (both only on the widget).

---

## 6. Position 18: spine-annual-report

**1. Header.** "Where are a valuation's numbers in an annual report?" (L13). Goal: "Find sales, operating profit, tax, debt, cash and shares in a real annual report, and see which of them a value rests on" (L14). 13 min (L16; outline L338-342).

**2. Flow**
- **Moment**: five Cases.
  - Amazon 10-K vs Damodaran's inputs (L24-30)
  - Zomato annual report (L45-50)
  - Nintendo kessan tanshin (L64-70)
  - Samsung DART report (L82-87)
  - LVMH URD (L101-106)
- **Concept** (L115-122): what an annual report is called by country. Income statement: sales → operating profit → tax. Balance sheet: debt, cash, shares in the note. Names change. A report is the past year; a value is the future.
- **Explore** (L183-198): value_bridge. The learner taps Amazon's 10-K long-term debt ($2,127m) and cash + securities ($1,101m) into the bridge, and the share price moves ~$2.
- **Your turn** (L301-369): eight taps (where sales are; where shares are; Zomato's closest operating line; tax on a loss; what to check next; whether the future margin is in the report; leases as debt; computed Zomato lever).
- **Check**: a quiz drawing 4 of 7 (L286-300). No conversation Check.
- **Reveal**: five reveals (L31-39, L51-59, L71-77, L88-96, L107-113), **629 words**. Most of the "where each line sits" teaching is here, after the Check.
- **Principle** (L124-129).
- **Words:** explanatory ≈ **339** (concept 149, card 42, means 53, goDeeper 95). Three of the four cards repeat earlier ones. Stories and reveals ≈ 1,114. Questions and quick tries ≈ 1,180.

**3. Term ledger**

| Term / stand-in | First appears | Depth | Here / assumed |
|---|---|---|---|
| annual report / 10-K / US regulator | story L25-26 | C (card L144) | here; "annual report" used since spine-statements:25 |
| value vs price ("$35.08 a share against an $84 price") | story L26-27 | N | assumed; spine-01 |
| operating margin as cents ("an operating loss of about 13 cents on each $1 of sales") | story L28 | C | assumed; spine-05:71 |
| net operating loss ("no tax while Amazon used up its past losses") | story L28-29 | C | assumed; spine-03:67 (goDeeper only) |
| debt, cash, shares (bridge inputs) | story L29 | N | assumed; spine-09:94-113 |
| "Six numbers matter for a valuation" | story L29-30 | C | here |
| income statement | reveal L32 | C (card L150) | **repeat**; spine-statements:84 |
| net sales | reveal L32 | N | never taught |
| loss from operations | reveal L32-33 | N | assumed; spine-03:87 |
| tax provision ("the tax Amazon provided for was immaterial") | reveal L33-34 | C ("immaterial" glossed; "provided for" not) | here |
| notes to the accounts ("the tax note") | reveal L34 | N | never taught |
| NOL carryforward ("past losses it may set against future profit") | reveal L34-35 | C | here (spine-03:67 goDeeper) |
| balance sheet | reveal L35 | C (card L156) | **repeat**; spine-statements:90 |
| long-term debt | reveal L36 | N | assumed (spine-09:47 uses it, no gloss) |
| marketable securities ("investments it can sell quickly") | reveal L36 | C | here |
| equity bridge ("his bridge") | reveal L37 | N | assumed; spine-09:62-74 |
| mature margin ("keep 10 cents of each $1 of sales once mature") | reveal L38-39 | C | assumed; spine-05:77 |
| BSE, NSE ("India's stock exchanges") | Zomato story L47 | C | here (spine-15:47 already used BSE) |
| share sale (IPO) | Zomato story L47 | N | IPO never defined |
| "Rs 19,938 million of sales" (= spine-15's Rs 1,994 crore) | Zomato story L48 | N (unit switch unexplained) | n/a |
| revenue from operations, rupees million | Zomato story L49 | C | here |
| standalone vs consolidated | Zomato reveal L52-53 | C | here |
| statement of profit and loss | Zomato reveal L53 | N (equated with the income statement only in a fix, L249) | here |
| exceptional items ("one-off gains or costs") | Zomato reveal L55 | C | here |
| other income ("mostly interest on the money raised") | Zomato reveal L55-56 | C | here |
| total tax | Zomato reveal L56 | N | assumed |
| borrowings | Zomato reveal L57 | N | assumed (= debt) |
| cash and cash equivalents | Zomato reveal L57 | N | never taught |
| bank deposits and investments (as cash) | Zomato reveal L58 | C | here |
| share capital note | Zomato reveal L58 | C (concept L121) | here |
| face value ("shares of Rs 1 each") | Zomato reveal L58 | N | never taught |
| ESOP trust ("the trust that pays the staff's options") | Zomato reveal L58-59 | C | here; whether to subtract those shares is not said |
| kessan tanshin, yuho, EDINET, yen million | Nintendo story L66-67 | C | here |
| ordinary profit | Nintendo story L69 | C (reveal L73-74) | here |
| consolidated statements of income | Nintendo reveal L72 | N | here |
| interest income | Nintendo reveal L74 | N | assumed |
| cash and deposits, securities | Nintendo reveal L75-76 | N | here |
| treasury shares ("shares Nintendo has bought back and holds itself") | Nintendo reveal L76-77 | C | here; which count to use is not said |
| DART, IFRS ("the international accounting rules"), won million | Samsung story L84-85 | C | here |
| ordinary vs preference shares ("which carry no vote") | Samsung story L86 | C | here; how to count them for a share value is not said |
| statement of profit or loss | Samsung reveal L89 | N | here |
| statement of financial position | Samsung reveal L90-91 | C | here |
| short-term / long-term borrowings | Samsung reveal L92-94 | N | here |
| current portion of long-term liabilities | Samsung reveal L92-93 | C | here |
| debentures ("bonds Samsung has sold to lenders") | Samsung reveal L93 | C | here |
| short-term financial instruments | Samsung reveal L94 | N | here |
| buyback ("bought back") | Samsung reveal L96 | N | never taught |
| universal registration document, AMF, ESEF | LVMH story L102-104 | C | here |
| profit from recurring operations, other operating income and expenses | LVMH reveal L108-109 | N | here |
| lease liabilities ("which many analysts count as debt too") | LVMH reveal L111-112 | C | assumed; spine-09:112 |
| operating profit | concept L119 / card L162 | E | **synonym-repeat**; spine-03:87 "operating income" |
| finance costs; the adjustment to operating profit | goDeeper L132-134 | C | here (optional) |
| Long-term debt / Cash and investments it can sell quickly (bridge lines) | explore L193-195 | C | assumed |
| options ("His story with no staff options") | question L243 | N | assumed; spine-09:106 |
| cash flow statement (distractor) | question L250 | N | assumed; spine-statements:96 |
| other bank balances, current investments | question L263 | N | here, tested |
| profit attributable to owners of parent | question L271 | N | never taught |
| tax is on profit, not sales | fix L334 | C | assumed |
| "Cash Rs 135,960m" | quick try L369 | N (never in learner text) | n/a |

**4. Jumps**
- About 35 new reporting terms across five jurisdictions in a 13-minute Topic. Most are parenthetical glosses inside reveals (L52-113), and the reveals come after the Check.
- The Check tests reveal-only content:
  - ar-q-name (L254-264): "other bank balances", "current investments". Only in the Zomato reveal L57-58 and goDeeper L134.
  - ar-q-ordinary (L265-274): answered in the Nintendo reveal L73-74.
  - ar-try-leases (L352-359): LVMH reveal L111-112.
- "Six numbers matter for a valuation: sales, operating profit, tax, debt, cash and shares" (L29-30). These omit what the "what growth costs" lever needs (capital spending, depreciation, working capital, invested capital). ADR 0020 says Assignments need "about eight numbers" (docs/adr/0020-judge-stories-first-18-topics.md, Decision bullet 3).
- Zomato's operating profit is said to be absent (L54-56). The adjustment is only in goDeeper (L132-134), and the resulting figure is never computed.
- The unit switch is unexplained: spine-15 gave Zomato's sales as "Rs 1,994 crore" (spine-15-value-yourself.yaml:55). Here the same figure is "Rs 19,938 million" (L48).
- Share-count traps are named but not resolved: treasury shares (L76-77), ESOP trust shares (L58-59), preference shares (L86, L95-96).
- "Cash Rs 135,960m to Rs 100,000m" (L369): a baseline that appears nowhere in learner text.
- "Profit attributable to owners of parent" (L271): an untaught distractor that implies minority interests.

**5. Names**
- Damodaran **12**:
  - case titles L21, L42; stories L26, L47; reveal L54
  - goDeeper L135; Insight question L176
  - prompts L211, L222, L235, L277; quick try L363
- "valuation professor at New York University" **1** (L26).
- "analysts" (generic) 4: L112, L132, L354, L359.
- No `source` fields name him.

**6. Depth verdict: 2/5.** The three worst problems:
1. Breadth over depth: five reports and ~35 terms as parenthetical glosses, most teaching in post-Check reveals (L52-113, Check L254-274).
2. The "six numbers" leave out reinvestment and invested capital, and Zomato's operating profit and the right share count are never worked out (L29-30, L54-59, L76-77, L132-134).
3. Three of the four Lingo cards repeat earlier words (L150-167 vs spine-statements:84-91, spine-03:87), while the genuinely new words get no card.

**7. Contribution to the goal.** Sourcing base-year inputs (sales, operating profit, tax, debt, cash, shares) and seeing that the value rests on forecasts, not on the report. **Missing:**
- Reinvestment inputs (capex, depreciation, working capital) and invested capital for sales to capital.
- Effective vs marginal tax rate.
- A worked Zomato operating profit.
- Share-count rules (treasury, ESOP, preference).
- Minority interests and cross-holdings for the bridge.
- Lease capitalisation as a procedure.

---

## Names summary (learner-visible prose and widget text; `source` fields excluded)

| Topic | Damodaran | "professor" | Other commentators |
|---|---|---|---|
| spine-11 | 16 | 1 | Bill Gurley 10, Bloomberg 1 |
| spine-12 | 1 | 0 | Forbes 1 (Neumann 1 is a Case person) |
| spine-13 | 14 | 3 | none |
| spine-14 | 10 | 1 | none |
| spine-15 | 9 | 1 | none |
| spine-annual-report | 12 | 1 | generic "analysts" 4 |
| **Total** | **62** | **7** | Gurley 10 |

He is also the widget cast member in spine-11:167, spine-13:121 and spine-14:105, and the caseStory label "Damodaran's story" in spine-13:113 and spine-14:96.

## Terms first met in positions 13-18 that no earlier Spine Topic taught (for the cumulative ledger)

real option (s11 L29); unaudited / accounting rules / like for like (s11 L45-47); pre-money (s11 L296); IPO price range, IPO proceeds, offer/issue price, first-day close (s11 L74-77; s15 L39-47); restricted stock (s11 L75); IPO as a word (never defined anywhere on the Spine); listed (s12 L33); run-rate (s12 L254); earnings, P/E, PEG (s12 goDeeper L66-79); index (s13 L35); expected payouts and dividend yield (s13 L37, L42); probability distribution (s14 L24); median (s14 L256); trailing twelve months (s15 L27); crore (s15 L40; spine-10 used it unglossed); rupee cost of capital (s15 L64, L172); bond yield (s15 L309; spine-07 used it unglossed); net sales, tax provision, notes to accounts, long-term debt, cash and cash equivalents, face value, buyback, short-term financial instruments, profit attributable to owners of parent, other bank balances / current investments (annual-report L32-271).

Used earlier without a gloss, glossed here for the first time: implied (spine-07:24 → s13 L79); stock split (spine-05:31 → s14 L27); BSE (s15 L47 → annual L47); past losses / NOL (spine-03:67 goDeeper → annual L34-35); market value (spine-06:260 fix → never carded).
