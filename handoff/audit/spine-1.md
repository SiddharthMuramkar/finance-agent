# Spine audit, positions 1-6 (fact-finding only; no repo file touched)

Paths are relative to /home/fedora/developer/finance-agent. `T` = course/topics/. Line numbers are from the YAML as of 2026-11-19.

## 0. What is learner-visible (checked in code)

- Visible: case `title`, `story` (Moment), `reveal`, `terms` (Lingo cards), `concept`, check `card`, `quickTries`, question `prompt`/choices/`explanation`/mistake `fix`, `scenes`, `insight.question`/`hints`/`pick`, workbench chips and labels, `primers`, `principle`, `dailyLife`, `youllLearn`, `goal`, `goDeeper` (only when the learner asks).
- Connections are shown in the Topic Note **with the linked Topics' titles** (src/app/notebook/filled-part.tsx:54-62) and given to the Tutor (src/tutor/context.ts:214-218). The case title goes to the Tutor too (src/tutor/context.ts:164).
- NOT visible: YAML comments; question `source` (removed before reaching the browser: src/course/quiz.ts:42; `MarkedQuestion` has no source field); `passCriteria`, `foundWhen`, `why` (the Tutor's own guidance); outline `cases` (docs/course-map.md only). Exception: the market `source.title` in market mode goes into the Tutor's widget-state text (src/widgets/workbench/value-levers-model.ts:866, "(sourced: ...)").
- **Jargon from the workbench widgets that the YAML never shows** (counts as learner-visible):
  - value_levers (T1, T5, T6):
    - lever labels "Operating margin once mature", "Cost of capital while it grows", and "Chance it fails" under More settings (value-levers-model.ts:201-251);
    - cash-flow bars captioned "Cash it makes each year, then after year 10", ending in a bar "After year 10, in today's money" (value-levers-model.ts:348,481). These are drawn even on T1's `firstLook` (value-levers-view.tsx:323; firstLook hides only the after-year-10 *share* readout, :266-267);
    - the zero-value headline "lenders and option holders take everything" (value-levers-model.ts:460);
    - the flags "Fast growth with little investment" and "Every lever at its best: a wish, not a story" (:575-576);
    - a "Go deeper: the Full sheet" disclosure with 17 rows, such as "Growth after year 10, for ever", "Return on new investment after year 10", "Debt the company owes" and "Employee options, owed to their holders" (src/widgets/workbench/full-sheet-words.ts:20-182).
  - cash_waterfall (T3, T4):
    - bars "Revenue", "Less running costs", "Operating income", "Less tax", "Less what growth costs", "Free cash flow";
    - a readout labelled "Reinvestment";
    - sliders "Sales growth, X to Y", "Operating margin" and "Sales for each dollar invested" (src/widgets/workbench/cash-waterfall-model.ts:73-87,133-160);
    - a task "Set growth to 0%. What happens to reinvestment?" (:102).

---

## Topic 1: spine-01-worth

### 1. Basics
- Position 1. Title: "What is a business worth? Price against value, and the four levers" (T/spine-01-worth.yaml:8).
- Goal: "Say what a company is worth as a story with four levers, and say what a price assumes." (:12).
- 10 minutes (course/outline.yaml:16; the YAML has no `minutes` field). No Primer (comment :4).

### 2. Flow
- **Moment** (story :20-27; no scene): Amazon in Feb 2000. Defines "share" in plain words. Gives $1.1bn of sales and a ~$400m operating loss, and the $84 price. The professor writes down "how big it gets, what it keeps of each sale, what its growth costs and how risky it is". Asks "is $84 a fair price?"
- **Concept** (:114-121): price vs value. A value is a story set as four levers. Cost of capital is "the yearly return investors ask… which turns future cash into today's money". "Set the four levers and code works out a value." Then Damodaran's numbers: $39bn of sales in ten years, a 10% operating margin, $3 of sales per dollar invested.
- **Explore** (:93-104; Insight :74-91): the value_levers workbench as a first look, with all 4 levers, failure under More settings, cash-flow bars and the after-year-10 bar. Insight: find a story worth $84 and tap what changed. Answer: far more sales plus a fatter margin.
- **Your turn** (:333-405): 7 tries. Three sort a number into price or value. Two ask a lever's direction (size up; margin down when rivals cut prices). One is a computed "which lever moves most". One asks which story holds together.
- **Check**: card :324-332 (4 lines). worth-check has 6 questions (:143-224; 4 per attempt, pass 3). worth-talk has 6 "judge others' stories" questions (:230-316).
- **Reveal** (:28-33): $35.08 against $84. The high was $91.50 and the low $14.88. Neither number proves the other wrong.
- **Principle** (:130-132): ask what a price assumes before calling it wrong.
- Go deeper (:124-128, optional): discounting plus the equity bridge in 4 sentences.
- Word count. Required teaching: concept 137 + card 77 + term `means` 56 = **270**; with goDeeper +85 = 355. Question and try text ≈1,070 words: **4 words of testing per word of teaching**.

### 3. Term ledger (order follows the Teaching Steps)
| Term / stand-in | First appears | Explained | Here / assumed |
|---|---|---|---|
| share | story :21-22 | one line, plain ("one small slice of the company") | introduced |
| future cash (what a business throws off) | story :22 | none (cash comes in T3) | assumed |
| sales | story :23 | none | assumed |
| operating loss ("lost about $400 million on its operations") | story :23-24 | none | assumed |
| price | story :24; card :42-47 | one-line card + bike example | introduced |
| value / "worth" | story :27; card :48-53 | one-line card + mango example | introduced |
| story/narrative | story :25-26; concept :116 | one line | introduced |
| four levers (as a list) | story :26; concept :116-118 | listed only; no mechanism | introduced |
| how big it gets (revenue growth) | story :26; label "Sales in year 10" :153 | none (no growth rate, no path) | introduced, not taught |
| what it keeps = operating margin | story :26; concept :120 (in brackets); card :54-59 | one-line card + lemonade example | introduced |
| "from its operations", "before tax" | card :55 | none | assumed |
| mature margin ("settles at 10%"; widget "Operating margin once mature") | card pro :56 | none (taught T6) | used before taught |
| what growth costs = reinvestment / sales-to-capital ("$3 of sales for each dollar invested") | story :26; concept :121 | half a clause; no card | used before taught (card in T3) |
| how risky it is = cost of capital | story :26; concept :118-119; card :60-65 | one-line card + shop-vs-deposit example | introduced |
| required return ("return investors ask") | card :61; concept :118 | none | assumed |
| cost of capital that changes over time ("starts at 12.84% while Amazon grows"; widget "while it grows") | card pro :62 | none | used before taught |
| discounting / "today's money" | value example :51; card :61; concept :119 | none (taught T2) | used before taught |
| DCF / "code works out a value" / "Discounted cash flow" | concept :119; connection :107 | none; 4 optional sentences in goDeeper | black box |
| ten-year forecast / year 10 | concept :120; label :153 | none | assumed |
| terminal value (widget bar "After year 10, in today's money") | workbench | none | used before taught |
| chance of failure (widget More settings) | workbench | none | used before taught |
| debt, staff options, share count ("what the company owes… promised its staff, split the rest over its shares") | goDeeper :127; widget "$0: lenders and option holders take everything" | goDeeper only | used before taught |
| per-share value ("for one share") | card :49; reveal :29 | none | assumed |
| invest / invested | pick :90; concept :121 | none | assumed |
| percentage points ("two more points of margin", "one point lower") | explanation :148; label :155 | none | assumed |
| shareholders ("Nothing left for shareholders") | band :182 | none | assumed |
| price multiple ("trade at ten times its sales") | question :215 | none | used before taught (relative valuation) |
| market value ("$30bn company, counting every share at that day's price") | question :245 | explained in the question itself | introduced in a question |
| competition / price war cuts the margin | question :287; try :378 | only in mistake fixes :294, :385 | introduced in fixes |
| safer → lower required return | question :303; explanation :315 | explanation only | introduced in an explanation |
| trade(d), quarter | reveal :30-31 | none | assumed |
| lending, bank deposit | card example :63 | none | assumed |

### 4. Jumps
- Story :23-24, "lost about $400 million on its operations": a loss-making company is then valued at $35 a share, and how that can be is never explained. The −36.7% starting margin (course/topics/val-dcf.yaml:51) never appears.
- Story :25-26: all four levers arrive at once in the opening paragraph, before any of them is defined.
- **Concept :119-121, "Damodaran's story for Amazon had about $39 billion of sales in ten years, a 10% operating margin (10 cents kept from each $1 of sales), and $3 of sales for each dollar invested in warehouses and systems."** Operating margin is dropped in mid-sentence with a bracketed gloss. Sales-to-capital gets no card. Going from $1.1bn to $39bn (35×) is never stated. This is the owner's example.
- Concept :118-119: one clause carries required return, risk pricing and discounting: "the yearly return investors ask for the risk they take, which turns future cash into today's money". Discounting is taught in T2.
- Concept :119, "Set the four levers and code works out a value": the method is a black box, and nothing says why each lever moves the value the way it does. Yet the questions test direction (:301-315 "safer bet", :285-299).
- Card pro :62, "starts at 12.84% while Amazon grows": a figure no main text uses, and a rate that changes over time, unexplained.
- Explanation :148, "Whenever two more points of margin are on offer, they win." Introduces "points" and asserts a general rule that nothing teaches.
- Question :215, "ten times its sales, cheaper than its rival's": a price multiple (relative valuation) with no teaching.
- Band :182, "Nothing left for shareholders", and widget :460, "lenders and option holders take everything": the equity bridge is assumed.
- The Insight `pick` choice :90, "Only more sales for each dollar invested", and the mistake fix :91, "Spending less on growth helps": the learner must already know that more sales per dollar means spending less.
- Reveal :29: $35.08 a share comes out of discounting, terminal value, debt, cash, options and share count, none of which is taught.
- Workbench: after-year-10 bar, failure lever, "Operating margin once mature", Full sheet with 17 inputs (see §0).

### 5. Names (learner-visible)
- "Damodaran": case title :17 (Tutor context); story :25 ("A professor in New York, Aswath Damodaran"); chip `caseStory` :100 ("Damodaran's story"); connection :109; concept :119. That is **5**.
- Linked Elective titles shown in the Topic Note connections: "Follow: Damodaran, Tesla valuation (Feb 2020)" (T/fol-tesla-2020.yaml:4) and "Follow: Damodaran, Twitter IPO valuation (Oct 2013)" (T/fol-twitter-ipo.yaml:4). That is **+2**.
- "the professor": :25, :53, :76, :232, :242 = **5**.
- "his story": :29, :146, :148, :330, :347, :389 = **6**.
- Not visible: 8 question `source` fields (:197-316).
- **Total ≈ 18 references to one named commentator.**

### 6. Depth: 2/5
Price vs value alone would score about 4. The four levers score about 1.
1. All four levers, a failure lever and terminal-value bars are set as play before any is taught. Concept :116-121 plus the widget (§0); the "binge" pattern.
2. Operating margin, sales-to-capital and cost of capital each get one line or less (:54-65, :120-121), and no line says why a lever pushes the value up or down. Questions still test direction (:285-315).
3. Testing outweighs teaching 4:1 (12 questions + 7 tries against 270 words). The 6-question worth-talk Check re-tests the same two Skills.

### 7. Contribution to the end goal
- Gives: pricing vs value, and the idea of a valuation as a story with four levers.
- Leaves out:
  - what revenue, operating costs and operating income are;
  - how levers become yearly cash (revenue × margin − tax − reinvestment);
  - discounting;
  - the 10-year horizon and terminal value;
  - the equity bridge (debt, cash, options, shares);
  - why each lever moves the value the way it does;
  - where lever numbers come from (history, industry data);
  - why a cost of capital is 12.84% and not 8%.

---

## Topic 2: spine-02-money-later

### 1. Basics
- Position 2. Title: "Why is money later worth less?" (T/spine-02-money-later.yaml:10).
- Goal: "Bring payments made at different dates to today before comparing them, and find the rate that makes two offers equal." (:11).
- 12 minutes (:14). Primer: Growth on growth, at the concept step (:193-211).

### 2. Flow
- **Moment** (story :24-31; scene :99-113): the $1.537bn Mega Millions jackpot, paid as 30 yearly payments each 5% bigger ($23.1m up to $95.2m), or $877.8m in cash.
- **Concept** (:39-48): money today can grow in a bank. Present value worked for one year ($105 → $100 at 5%). An advertised total overstates worth. A higher rate or a longer wait shrinks payments, the far ones most. There is one break-even rate. A company is valued the same way.
- Primer (:196-198): compounding, with $100 → $105 → $110.25, and "discounting runs the same steps backwards". One quick try (:203).
- **Explore** (:154-185): annuity widget with a rate slider labelled "Interest rate (discount rate)" from 0 to 10%. Tasks: 0%, then find the break-even (≈3.38%, comment :164). Insight (:133-152): the cash is a bet that you can earn more than that rate.
- **Your turn** (:383-442): 7 tries on direction (today vs later, 1 vs 2 years, higher rate, far vs near) and on the break-even rate.
- **Check**: card :373-381 ($104 at 4%). ml-check has 7 questions (:226-363). ml-talk is a conversation (:444-456).
- **Reveal** (:32-37 + headline scene :114-123 + reveal task :180-185): the winner took the cash, which roughly equals the payments' worth "in safe government loans". The task: set the 30-year US government rate.
- **Principle** (:59-62).
- Go deeper (:51-55): divide by (1+rate) each year, plus a Formula Card.
- Word count. Required teaching: concept 155 + card 62 + means 60 = **277**; +goDeeper 49, +primer 40 = 366. Testing ≈1,255 words: **4.5:1**.

### 3. Term ledger
| Term | First appears | Explained | Here / assumed |
|---|---|---|---|
| jackpot, 30 yearly payments (annuity) | story :26-28 | plain | introduced |
| payments growing 5% a year (growing annuity) | story :28 | none; the $23.1m→$95.2m arithmetic is unexplained | used before primer |
| cash option | story :29; card :85-90 | one-line card + shop example | introduced |
| before tax | story :30; reveal :34 | none | assumed |
| bank / interest / "grow" | concept :41 | one clause | assumed |
| rate ("at 5% a year") | concept :41 | none as a concept | assumed |
| present value | concept :41-42; card :73-78 | **explained with a worked example** | introduced |
| discount rate | card :79-84; widget slider :175 "Interest rate (discount rate)" | one-line card + bank example; the concept never says "discount rate" | introduced |
| "discount the cash flows" | card pro :75 | none ("cash flows" undefined) | assumed |
| far payments shrink most (multi-year discounting) | concept :45-46 | stated; the mechanism is in the primer :198 and goDeeper :52 only | half-taught |
| break-even / indifference rate | concept :46-47 | stated, no number, no example | introduced |
| compounding / growth on growth | card :91-96; primer :194-199 | **explained with a worked example** | introduced |
| discounting (as a word) | primer :198 | one line | introduced |
| opportunity cost ("earn more than that rate") | insight :140; question :330-331 | insight text | introduced |
| price vs value | question :227-241 | reuses T1, but the T1 definition does not fit (see Jumps) | assumed from T1 |
| "price of waiting" | fix :257 | none | introduced in a fix |
| face amount | explanation :282; fix :355 | none | assumed |
| forced saving | explanation :343 | none | assumed |
| safe government loans / risk-free rate | reveal :36; reveal task :183 "safe 30-year US government loan" | none; no risk link | used, not taught |
| "interest rates of the time" | reveal :37 | none | assumed |
| EMI | dailyLife :65 | none (an Indian acronym) | assumed |
| bond | connection :215 | inline gloss | introduced in a connection |
| young company | connection :220 | none | assumed |
| formula (amount ÷ (1+r)^n) | goDeeper :52-53 | Formula Card, optional | optional |

### 4. Jumps
- Story :28, "Each payment was 5% larger than the one before, starting at about $23.1 million, so the last would be about $95.2 million": compound growth arithmetic before the compounding primer.
- Concept :46-47, "Two offers paid at different dates are worth the same at one rate: below it the later money is worth more, above it the money now is.": the Topic's central idea in one abstract sentence, with no number (the 3.38% lives only in a comment, :164).
- The concept teaches one-year discounting only. "Divide again for each year" is in goDeeper :52 (optional) and primer :198, yet fix :254 and tries :393-417 test it ("Each year of waiting divides by one plus the rate again").
- **Question ml-q-cash-offer :227-241**: "Is that cash offer a price or a value?" The answer is "a price: what the lottery will pay". T1 defined price as "What buyers pay for one share today" (spine-01 :43), so the learner must stretch a definition that does not apply.
- Reveal :35-37, "set aside, in safe government loans, to fund the 30 payments", and reveal task :183: Treasury bonds and the risk-free rate are new ideas at the reveal.
- **No link to T1's "cost of capital"**: the phrase never appears in T2 (grep: 0 hits). "Risk" appears only in a connection's Topic id (:222). T1 said cost of capital "turns future cash into today's money", and T2 calls the same thing "interest rate" or "discount rate". Nothing reconciles the three names or says why risky cash needs a higher rate.
- dailyLife :65, "an EMI": an unexplained acronym for a general audience.

### 5. Names
0 commentators. Generic speakers: "An analyst" in the scene (:106, :111). The CFA Institute is named only in `source` (not visible).

### 6. Depth: 3/5 (best of the six)
1. Multi-year discounting, the thing a valuation needs, is optional (goDeeper :52) but tested (fix :254, tries :409-417).
2. Nothing connects the discount rate to T1's cost of capital or to risk (0 occurrences), so the learner meets three names for one idea.
3. The price-vs-value question (:227-241) forces T1's share-price definition onto a lottery payout and muddles both.

### 7. Contribution to the end goal
- Gives: the time value of money, present value, rate sensitivity, far cash shrinking most, and the break-even rate.
- Leaves out:
  - multi-year discounting in the required text;
  - the growing perpetuity, which is the basis of terminal value (the growing payments here could seed it);
  - the risk-free rate as a floor;
  - why risky cash gets a higher rate, which links to cost of capital;
  - keeping currency and inflation consistent.

---

## Topic 3: spine-03-cash

### 1. Basics
- Position 3. Title: "Where does the cash come from?" (T/spine-03-cash.yaml:14).
- Goal: "Follow one year of a business from revenue (its sales) down to free cash flow, and read where its cash goes." (:16).
- 12 minutes (:18). Primer: Spending that lasts, at explore (:202-223).

### 2. Flow
- **Moment** (story :28-38; scene :113-127): Webvan's annual report for 2000. Sales went from $13.3m to $178.5m. Operations used $263.1m of cash and $259.8m went on equipment, leaving $212m. The auditors warn it might not survive.
- **Concept** (:51-59): a business is worth the cash it hands back, not its profit. Free cash flow is the cash left after paying for growth. Growth is paid for first. More sales per dollar means cheaper growth. Runway is cash on hand against monthly burn. The bench is a what-if.
- **Explore** (:168-198 + Insight :147-166): cash_waterfall from 1999 into 2000 at 1,241% growth, a 4% margin and 0.7 sales per dollar. Insight: fast growth uses cash even with a profit on each sale.
- Primer (:205-208): capex leaves as cash now and reaches profit in slices.
- **Your turn** (:386-446): 7 tries on the free-cash-flow steps and on growth using cash.
- **Check**: card :377-384, with the example "$50 − $10 tax − $60 = −$20". wc-check has 7 questions (:241-367). wc-talk is a conversation.
- **Reveal** (:39-47 + headline scene): Webvan shut down and filed for bankruptcy. Accumulated losses $829.7m. An aside on TIME's $480m.
- **Principle** (:74-76): "Profit is an opinion; cash is a fact."
- Go deeper (:63-72): the waterfall steps, the past-loss tax shield, the cash flow statement's three sections, non-cash costs, a $320m operating loss and $523m of cash out.
- Word count. Required teaching: concept 138 + card 53 + means 71 = **262**; +goDeeper 146, +primer 48 = 456. Testing ≈1,110 words: **4.2:1**.

### 3. Term ledger
| Term | First appears | Explained | Here / assumed |
|---|---|---|---|
| online grocer, automated warehouses | story :29 | plain | introduced |
| sold shares to the public, raising $402.6m (IPO / equity raise) | story :30-31 | plain, no term | introduced |
| bought its rival (acquisition) | story :31 | none | assumed |
| files its report (annual report / 10-K) | story :31 | none (statements are T4) | used before taught |
| sales; revenue | story :31; goal :16 "revenue (its sales)"; waterfall bar "Revenue" | gloss in the goal only | introduced by gloss |
| cash used in running the business (operating cash flow) | story :32-33 | plain | introduced |
| property and equipment (capex) | story :33-34 | plain-ish | introduced |
| cash and investments it could quickly sell (marketable securities) | story :34-35 | plain | introduced |
| runway ("money should last into…") | story :35-36; concept :57 | one sentence, no arithmetic | introduced |
| auditor going-concern warning | story :37 | plain, unexplained significance | introduced |
| profit it reports | concept :52-53 | none (income statement is T4) | used before taught |
| free cash flow | concept :53; card :93-98 | one sentence + one-line card + shop example | introduced |
| growth paid first / reinvestment | concept :53-55; card :99-104 | **explained with an example** (bakery's second oven) | introduced |
| working capital ("groceries on the shelves") | concept :54; card :100 | folded into reinvestment | partly |
| sales per dollar spent (sales-to-capital) | concept :55 | one clause | introduced (used in T1) |
| operating income | card :87-92; goDeeper :64; waterfall | one-line card + tea-stall example | introduced |
| running costs | card :88; waterfall "Less running costs" | none beyond the card | introduced |
| interest ("before interest and tax") | card :88 | none | assumed |
| tax | card :88; card line :380 | none | assumed |
| operating margin (waterfall slider) | workbench :189 / cash-waterfall-model.ts:84 | none here (one line in T1) | assumed |
| cash burn | card :105-110 | one-line card + personal savings example | introduced |
| depreciation ("profit shows only a slice of the cost each year") | primer :207 | one line | introduced |
| asset | primer fix :221 "machines are an asset, not a cost" | only in a mistake fix | used before taught (T4) |
| tax-loss carryforward | goDeeper :66-67; workbench `lossesCarried` | goDeeper only | optional |
| cash flow statement, investing, financing | goDeeper :68-70; connection :227-228 | goDeeper only | optional |
| non-cash costs, paying staff in shares | goDeeper :70-71; explanation :347 | goDeeper / explanation only | used before taught |
| goodwill amortisation ("spreading the price it paid for HomeGrocer over the years") | explanation :347 | none | used before taught |
| loss for the year (net loss) | question :334 | none | used before taught (T4) |
| value of one share, "valued as an illustration" | question :304, :319 | none | assumed |
| cost of capital ("A starting cost of capital two points higher") | label :312 | none | used before taught |
| chance it fails ("A 20% chance it fails") | label :313 | none | used before taught |
| mature margin ("once mature") | label :311 | none | used before taught (T6) |
| price vs value | question :283-298 | T1 | from T1 |
| negative cash (−$20) | card :381 | none | assumed |
| bankruptcy protection, accumulated losses | reveal :41-42 | plain | introduced at reveal |
| "filing figure" | reveal :47 | none | assumed |
| stock options | dailyLife :79 | none | assumed |
| return above what investors require (ROIC vs cost of capital) | connection :231 | none | used before taught |

### 4. Jumps
- Concept :52-53, "worth the cash it can hand back to its owners, and that is not the same as the profit it reports": profit and reports are assumed, because the order puts cash (pos 3) before statements (pos 4). The comment at :10-11 admits the accounting was moved to T4.
- Concept :55, "The more sales each dollar spent on them brings in, the less growth costs.": the sales-to-capital ratio in one clause, with no number.
- Concept :57: the runway rule comes with no worked example, although the story holds the numbers ($212m left, $263m a year used).
- Waterfall: the first bar is "Revenue" (cash-waterfall-model.ts:155) while the Topic says "sales". "Operating margin" is a slider with no card here.
- **Question wc-q-which-lever :303-314**: the choices include "A starting cost of capital two points higher", "A 20% chance it fails, not none" and "keeps 10%… once mature", all untaught. "Lowers the value of one share most" assumes the plan-to-share-value chain. Its explanation :306 adds: "The plan's sales for each dollar invested were far above what each dollar brought in the year the explore waterfall shows."
- Question wc-q-which-figure :334-347: tests net loss vs cash using paying staff in shares and goodwill amortisation, which are optional goDeeper material here and next-Topic material.
- Primer fix :221 introduces "asset".
- Reveal :46-47, "(A TIME report put the cash burn at $480 million; that is a press estimate, not a filing figure.)": a source-checking aside with no use to a learner.
- Connection :231: return on capital vs required return, dropped in.

### 5. Names
0 commentators in visible text. TIME (a publication) at reveal :47. Damodaran only in `source` :367 (not visible).

### 6. Depth: 2/5
1. Profit, operating income, reports and statements are used before the statements Topic (:52-53, :87-92, :334). The order inverts the dependency.
2. The computed questions test failure chance, a time-varying cost of capital and mature margin (:311-313). None is taught in T1-T6.
3. The core free-cash-flow chain (operating income → tax → reinvestment) is 1 card line (:380) plus optional goDeeper. No worked numbers come from Webvan's own year; the waterfall is a 4% what-if.

### 7. Contribution to the end goal
- Gives: free cash flow, growth costing cash, sales-to-capital, burn and runway. This is lever 3.
- Leaves out:
  - operating income as revenue × margin;
  - the parts of reinvestment (capex − depreciation + working capital);
  - the tax rate on operating income;
  - how yearly free cash flow becomes a value (needs T2 joined explicitly);
  - firm vs equity cash flow;
  - the link from burn to failure risk.

---

## Topic 4: spine-statements

### 1. Basics
- Position 4 (outline `spine: 4`, course/outline.yaml:70). Title: "What do the three financial statements show?" (T/spine-statements.yaml:17).
- Goal: "Read what the income statement, the balance sheet and the cash flow statement each show." (:18).
- 12 minutes (:20). Primer: Three statements, one loop, at the concept step (:221-239).

### 2. Flow
- **Moment** (story :33-39; scene :110-126): Webvan's report has three pages, three numbers (a ~$450m loss, ~$210m left). Which one says how long it lasts?
- **Concept** (:47-56 + chain widget :139-155): each statement answers one question. The income statement runs from sales at the top to net income. The balance sheet shows owns, owes and the owners' part on one day. The cash flow statement has three sources. One event, machines bought for cash, moves all three.
- Primer (:224-226): net income starts the cash flow statement, which adds back non-cash costs and takes off goods tied up. Closing cash equals balance-sheet cash.
- **Explore** (:188-217 + Insight :166-186): the waterfall what-if for 2000 into 2001 (sales double at a 4% margin). Profit on one page, cash out on another.
- **Your turn** (:407-459): 6 tries: which page, owed to lenders, one day vs a year, warehouse, loss with more cash, credit sale.
- **Check**: card :398-404. st-check has 7 questions (:257-388). st-talk is a conversation.
- **Reveal** (:40-45): bankruptcy; each page had shown part of it.
- **Principle** (:70-73).
- Go deeper (:59-68): the loop, $453.3m vs $263.1m, $259.8m capex, $40.3m + $171.6m.
- Word count. Required teaching: concept 141 + card 54 + means 78 = **273**; +goDeeper 158, +primer 60 = 491. Testing ≈1,210 words: **4.4:1**.

### 3. Term ledger
| Term | First appears | Explained | Here / assumed |
|---|---|---|---|
| report / annual report | story :33 | none | assumed |
| loss for the year | story :34 | none (net income comes later) | introduced |
| owns and owes (assets, liabilities) | story :35; concept :50 | plain | introduced |
| investments it could quickly sell | story :35-36 | plain (from T3) | from T3 |
| renting a warehouse (lease) | story :36 | plain | introduced |
| money raised from investors (financing) | story :37-38 | plain | introduced |
| income statement | concept :48-49; card :84-89 | one-line card + tea-stall example | introduced |
| net income | concept :49-50; card :102-107 | one-line card | introduced |
| interest ("after every cost, interest and tax") | card :103 | none | assumed |
| balance sheet | concept :50-51; card :90-95 | one-line card + stall example | introduced |
| owners' part (equity) | concept :51; card :91 | none beyond "the part left for owners"; no assets = liabilities + equity | introduced, thin |
| one day vs a period | concept :50; pro :86, :92 | one line | introduced |
| cash flow statement + 3 sections | concept :51-53; card :96-101 | one-line card + stall example | introduced |
| spending on things that last (capex / investing) | concept :52 | plain | introduced (from T3) |
| depreciation ("only a slice of their cost each year") | concept :55-56; chain step :155 | plain, no word, no numbers | introduced |
| non-cash costs, paying staff in shares | primer :225; goDeeper :61; question :377 | one line | introduced |
| working capital ("cash tied up in goods waiting to be sold") | primer :225; goDeeper :62 | one line | introduced |
| closing cash, retained earnings ("changes what the owners own") | primer :226; goDeeper :62-63 | one line | introduced |
| free cash flow, "what growth costs" | insight :173, :182 | from T3 | from T3 |
| operating income, margin (waterfall) | workbench | from T3 / T1 | assumed |
| lenders / debt | try :418; question :334 | none | used before taught |
| credit sale / receivables (accrual) | try :452-459 | none | **tested, never taught** |
| market value ("puts about $7.9 billion on the whole company") | question :304-306 | in the question | introduced in a question |
| book value vs market value ("far more than anything its balance sheet holds"; fix :311 "records what was paid for things") | question :305; fix :311 | in a fix only | introduced in a fix |
| margin "12 cents of profit from each $1 of sales once mature" | question :340 | none | mature used before T6 |
| value of one share, "valued as an illustration" | question :326, :340 | none | assumed |
| goodwill amortisation ("spreading the price paid for HomeGrocer") | explanation :386-387 | none | used before taught |
| bankruptcy protection | reveal :42 | plain | from T3 |

### 4. Jumps
- Concept :49-50, "sales at the top, every cost taken off, and net income… at the bottom": no line structure (cost of goods, operating income, interest, tax) and no numbers. Operating income from T3 is never placed on the income statement in the concept (only in connection :243-244).
- Concept :50-51: the balance sheet has no identity (owns = owes + owners' part) and no Webvan figures.
- Primer :225, "adds back costs that used no cash and takes off cash tied up in goods waiting to be sold": the indirect method plus working capital, one line.
- **Try st-try-credit-sale :452-459**: accrual accounting and receivables, never taught anywhere.
- **Question st-q-which-lever :326-334**: "The balance sheet owes lenders $500 million more" lowers a share's value. The equity bridge is untaught (only T1 goDeeper :127). Its other choices put a forecast on a statement ("The income statement shows $4.2 billion of sales in year 10") and call a ratio a cash-flow-statement line ("shows $1 invested for each $4 of new sales"). Both are conceptual muddles.
- Question st-q-first-day :304-316: market value vs book value. The explanation :314-316 says "Neither the balance sheet nor the price is a value", a new idea at the check.
- Insight foundWhen :176 / question :169-170 speak of "the cash flow statement's free cash flow". Free cash flow is not a line on the cash flow statement; it mixes up the waterfall with the statement.

### 5. Names
0 commentators.

### 6. Depth: 2/5
1. No worked statement with lines and numbers. Each statement is one sentence (:48-53), and the learner never sees an income statement, balance sheet or cash flow statement laid out.
2. The tries and questions test credit sales (:452-459), debt in valuation (:334) and book value (:304-316), none taught.
3. The workbench is the T3 waterfall again: no statement view. The Insight blurs free cash flow with the cash flow statement (:176).

### 7. Contribution to the end goal
- Gives: where the raw inputs live (sales, net income, cash, what is owed, capex).
- Leaves out:
  - the full income statement path (revenue → … → operating income → interest → tax → net income);
  - the balance sheet identity;
  - where to find debt, cash and shares outstanding (the bridge inputs);
  - how to compute operating margin, sales-to-capital and reinvestment from the statements;
  - the base year;
  - R&D and lease adjustments.

---

## Topic 5: spine-04-growth

### 1. Basics
- Position 5 (outline `spine: 5`, course/outline.yaml:87; the id's "04" no longer matches). Title: "Growth: how big can it get?" (T/spine-04-growth.yaml:15).
- Goal: "Turn a story about the market a young company can win into its future revenue, and weigh its effect on value." (:16).
- 12 minutes (:20). Primer: Growth on growth (compounding), at the concept step (:196-215).

### 2. Flow
- **Moment** (story :28-38; scene :106-122): Uber in 2014. A $1.2bn venture round led by Fidelity at $17bn pre-money. Damodaran says $5.9bn ($100bn fares × 10% share × 20% fee). Gurley argues a bigger market. Estimates of $40bn are in the news.
- **Concept** (:50-60): revenue = market × share × slice. The slice is not the margin. Markets can be defined narrowly or widely. For a young company, market size moves value most.
- Primer (:200-202): $100bn at 6% for 10 years is $179bn, not $160bn.
- **Explore** (:165-193 + Insight :143-163): value_levers in market mode with chips "Uber's 20% slice of $100bn / $300bn of fares", plus all levers, failure and cash-flow bars. Insight: the story gap is a market gap.
- **Your turn** (:371-432): 7 tries: slice, three parts, doubled share, deliveries, the $6bn vs $53bn gap, and a computed lever question.
- **Check**: card :361-369, example $50bn × 10% × 30% = $1.5bn. ug-check has 7 questions (:229-351). ug-talk is a conversation.
- **Reveal** (:39-48 + headline :123-132): IPO at $45 (2019), $82.4bn. 2018 revenue $11.3bn. Gurley's story gives $53.4bn. A 2019 equity value of $61.7bn. The "fatally flawed" quote.
- **Principle** (:69-72).
- Go deeper (:63-67): the life cycle.
- Word count. Required teaching: concept 166 + card 71 + means 69 = **306**; +goDeeper 81, +primer 41 = 428. Testing ≈960 words: **3.1:1**.

### 3. Term ledger
| Term | First appears | Explained | Here / assumed |
|---|---|---|---|
| private company | story :29 | none | assumed |
| venture round | story :29-30 | inline gloss | introduced |
| fund manager | story :30 | none | assumed |
| price for the whole company | story :31 | plain | from T1 |
| pre-money ("before counting their new money") | story :31; question :247 | in mid-sentence | introduced, thin |
| "valuation" used for a price | scene :117 "at a $17 billion valuation"; question :322 | contradicts T1 until question :318-331 | conflicting |
| valued it as a car-service company | story :32 | none | assumed |
| spreadsheet | story :33 | none | assumed |
| total market | story :34; concept :51; card :80-85 | one-line card + coffee example | introduced |
| market share | story :34; card :86-91 | one-line card | introduced |
| take rate / fee = revenue | story :35; concept :52; card :92-97 | one-line card + app example | introduced; **"revenue" first defined here as a platform fee** |
| board member, investor | story :35-36 | none | assumed |
| margin "what Uber keeps of that revenue as profit" | concept :54-55 | one clause; "the next Topic's lever" | forward reference |
| young company | concept :58-59; question :334-350 | one sentence | introduced |
| "size of the market moves value more than any other input" | concept :59-60 | a claim | **contradicted in T6** |
| compounding | primer :200-202; card :98-103 (duplicate of T2) | worked example | re-introduced |
| life cycle, mature company | goDeeper :64-66 | optional | optional |
| "margins and reinvestment give cash" | insight :148-149 | assertion | assumed |
| cost of capital ("12% to 10% while it grows") | question :240; try :432 | none (12% never stated) | used before taught |
| chance of failure ("No chance of failure, not 10%") | question :239, :255; try :431 | none (10% never stated) | used before taught |
| sales per $1 invested ("$5 to $10") | question :241 | T3 | from T3 |
| "a 30% margin" (his is never given) | question :256 | none | missing reference |
| operating margin "the profit left from each $1 of revenue" | choice :289 | inline | from T1 |
| discount rate (as a company's rate) | try :415 "A point or two of discount rate" | none; T2 never links it to companies | conflated |
| stake, funding round | question :324, :330 | none | assumed |
| IPO / priced its shares / began trading | reveal :40-41 | none | assumed |
| equity ("valued its equity at about $61.7 billion") | reveal :46 | none | **used before taught** |
| options and restricted stock | headline deck :131 | none | used before taught |

### 4. Jumps
- Story :30-31, "at a price of $17 billion for the whole company, before counting their new money": pre-money dropped in mid-sentence.
- Story :32, "valued it at about $5.9 billion": how revenue becomes value (margin, reinvestment, risk, failure) is not in the Topic. Insight :148-149 only asserts it.
- Concept :54-55, "This slice is not the margin: the margin is what Uber keeps of that revenue as profit, the next Topic's lever.": a forward reference to a term used since T1.
- **Concept :58-60, "the size of the market it can win moves its value more than any other input"**. This contradicts T6's `why` (spine-05 :9, "moves its value more than almost anything") and T6's answer key (:188, "What it keeps moves the value most"). It also clashes with T1's explanation (:148), "Whenever two more points of margin are on offer, they win."
- Question ug-q-which-lever :238-241 and ug-q-price :255-256: failure chance (10%), cost of capital (12%) and margin (30% vs his unstated ~40%) appear only inside the choices.
- Try :415, "A point or two of discount rate", and the fix: T2's lottery rate is applied silently to a company.
- Reveal :46, "valued its equity at about $61.7 billion": equity vs whole company. Earlier figures were for the whole company (comment :7).
- Headline deck :131, "once options and restricted stock are counted".
- Workbench market chip "$100bn of fares" vs readout "of $35.8bn of fees on all fares" (comment :178 admits the confusion).

### 5. Names (learner-visible)
- "Damodaran":
  - case title :25;
  - story :31 ("Aswath Damodaran, a valuation professor at NYU Stern");
  - reveal :42;
  - concept :52;
  - inStory :85;
  - insight question :144;
  - chip :173 "Damodaran's June story";
  - market source titles :184, :192 (Tutor readout only, value-levers-model.ts:866);
  - primer :201;
  - connection :219;
  - question :233;
  - explanation :294;
  - prompt :301 "Three readers send Damodaran their Uber stories";
  - explanation :331;
  - fix :422 "Damodaran's lesson from his December 2014 range of stories";
  - talk prompt :438.
  - That is **15 visible + 2 Tutor-only**.
- Linked title "Follow: Damodaran, crowd valuation of Uber (Dec 2014)" (T/fol-uber-2014.yaml:4) via connection :221. That is **+1**.
- "Gurley" (Bill Gurley, VC): story :35, reveal :44, explanation :294 = **3**.
- "Fidelity": story :31, question :321 = **2**.
- "professor": story :32, scene title :109, cast :114, beat :118 (speaker), insight :150, foundWhen :154 (not visible) = **5 visible**.
- "his" story/value/market/estimate: :33, :43-47, :159, :162, :253-256, :261, :426 ≈ **12**.
- Quote "first and fatally flawed valuation of Uber" :47-48.
- **Total ≈ 38 visible references to named people or firms.**

### 6. Depth: 2/5
1. A contradictory headline claim (market size moves value most, :59-60) that the very next Topic reverses (spine-05 :9, :188).
2. The questions test failure chance and cost of capital with figures never stated (:239-241, :255, :431-432), plus equity and options at the reveal (:46, :131).
3. Name-heavy: about 38 references to Damodaran, Gurley and Fidelity. The story is a personality contest (professor against venture investors, scene :109) instead of a method.

### 7. Contribution to the end goal
- Gives: revenue forecasting as market × share × take rate, compounding, and the young vs mature company.
- Leaves out:
  - revenue growth as a rate path from a base year (the general lever for companies that are not platforms);
  - how to size a market from sources;
  - how competition caps share;
  - that growth needs reinvestment (only a "cannot hold" question, :303);
  - terminal growth capped at the economy;
  - failure risk (tested, not taught).

---

## Topic 6: spine-05-margins

### 1. Basics
- Position 6. Title: "Margins: what does it keep?" (T/spine-05-margins.yaml:7).
- Goal: "Judge a company's margin against what its rivals keep, and see how far that moves its value" (:8).
- 12 minutes (:10). No Primer.

### 2. Flow
- **Moment** (story :18-27; scene :99-113 with cast "Aswath Damodaran" :105): Tesla on 6 Feb 2020. Revenue $24.6bn with about zero operating profit. Price $748.96 against his $427. His story: $125bn of revenue in 2030 and a 12% margin by 2025. Rivals' margins: 3.01%, 10%, 8.46%, 10.25% and 19.87%, plus six tech names.
- **Concept** (:38-47 + two_paths widget :114-131): operating margin defined. It is the 2nd lever, a mature figure. A few points move value a lot. Rivals compete margins down, so benchmark against the median and the best, and an edge is needed to beat them. Per car, the margin is the price-cost gap. A cost cut every rival shares goes to buyers.
- **Explore** (:147-173 + Insight :139-145): value_levers margin_marks ladder (carmaker median, Toyota, tech giants). Insight: the price needed a tech-giant margin.
- **Your turn** (:272-333): 7 tries: 3c to 5c, Damodaran's update, a computed lever question, an edge needed, the guide to a mature margin, battery savings to buyers, unit cost.
- **Check**: card :263-270. margins-check has 6 questions (:184-254). margins-talk is a conversation.
- **Reveal** (:28-36): the margin was the largest piece of his update ($115.31 of the move from $190.36 to $426.58). CNBC "Volkswagen's revenue, Apple's margins". Stock splits ($427 is $28.47). Peak $1tn. A 65% fall in 2022. A menu from $106 to $2,106.
- **Principle** (:49-51).
- Go deeper (:56-63): the update's pieces (base year, cost of capital, growth, margin, failure, net debt, options) and unit economics.
- Word count. Required teaching: concept 192 + card 72 + means 68 = **332**; +goDeeper 132 = 464. Testing ≈745 words: **2.2:1** (the best ratio).

### 3. Term ledger
| Term | First appears | Explained | Here / assumed |
|---|---|---|---|
| revenue | story :19 | none (no card in T1-T6) | assumed |
| operating profit (= operating income) | story :20 "kept almost none of it as operating profit" | none; a third name | assumed |
| "prices here are as quoted at the time" (stock splits) | story :20 | none until reveal :31-32 | dangling |
| value per share | story :21 | from T1 | from T1 |
| target years 2030 (revenue) vs 2025 (margin) | story :21-22 | none | assumed |
| operating margin | story :22; concept :39; card :71-76 (**second card**; T1 :54-59 differs) | one-line card + shop example; concept sentence | re-introduced |
| median | story :23; card :83-88 "industry median" | **explained with an example** | introduced |
| "costs fall for every carmaker alike… no sky-high margins" | story :25-26 | explained later in concept :46-47 | used before concept |
| running costs | concept :39 | from T3 | from T3 |
| interest and tax ("before interest and tax") | concept :39 | none | assumed |
| "second lever" | concept :40 | relies on T1 | from T1 |
| mature margin ("once it has grown up") | concept :40-41; card :77-82 | one-line card + example | introduced (used since T1) |
| competition / reversion to the industry | concept :41-43 | **explained in depth (plain)** | introduced |
| competitive edge (brand, patent, software, cost) | concept :44-45; card :89-94 | explained with examples | introduced |
| unit economics / per-car gap | concept :45-47; goDeeper :60-62 | one sentence + juice example (optional) | introduced |
| cost of capital ("7% to 8%", "6%") | question :194, :208; try :298 | none (7% never stated; Amazon 12.84%, Uber 12%) | used before taught |
| chance it fails ("10% to 20%") | question :195; try :299 | none | used before taught |
| Toyota's size ($285bn, hidden) | question :206 | none | missing reference |
| software company's margin; marginal cost ("One more copy of software costs almost nothing") | question :239; fix :317 | in a fix | introduced in a fix |
| market value | question :247; fix :251; explanation :253 | defined in the fix | introduced in a fix |
| "his update", $190 → $427 | try :283 | none before the reveal :29-30 | **tested before told** |
| stock split, "on today's basis" | reveal :31-32 | arithmetic stated | introduced at reveal |
| market value $1 trillion | reveal :33-34 | none | from :251 |
| base year, net debt, options | goDeeper :57-58 | none | optional, unexplained |
| fund manager | talk :336 | none | assumed |

### 4. Jumps
- Story :20, "(prices here are as quoted at the time)": refers to stock splits that are explained only in the reveal.
- Story :21-22, "revenue of about $125 billion in 2030, five times 2019, and an operating margin of 12% by 2025": two horizons, unexplained.
- Story :23-25: 5 percentages and 6 company names in three sentences (the scene :110-111 repeats 3 of them).
- Concept :41, "a few points of margin move a value a long way": no numbers.
- **Try margins-try-moves-update :283-289**: "In January 2020 Damodaran's value for Tesla rose from about $190 to about $427 a share. Which change added the most?" The answer is first given in the reveal (:29-30, a later step) and goDeeper :57-59. No card teaches it.
- Questions :194-195, :208 and try :298-299: cost of capital 7%/8%/6% and failure 10%/20%, both untaught. Nothing explains why Tesla's 7% is far below Amazon's 12.84% (spine-01 :62).
- Question :206, "Toyota's size, with Toyota's 8.46% margin": the size ($285bn) is never shown.
- Reveal :29-36: split arithmetic, a 15× factor, $28.47, $341.62, $123.18. A pile of numbers.
- goDeeper :57-58, "the base year, a lower cost of capital, faster growth, a higher margin, a lower chance of failure, net debt and options": a list of untaught terms.
- Contradicts T5 concept :59-60 (see Topic 5).

### 5. Names (learner-visible)
- "Damodaran":
  - case title :15;
  - story :21 ("Aswath Damodaran, a valuation professor at NYU Stern");
  - goDeeper :57, :62;
  - inStory :82;
  - scene cast name :105 "Aswath Damodaran";
  - chip :154;
  - connection :180;
  - question :186;
  - try :283, :293, :302.
  - That is **12**.
- Linked title "Follow: Damodaran, Tesla valuation (Feb 2020)" via connection :181. That is **+1**.
- "professor": story :21; scene beat speaker :109 ("My story…") = **2**.
- "his/he": reveal :29-30, :35; explanation :201; label :208; prompt :211 ≈ **6**.
- CNBC: reveal :30 (a broadcaster).
- Company names, not commentators: Toyota, Apple, Microsoft, Alphabet, Amazon, Facebook, Netflix, Volkswagen, Hertz.
- Not visible: 3 margin-mark source titles :165-173 and `source` :233, :244.
- **Total ≈ 21 visible references.**

### 6. Depth: 3/5
The concept is the most explanatory paragraph in the six (:38-47, competition and edge).
1. A number barrage in the Moment and reveal (story :19-27, reveal :29-36), with splits and dual horizons. The learner holds over 10 figures before the concept.
2. Tested before taught: Damodaran's update (try :283) and failure chance and cost of capital (:194-195, :208, :298-299).
3. Operating margin is re-defined (T1 :55 "from its operations, before tax" vs here :72 "after its running costs, before interest and tax"), yet still has no worked computation from an income statement (operating income ÷ revenue), despite T4 coming just before.

### 7. Contribution to the end goal
- Gives: the target operating margin, benchmarking against the industry median and best, competitive edge, mean reversion and unit economics. This is lever 2.
- Leaves out:
  - computing a margin from statements;
  - the path from today's margin to the target (convergence years);
  - accounting adjustments (R&D, leases) that change margins;
  - sources of industry data;
  - how margin ties to reinvestment and return on capital;
  - failure risk.

---

## Cross-topic findings (for the cumulative used-before-taught count)

- **End-goal items never taught in positions 1-6 but used or tested:**
  - terminal value: workbench bar in T1, T5, T6 (value-levers-model.ts:481);
  - equity bridge (debt, cash, options, shares): T1 goDeeper :127, T1 band :182, T4 question :334, T5 reveal :46 and deck :131, T6 goDeeper :57-58;
  - failure risk: T3 :313, T5 :239/:255/:431, T6 :195/:299, and the lever in all value_levers benches;
  - cost of capital's makeup and why it differs (12.84% Amazon, 12% Uber, 7% Tesla): T1 :62, T5 :240, T6 :194;
  - time-varying cost of capital: "starts at", "while it grows";
  - mature margin before T6: T1 :56, T3 :311, T4 :340;
  - relative valuation: T1 :215;
  - accrual and receivables: T4 :452.
- **One idea, many names, never reconciled:**
  - sales / revenue / fee (T1 :38-40 bans "revenue"; T3 :16 glosses it; the waterfall bar says "Revenue"; T5 :35 defines revenue as a fee; T6 :19 uses it freely; no Lingo card in T1-T6);
  - interest rate / discount rate / cost of capital / "how risky" (T1 card :61 vs T2 :79-84, :175; no cross-reference);
  - operating income / operating profit / "what it keeps" (T3 :87, T6 :20).
- **Duplicate cards:** operating margin (T1 :54-59 and T6 :71-76, worded differently); compounding (T2 :91-96 and T5 :98-103, plus two near-identical Growth on growth Primers, T2 :193 and T5 :196).
- **Contradiction:** T5 :59-60 (market size moves value most) vs T6 :9 and :188 (margin moves it most) vs T1 :148 (margin always wins).
- **Order inversion:** cash/free cash flow (pos 3) comes before statements (pos 4), so "profit it reports", "operating income" and "report" are used before they are taught (T3 :52-53).
- **Lever sequencing:** T1 asks for all four levers (and failure) to be played. Then T2 teaches discounting but no lever, T3 lever 3, T4 none, T5 lever 1, T6 lever 2. Lever 4 (risk) is not in 1-6 at all, but the questions test it in every value Topic.
- **Testing outweighs teaching** in every Topic: 2.2 to 4.5 words of questions per word of required teaching, which is 262-332 words per Topic.
- **Name count (learner-visible):** T1 ≈18, T2 0, T3 0 (TIME once), T4 0, T5 ≈38 (Damodaran, Gurley, Fidelity), T6 ≈21. Spots that turn up often:
  - case titles ("Damodaran values…", "Uber, Damodaran against venture capital", "Damodaran lets readers…"), which reach the Tutor via src/tutor/context.ts:164;
  - the workbench chip "Damodaran's story" (T1 :100, T5 :173, T6 :154; also the default in src/widgets/recipes/set-workbench.ts:224-352);
  - linked Elective titles "Follow: Damodaran, …" shown in Topic Notes.
