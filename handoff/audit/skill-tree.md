# Skill tree: from zero to "can value any company" (narrative-and-numbers intrinsic valuation)

Internal research note. Names are used here; the learner-facing course must not name him (see section E).
Primary sources: his NYU Stern pages (pages.stern.nyu.edu/~adamodar), book TOCs (publisher pages), his lecture packets and blog. All URLs inline.

Provider notes: Parallel, Tavily, Octen, Firecrawl all used. Octen returned off-topic results for the Little Book TOC query. Firecrawl returned 0 web results for one Little Book TOC query. Parallel `web_fetch` of the Spring 2025 MBA session page was too big for one response, so I extracted it from the saved file. `webcasteqspr26.htm` returns HTTP 404, so **Spring 2025 is the latest full session list** (lecture packets are dated Jan 2026).

---

## (a) End state: "can value any company"

His own definition of the end state:
- Valuation class home page: "value just about anything that has a value and price just about everything else" (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/equity.html).
- Advanced Valuation certificate: "estimate the value of any business, small or large, private or public, in a developed or an emerging market" (https://www.stern.nyu.edu/programs-admissions/online-certificate-courses/online-valuation-course).
- His class project: for each company, a DCF value, a pricing against the sector, a pricing against the market, and a recommendation (class email 5/1/25, https://pages.stern.nyu.edu/~adamodar/New_Home_Page/eqUGemail.html).

The learner is "done" when, given **any listed company and its latest annual report**, they can do everything below without help, with the engine doing the arithmetic.

**Core capabilities (every company):**
- **C-1 Story to value.** Write a short story about the company (its market, competition, edge, risks). Test it as possible, plausible and probable. Turn it into the four levers plus failure risk. Get a value per share with a range, then compare it with the price. (Sources: 5-step process, https://pages.stern.nyu.edu/~adamodar/pdfiles/country/val2day2023.pdf; LB2 ch5.)
- **C-2 Equity bridge.** Go from the value of operating assets to value per share: + cash + cross holdings + other non-operating assets − debt (leases included) − minority interests − employee options/RSUs, ÷ shares (valpacket1spr26 p.220, https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/valpacket1spr26.pdf).
- **C-3 Terminal value sanity.** Stable growth ≤ risk-free rate (about nominal economy growth). Reinvestment = g/ROC. Mature cost of capital. Never close an intrinsic valuation with a multiple (valpacket1spr26 pp.201-206).
- **C-4 Pricing (relative valuation).** Pick a consistent multiple. Look at the peer distribution (median, not average). Name its driver. Control for differences. Give a "priced at" number and explain any gap with intrinsic value (four steps, https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/valpacket2spr26.pdf).
- **C-5 Critique someone else's number.** Back out the levers implied by an analyst target, IPO price or founder claim. Catch the impossible: market share > 100%, perpetual growth > economy, terminal value from a multiple, failure risk hidden in the discount rate, currency mismatch (Bermuda Triangle deck, https://pages.stern.nyu.edu/~adamodar/pdfiles/country/ValuationBermudaTriangleAIMR.pdf; CFA 2022 talk, https://rpc.cfainstitute.org/blogs/enterprising-investor/2022/tell-me-a-story-aswath-damodaran-on-valuing-young-companies).
- **C-6 Update.** Re-value when news breaks, and say whether the story broke, changed or shifted (MBA s14; N&N ch10-12).

**Company-type capabilities ("can value X"):**

| # | Can value… | What is different (his solution) | His worked examples |
|---|---|---|---|
| X1 | **Mature, stable** company | Stable or near-stable growth; reinvestment = g/ROC; mature cost of capital; status-quo value vs value under better management (value of control) | Unilever 2023 (LB2 ch8); Con Ed 2008 "training wheels" stable model ($2.32×1.021/(.077−.021)=$42.30 vs price $40.76, valpacket1spr26 p.276); Hormel (value of control) |
| X2 | **High-growth, profitable** company | How fast growth fades; margin holds or compresses; sales-to-capital; growth adds value only if ROIC > cost of capital | Alphabet 2023 (LB2 ch7) |
| X3 | **Young / loss-making / IPO** company | Total market × share → revenue; target margin plus path to it; sales-to-capital → reinvestment; cost of capital high then falling; **separate failure probability**; capitalize R&D; future equity raises show up as negative cash flows; terminal value can exceed 100% of value | Airbnb IPO 2020 (LB2 ch6), Zomato 2021, Uber 2014, Amazon 2000 |
| X4 | **Cyclical / commodity** company | Normalize earnings across the cycle (average margins, sector averages), normalize the commodity price (or use market forward prices), and normalize everything consistently | Toyota 2009, Shell 2023 (LB2 ch11); earnings normalizer |
| X5 | **Bank / financial service** company | Debt is raw material, so value **equity only**. Cash flow = net income − reinvestment in regulatory capital (or dividends). Use cost of equity. Price with P/B driven by ROE vs cost of equity. No EV multiples | Citigroup 2023 (LB2 ch10); bank FCFE model |
| X6 | **Multinational / emerging-market** company (currency and country risk) | Pick a currency. Risk-free rate in that currency (strip the sovereign default spread, or convert by inflation difference). Equity risk premium weighted by **where the company operates** (revenue, or production for resource firms). Debt carries both the country's and the company's default spread. Cash flows use the same inflation | Coca-Cola revenue-weighted ERP, Aramco (Saudi production), Embraer (3% Brazil revenue), Ambev, Vale (N&N) |
| X7 | **Declining / distressed** company | Shrinking revenue, negative or low growth, divestitures, possibly negative reinvestment. Value = DCF × (1−P distress) + distress sale value × P distress. P from bond rating or bond price | Bed Bath & Beyond 2022/23 (LB2 ch9); LVS 2008: $8.12 going-concern → $1.92 after 76.66% distress probability (https://people.stern.nyu.edu/adamodar/pdfiles/execs/val3day17.pdf) |
| X8 | **Intangible-heavy** company (tech, pharma) | Capitalize R&D; treat leases as debt; treat stock-based comp as a real expense | Microsoft R&D tools webcast; SpaceX 2026 R&D capitalization (https://aswathdamodaran.substack.com/p/revisiting-the-spacex-valuation-a) |
| X9 | **Holding / multi-business** company | Cross holdings at market value; sum of the parts | Tata companies (valpacket1spr26 p.321) |

**Outside the core end state (nice-to-have; his advanced sessions):** private companies (illiquidity, undiversified owners), acquisitions (synergy, control), real options (patents, reserves, option to expand), distressed equity as an option, valuing the whole market (implied ERP), probabilistic simulation.

---

## (b) Prerequisite-ordered skill list: zero → end state

Format: **ID | the one idea (plain words) | prerequisites | terms it introduces | everyday example**. One idea per row. Rows are in teachable order: every term is introduced before it is used. "Src" points to where he covers it.

### Stage A: Businesses, owners, price vs value (assumes nothing)

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| A1 | A business takes money in from customers and pays out costs; what is left is profit | none | business, customer, revenue (sales), cost/expense, profit | A lemonade stand: $400 in, $340 out, $60 left |
| A2 | Revenue = price × how many you sell | A1 | price, units, revenue | 200 cups × $2 = $400 |
| A3 | Some costs are for making the product, others for running the shop | A2 | cost of goods sold, operating expenses, gross profit | Lemons and cups vs stall rent, wages, flyers |
| A4 | Operating profit is what the business itself earns, before lenders and the taxman | A3 | operating income (EBIT) | $400 − $340 of lemons, rent and wages = $60 |
| A5 | A margin is profit as a share of every unit of sales | A4 | margin, gross margin, **operating margin** | $60 / $400 = 15 cents of every dollar kept. **Teach here, before any lesson uses it** (fixes the spine-01 complaint) |
| A6 | Businesses are funded by owners' money and borrowed money | A1 | equity, debt, lender, interest | A house bought with savings plus a mortgage |
| A7 | Lenders get paid first; owners get whatever is left | A6 | fixed claim, residual claim | The mortgage is paid before you keep any rent surplus |
| A8 | Taxes take a share of profit; interest is paid before tax | A4, A7 | tax rate, pre-tax, after-tax, net income | $60 − $10 interest = $50 taxed at 25% → $37.50 net |
| A9 | A share is a slice of ownership; price × shares = what the whole company's equity costs | A6 | share/stock, shares outstanding, share price, market capitalization | A pizza in 8 slices at $3 each = $24 for the pizza |
| A10 | A stock market is where slices of public companies change hands | A9 | listed/public company, private company, stock exchange, IPO | A farmers' market for company slices |
| A11 | Price is what you pay; value is what it is worth to you; they can differ | A9 | price, value, intrinsic value, "the gap" | A flat's asking price vs what its rent makes it worth. Src: syllabus theme "Value Price THE GAP" (https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/eqsyllspr25.pdf) |
| A12 | You can put a number on anything in two ways: from what it produces, or from what similar things sell for | A11 | intrinsic valuation, relative valuation/pricing, comparables | Value a rental flat by its rent, or by what the flat next door sold for. Src: LB2 ch1; IV4e ch2 |

### Stage B: Reading the scorecard (financial statements)
Src: Accounting 101 (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastacctg.htm); LB2 ch2 "Accounting 101"; IV4e ch3.

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| B1 | Companies publish a yearly report with three statements | A1–A9 | annual report, filing (10-K), fiscal year, financial statements | A household's yearly money summary |
| B2 | The income statement runs from revenue down to net income | A3–A8, B1 | income statement, net income | The stand's year on one page: sales → costs → interest → tax → what's left |
| B3 | Earnings per share is net income ÷ shares | B2, A9 | EPS | $37.50 profit ÷ 10 slices = $3.75 per slice |
| B4 | The balance sheet shows what the company owns vs what it owes; equity is the difference | A6, B1 | balance sheet, assets, liabilities, book value of equity | House $500k − mortgage $300k = $200k yours |
| B5 | Book value is history; market value is expectations | B4, A9 | book value, market value | A brand is worth billions but is not on the balance sheet |
| B6 | Profit is not cash: sales on credit and stock on shelves tie up money | B2, B4 | accrual, receivables, inventory, (non-cash) working capital | You sold $100 of lemonade on a tab, so profit went up but no cash came in |
| B7 | Big long-lived purchases are spread over their life | B6 | capital expenditure (capex), depreciation, amortization | A $3,000 van used for 3 years = $1,000 a year of cost |
| B8 | The cash flow statement shows where cash came from and went | B6, B7 | cash flow statement, cash from operations, investing, financing | Bank statement vs diary of promises |
| B9 | Accounting gets three things wrong for valuation: R&D is investment, leases are debt, stock pay is an expense | B7, A6 | R&D, lease, stock-based compensation, capitalize | Training an apprentice is an investment, not a running cost; a 10-year shop lease is a loan in disguise. Src: Accounting 101 s5 |
| B10 | Ratios scale numbers so companies can be compared | B2, B4, A5 | ratio, return on equity (ROE), **return on invested capital (ROIC)**, invested capital, debt ratio, interest coverage | Miles per gallon, not total miles. Src: Accounting 101 s6; tools webcast "ROIC… the only valuation number that matters" |
| B11 | Use the most recent twelve months, not last year's report | B1 | trailing twelve months (TTM), quarterly report | Last 12 months of grocery bills, not calendar 2024. Src: tools webcast |
| B12 | Summarize many companies with the median and a spread, not the average | numeracy | median, distribution, percentile, outlier | Typical house price = median, because one mansion skews the average. Src: Statistics primer; LB2 ch2 "Making sense of data" |

### Stage C: Time and risk (the two forces in every valuation)
Src: Foundations of Finance s3–s6, s10–s12 (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastfoundationsonline.htm); LB2 ch2 "Time is money", "Grappling with risk"; MBA s4–s8.

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| C1 | Money now is worth more than the same money later | A1 | time value of money | $100 today could be in a savings account earning interest |
| C2 | Compounding grows money forward | C1 | interest rate, compounding, future value | $100 at 5% → $105 → $110.25 |
| C3 | Discounting brings future money back to today | C2 | present value, discount rate, discounting | $110.25 in 2 years at 5% = $100 today |
| C4 | Inflation shrinks what money buys; rates can be "nominal" or "real" | C2 | inflation, nominal, real | A $2 coffee costs $2.10 next year |
| C5 | A payment that lasts forever has a finite value: CF ÷ (r − g) | C3 | perpetuity, growing perpetuity | $5 a year forever at 5% = $100; growing 2% a year: $5/(5%−2%) = $167 |
| C6 | Risk means outcomes are uncertain; people want extra return to bear it | C1 | risk, expected value, risk premium | A sure $100 vs a coin flip for $0 or $200 |
| C7 | The risk-free rate is what a no-default government bond pays in a currency; it differs by currency mostly because of inflation | C4, C6 | risk-free rate, government bond, default | US vs Turkish government bond rates. Src: MBA s4 |
| C8 | Spreading bets removes some risk; only the risk you can't spread gets rewarded | C6 | diversification, market risk vs company-specific risk | Owning an umbrella shop and a sunscreen shop |
| C9 | Stocks as a whole must pay more than risk-free; that extra is the equity risk premium | C7, C8 | equity risk premium (ERP) | Why shares, on average, beat savings accounts over long periods. Src: MBA s5–s6 |
| C10 | Some businesses swing more with the economy than others | C8, C9 | relative risk (beta), cyclical | Luxury cars vs toothpaste in a recession. Src: MBA s7 |
| C11 | Cost of equity = risk-free + relative risk × ERP | C7–C10 | cost of equity, required return | 4% + 1.2 × 5% = 10% |
| C12 | Cost of debt = risk-free + a default spread, made cheaper by tax | C7, A8, B10 | cost of debt, default spread, credit rating | A riskier borrower pays a higher mortgage rate |
| C13 | Cost of capital blends equity and debt costs by market-value weights | C11, C12, A9 | **cost of capital (WACC)** | A blended rate on a purchase funded 80% savings, 20% loan. Key insight: 80% of global companies sit between ~4.5% and ~10%, so don't chase decimals (CFA 2022 talk) |
| C14 | Where a company does business adds country risk; weight it by where revenue (or production) comes from | C9 | country risk premium, sovereign rating, operations-based exposure | The same café in a stable vs an unstable country. Src: https://aswathdamodaran.substack.com/p/country-risk-2025-the-story-behind |
| C15 | Cash flows and the discount rate must be in the same currency; inflation difference converts one to another | C4, C7, C13 | currency consistency, inflation differential, exchange rate | 3.97%+10.87% = 14.84% in USD → ×(1.20/1.025)−1 = 34.45% in Turkish lira (same source) |

### Stage D: The intrinsic value machine (big picture)
Src: LB2 ch3; online class s2 (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastvalonline.htm); valpacket1spr26.

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| D1 | Value = present value of expected cash flows, discounted for risk | C3, C6 | discounted cash flow (DCF), expected cash flow | An orchard is worth the fruit it will sell, discounted |
| D2 | If something changes neither cash flows nor risk, it can't change value | D1 | (the "IT" proposition; teach without the label) | A stock split or a new logo doesn't make the company worth more |
| D3 | You can value the whole business or just the owners' slice, but the rate must match the cash flow | A7, C11, C13, D1 | firm (enterprise) valuation, equity valuation, free cash flow to the firm (FCFF), free cash flow to equity (FCFE) | Equity $1,073 at cost of equity vs firm $1,873 at cost of capital; mixing them overstates by $175 or understates by $260 (valpacket1spr26) |
| D4 | A company has things it already runs and things it hopes to build | B4, D1 | assets in place, growth assets | Grown fruit trees vs saplings just planted |
| D5 | Four questions: cash from existing assets? value of growth? how risky? when does it mature? | D4 | (framework) | The orchard: today's fruit, new trees, weather risk, when the orchard stops expanding |
| D6 | Free cash flow = after-tax operating profit − reinvestment | A8, B6, B7, D3 | after-tax operating income, reinvestment, free cash flow | What you could take out of the stand after setting money aside for a bigger fridge |
| D7 | Growth is not free; it costs reinvestment | D6 | — | Opening a second stall needs a second fridge |
| D8 | Growth = reinvestment rate × return on capital; growth adds value only when return on capital beats cost of capital | D7, B10, C13 | reinvestment rate, excess return, value-creating growth | Borrowing at 8% to earn 6% makes you bigger and poorer. Src: valpacket1spr26 "growth has to be earned" |
| D9 | Forecast a few years in detail, then close with a terminal value | C5, D1 | forecast period, high-growth period, terminal value, stable growth | Plan the café's next 10 years, then "it settles into a steady neighbourhood café" |
| D10 | First full valuation: a mature, steady company valued with one stable-growth formula | C5, C11, D9 | stable-growth (dividend) model | Con Ed 2008: $42.30 value vs $40.76 price (valpacket1spr26 p.276; MBA s14 "training wheel") |

### Stage E: The four levers (the story's numbers)
Src: "Business drivers that determine value: 1. Revenue growth 2. Target margins 3. Sales to invested capital" (https://pages.stern.nyu.edu/~adamodar/pdfiles/country/narrative&numbersDEShaw2024.pdf); six factors for young firms (CFA 2022); LB2 value-driver pages.

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| E1 | **Lever 1, revenue growth:** future revenue = total market × your share; growth slows as you get bigger | A2, D9 | total (addressable) market, market share, revenue growth rate | A café chain can't sell more coffee than the city drinks. Check: share ≤ 100% |
| E2 | **Lever 2, operating margin:** pick a target margin from mature peers and a path to reach it | A5, B12 | target margin, path to profitability, unit economics, economies of scale | Mature software vs restaurant margins differ a lot (his industry margin dataset, https://www.stern.nyu.edu/~adamodar/pc/datasets/margin.xls) |
| E3 | Taxes start low (old losses shelter profit) and rise toward the statutory rate | A8, E2 | effective vs marginal tax rate, loss carryforward | Last year's loss reduces this year's tax bill. Src: MBA s9 |
| E4 | **Lever 3, reinvestment:** each $1 invested brings $X of new sales; reinvestment = extra revenue ÷ sales-to-capital | D7, E1 | **sales-to-capital ratio**, capital intensity | Sales-to-capital 2.5 with $250m more revenue → $100m reinvested (https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook/growthvaluedrivers.htm). A bakery needs ovens; an app needs few |
| E5 | Check the implied return on capital stays believable | D8, E4 | implied ROIC | If your numbers imply a 90% return forever, something is off |
| E6 | **Lever 4, risk:** cost of capital starts high for a young company and drifts toward a mature level | C13, D9 | cost-of-capital path | Uber 2014: 12% → 8% |
| E7 | Failure risk is separate from the discount rate: weight the value by the chance the company survives | D1, E6 | probability of failure, going concern, distress/liquidation value | Only ~31% of US firms founded in 1998 survived 7 years (~25% in information) (https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/younggrowth.pdf). Don't hide this in the rate (CFA 2022) |
| E8 | Fewer, better inputs beat a 300-line model | E1–E7 | parsimony | "Less (detail) is often more (precision)" (young growth paper) |

### Stage F: Closing the valuation and bridging to one share

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| F1 | Terminal value rules: grow no faster than the economy (cap at the risk-free rate), reinvest g/ROC, use a mature cost of capital, never use a multiple | C5, D8, D9 | stable growth rate, growth cap | No company outgrows the whole economy forever (valpacket1spr26 pp.201–206) |
| F2 | The terminal value is often most of the value; for young firms it can exceed 100% | F1 | — | Early years burn cash; the payoff is later (CFA 2022) |
| F3 | Equity bridge: operating assets + cash + holdings − debt − minority interests − options ÷ shares | D3, B9, A9 | value of operating assets, enterprise value, cross holdings, minority interest, employee options/RSUs, diluted shares, value per share | Net worth = house + cash in drawer − mortgage. Heineken 2019: €51,691m ops − €19,710m debt − €1,069m minority + €1,752m cash + €1,401m non-op = €34,065m ÷ 571.1 = €59.65 vs price €93.25 |
| F4 | Compare value per share to price: is there a gap, will it close, what would close it? | A11, F3 | undervalued, overvalued | Syllabus "THE GAP" slide |
| F5 | Your value is a range: test what-ifs on each lever | E1–E7 | sensitivity, scenario, range (simulation is nice-to-have) | "If margins reach 15%, not 20%, value falls to…" |
| F6 | Three traps: your prior bias, ignoring uncertainty, and hiding in complexity | A11 | bias, uncertainty, complexity | Being paid by the seller biases your number (Bermuda Triangle deck; do not use that label for learners) |

### Stage G: Story to numbers (the method's heart)
Src: 5 steps (https://pages.stern.nyu.edu/~adamodar/pdfiles/country/val2day2023.pdf); N&N ch6–ch11; LB2 ch5; IV4e ch13; MBA s13–s14.

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| G1 | Every valuation starts as a story about the company, its market, competition and environment | A12, Stage E | narrative/story | "A neighbourhood café that becomes the default coffee stop for the office district" |
| G2 | Test the story: is it possible, plausible, probable? | G1 | possible, plausible, probable | "Could go global" (possible) vs "opens 3 more city shops" (probable) |
| G3 | Each part of the story becomes a lever; each lever traces back to the story | G2, E1–E7 | (story → lever mapping) | Uber 2014: $100bn taxi market, 10% share, 40% margin, sales-to-capital 5.00, 12%→8% cost of capital, 10% failure. Ferrari 2015: 4%→0.7% growth, 18.2% margin, sales-to-capital 1.42, 6.96% (euros) (https://pages.stern.nyu.edu/~adamodar/pdfiles/country/narrative%26numbersshort2018.pdf) |
| G4 | Run the levers to a value per share and present story + numbers together | G3, F3 | — | His spreadsheet has a "story" worksheet next to the inputs (class email 3/13/25) |
| G5 | Show it to people who disagree; value the alternative stories | G4 | feedback loop | Ask a taxi driver and a VC about your ride-hailing story |
| G6 | When news arrives, decide if the story broke, changed or shifted, then revalue | G4 | story break, change, shift | A regulator bans the service in a key city |

### Stage H: Pricing vs value (relative valuation)
Src: four steps (valpacket2spr26; https://people.stern.nyu.edu/adamodar/pdfiles/multintr.pdf); LB2 ch4; online s14–s18; MBA s17–s20.

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| H1 | A multiple standardizes a price so different-sized companies can be compared | A9, B2, B4, F3 | multiple, P/E, EV/EBITDA, EV/Sales, price-to-book (P/B), EBITDA | Price per square foot for flats |
| H2 | **Define:** equity price goes with equity earnings; enterprise value goes with operating numbers | H1, D3 | consistency | Don't divide a flat's price by the whole building's rent |
| H3 | **Describe:** know the peer distribution; use the median, watch skew | H1, B12 | — | One celebrity mansion distorts the street's average |
| H4 | **Analyze:** every multiple is driven by growth, risk and cash flow (P/E rises with growth, P/B with ROE vs cost of equity, EV/Sales with margin) | H1, D8 | companion variable | A cheap P/E may just mean low growth or high risk |
| H5 | **Apply:** choose peers and control for differences (simple comparison, or a regression on drivers) | H2–H4 | peer group, comparable firm | Severstal priced against steel companies (MBA s18) |
| H6 | Pricing is not valuation; when they disagree, know whether you are an investor or a trader | H5, F4 | — | Class email 4/24/25: "be ready for the possibility that you get a different signal" |

### Stage I: Across the life cycle
Src: LB2 ch6–ch9; Corporate Life Cycle book ch9–13 (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/CLC.htm); Dark Side 3e Part III; MBA s15–s16.

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| I1 | Companies age: start-up → young growth → high growth → mature → decline; the weight moves from story to numbers | G1, D5 | corporate life cycle | A person's life stages |
| I2 | **Young/loss-making:** revenue from market × share, target margin + path, sales-to-capital, falling cost of capital, failure probability, R&D capitalized, dilution as negative cash flows | E1–E8, B9 | IPO, burn rate (optional) | Airbnb 2020 IPO; Zomato |
| I3 | **High growth:** how long it lasts depends on how durable the competitive edge is | E1, D8 | competitive advantage (moat), growth period | Alphabet 2023 |
| I4 | **Mature:** value as run today vs value if run better; the gap is the value of control | D8, F3 | value of control, status-quo value | Hormel: 10% chance of management change → $32.50 expected (valpacket1spr26) |
| I5 | **Declining:** revenue shrinks, terminal growth can be negative, reinvestment can turn negative | F1 | negative growth, divestiture | Bed Bath & Beyond 2022 |
| I6 | **Distressed:** value = going-concern DCF × survival chance + distress sale value × failure chance; use bond rating or bond price for the chance | E7, C12 | probability of distress, distress sale value | LVS: $8.12 → $1.92 |

### Stage J: Special companies (sector and geography)

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| J1 | **Banks:** debt is raw material, so value only equity; cash flow = net income − money retained to keep regulatory capital up; price with P/B vs ROE | D3, C11, B10, H4 | regulatory capital, capital ratio, book equity | 5% capital ratio: retain $10m → can lend $200m more (https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook/bankvaluedriver.htm); Citigroup 2023 |
| J2 | **Cyclicals and commodity firms:** value off a normal year and a normal commodity price, consistently | E2, B12 | normalized earnings, normalized commodity price | Valuing an oil firm at $100 oil when oil is $45 bakes in your oil bet (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/littlebook/commodityvaluedrivers.htm) |
| J3 | **Emerging-market or multinational firms:** country risk from where it operates; one currency throughout; debt carries country + company spread | C14, C15 | operations-weighted ERP | Coca-Cola is exposed to emerging markets though US-listed; Aramco all Saudi (https://aswathdamodaran.substack.com/p/data-update-4-country-risk-and-currency-20-02-20) |
| J4 | **Intangible-heavy firms:** fix the accounting (capitalize R&D, SBC as expense) before valuing | B9 | R&D asset | SpaceX 2026: capitalizing R&D turns a reported loss into ~$4bn pre-R&D earnings |
| J5 | Holding companies: add cross holdings at market value; sum the parts | F3 | sum of the parts | Tata Motors and Tata Steel stakes |
| J6 | Private companies: no market price, undiversified owners, illiquidity | C10, F3 | illiquidity discount, total beta | Valuing a family restaurant for sale (nice-to-have) |
| J7 | Acquisitions: synergy and control are paid for, often overpaid | I4 | synergy, premium | (nice-to-have) |
| J8 | Real options: a patent or undeveloped reserve is a right, not an obligation | C3, C6 | option, real option | (nice-to-have) |

### Stage K: Capstone

| ID | One idea | Prereq | New terms | Everyday example |
|---|---|---|---|---|
| K1 | Get the inputs: latest filing + industry averages (margins, sales-to-capital, cost of capital, country risk) | B1, B12 | industry dataset | Src: tools webcast "Getting data"; https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html |
| K2 | Value one company of each type end to end: story → levers → value → bridge → price → pricing cross-check | all core | — | Mature (Unilever) → young (Airbnb) → bank (Citi) → cyclical (Shell) → EM/multinational → distressed |
| K3 | Conclude with a range and a reasoned view, and revisit as facts change | F4, F5, G6 | — | "If you value something, you should be willing to act on it" (syllabus theme 5); in the app, frame as a judgment, not trade advice |

---

## (c) The order he teaches it (with citations)

**1. His prescribed path for someone with no background** (https://aswathdamodaran.blogspot.com/2022/12/a-return-to-teaching-spring-2023-edition.html):
- Prep classes first: Accounting, Foundations of Finance, Statistics.
- Then Corporate Finance.
- Then Valuation. "If your interests lie in learning the craft of valuation… take both the corporate finance and valuation classes."
- The valuation syllabus also lists "pre-season prep": accounting, statistics and present value primers (https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/eqsyllspr25.pdf; primers at https://pages.stern.nyu.edu/~adamodar/New_Home_Page/primer.html).

**2. Foundations of Finance, 12 sessions** (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastfoundationsonline.htm):
1 Introduction → 2 Structure of a business (financial balance sheet, life cycle) → 3 Cash flows → 4 What is risk → 5 Measuring risk → 6 Time value of money → 7 Valuing bonds → 8 Valuing equity → 9 Valuing options → 10 Inflation → 11 Interest rates → 12 Currency.

**3. Accounting 101** (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastacctg.htm):
1 Overview of statements → 2 Income statement → 3 Balance sheet → 4 Cash flow statement → 5 Accounting inconsistencies (SBC, R&D, leases) → 6 Ratios. Each session has an "A" illustrations session.

**4. The Little Book of Valuation, 2nd ed. 2024: his beginner-facing order** (https://www.wiley.com/en-us/shop/general-finance-investments/the-little-book-of-valuation-how-to-value-a-company-pick-a-stock-and-profit-updated-edition-p-9781394244409; site https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook2ed.htm):
- *Basics:*
  - ch1 Value, more than a number (two approaches)
  - ch2 Power tools (time value, risk, Accounting 101, making sense of data)
  - ch3 Intrinsic value, in this order: business vs equity → cash flows → growth → cost of capital → terminal value ("the big number") → per-share value; worked example Kraft Heinz
  - ch4 Relative value (multiples, four keys, asset-based, intrinsic vs relative)
  - ch5 Stories and numbers (Zomato IPO)
- *Life cycle:*
  - ch6 Young growth (Airbnb)
  - ch7 Growth (Alphabet)
  - ch8 Mature (Unilever)
  - ch9 Decline and distress (BB&B)
- *Special cases:*
  - ch10 Banks (Citigroup)
  - ch11 Cyclical and commodity (Toyota, Shell)
  - Conclusion: Rules for the Road

**5. Valuation Online Class, 25 short sessions** (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastvalonline.htm):
- 1 Intro (bias, complexity, uncertainty)
- 2 Intrinsic foundations (business vs equity)
- 3 Risk-free rate → 4 Equity risk premium → 5 Betas → 6 Cost of debt and capital
- 7 Cash flows → 8 Growth → 9 Terminal value
- 10 Value enhancement
- 11 Loose ends (cash, cross holdings, debt) → 12 Synergy, control, complexity → 13 Distress, dilution, illiquidity
- 14 Relative valuation first principles → 15 P/E → 16 EBITDA multiples → 17 Book multiples → 18 Revenue multiples
- 19 Asset-based valuation → 20 Private companies
- 21–24 Real options and distressed equity → 25 Closing
- Tools webcasts: getting data, reading a 10-K, TTM, implied ERP, leases, R&D, ROIC, terminal value check, employee options, EV vs equity, multiples analysis, patents, distressed equity.
- (2014 design: no dedicated story or life-cycle session.)

**6. MBA Valuation, Spring 2025, 26 sessions: latest full list** (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcasteqspr25.htm):
- s1 Priors
- s2 Bias; intrinsic, relative and real-option big pictures
- s3 Cash flow consistency
- s4 DCF big picture; risk; risk-free rate
- s5 ERP, country risk premiums
- s6 Implied ERP
- s7 Betas (bottom-up)
- s8 Cost of debt and capital; cash-flow big picture
- s9 FCFF: capitalize R&D, normalize earnings, tax, capex, working capital; FCFE
- s10 Growth: historical, analyst, fundamental
- s11 More growth; terminal value
- s12 Loose ends: cash, cross holdings, debt
- s13 Stock-based comp; **stories and numbers**
- s14 Story breaks; "training wheel" valuation; valuing the market
- s15 Young; mature in transition; decline
- s16 Distressed; financial services; commodity
- s17 Commodity; deconstructing multiples
- s18 Market P/E
- s19 EBITDA, book and revenue multiples; peer groups
- s20 Asset-based valuation; private companies
- s21 Private to IPO/VC
- s22–24 Real options; distressed equity as option
- s24–25 Acquisitions, synergy, value of control
- s26 Close
- Session→chapter map: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valchaptersession.html

**7. Narrative and Numbers (2017)** (https://cup.columbia.edu/book/narrative-and-numbers/9780231180481):
1 Two tribes → 2 Tell me a story → 3 Elements of storytelling → 4 Power of numbers → 5 Number-crunching tools → 6 Building a narrative → 7 Test-driving → 8 Narrative to numbers → 9 Numbers to value → 10 Feedback loop → 11 Narrative alterations → 12 News → 13 Macro story → 14 Life cycle → 15 Managerial challenge → 16 Endgame.

**8. Investment Valuation, 4th ed. (Dec 2024)** (https://www.wiley.com/en-us/investment-valuation-tools-and-techniques-for-determining-the-value-of-any-asset-4th-edition-p-9781394254613):
- ch1–2 Intro, approaches
- ch3 Financial statements → ch4 Risk → ch5 Options → ch6 Market efficiency
- ch7 Riskless rates and premiums → ch8 Cost of financing
- ch9 Earnings → ch10 Cash flows → ch11 Growth (top-down revenue → FCF) → ch12 Terminal value (survival)
- **ch13 Narrative and numbers** (new in 4e)
- ch14 Equity models → ch15 Firm models → ch16 Value per share (non-operating assets, SBC, voting)
- ch17–20 Multiples
- ch21 Financial services → ch22 Money-losing → ch23 Young → ch24 Private → ch25 Acquisitions → ch26–27 Real estate and other
- ch28–30 Options
- ch31–32 Value enhancement → ch33 Probabilistic → ch34 Overview
- Dark Side 3e adds emerging-market and multi-business chapters (https://www.pearson.com/en-us/subject-catalog/p/Damodaran-Dark-Side-of-Valuation-The-3rd-Edition/P200000000206).

**Ordering lessons for the redesign:**
- *Same in every source:*
  - Basics (accounting, time value, risk) come first.
  - The intrinsic machine comes next.
  - Story-to-numbers comes **after** the mechanics (MBA s13, LB2 ch5, IV4e ch13).
  - Pricing comes after intrinsic value.
  - Life-cycle and sector cases come after that.
  - Options, private companies and acquisitions come last.
- *Where the sources differ:*
  - His MBA and online classes teach discount rates (risk-free, ERP, beta, cost of debt) **before** cash flows and growth. That assumes MBA prerequisites.
  - His beginner book teaches cash flows → growth → cost of capital → terminal → per share (LB2 site, Valuation Mechanics table).
  - For a general audience with an engine, follow the Little Book order: levers before rate details.
- *His own case per stage*, a ready-made progression of worked examples:
  - Kraft Heinz (mechanics)
  - Zomato (story)
  - Airbnb, Alphabet, Unilever, BB&B (life cycle)
  - Citigroup, Shell (special cases)

---

## (d) Essential vs nice-to-have (a beginner valuing alone; the engine does the arithmetic)

Rule of thumb from his own advice:
- Learners must own the **judgment inputs**: the story, the levers, failure risk, and the sanity checks.
- They need only the **idea** behind inputs the engine or market data can supply: risk-free rate, ERP, industry beta, default spreads. "These are precisely the kinds of numbers that should be outsourced to the market" (CFA 2022 talk).

| Area | ESSENTIAL (must understand and be able to set or judge) | NICE-TO-HAVE (concept awareness, or skip) |
|---|---|---|
| Business basics | A1–A12 all | — |
| Statements | Read income statement and balance sheet; profit ≠ cash; capex/depreciation; working capital; the 3 accounting fixes (R&D, leases, SBC) *as ideas*; ROIC; TTM; median vs average | Lease-to-debt and R&D capitalization arithmetic (engine); full cash flow statement detail; FIFO/LIFO |
| Time and risk | Time value, discounting, inflation, perpetuity CF/(r−g); risk premium idea; diversification; cost of capital as a percentile/range by industry; country risk weighted by operations; currency consistency | Beta regression; bottom-up beta unlever/relever math; synthetic ratings; implied ERP computation; CAPM alternatives |
| DCF machine | DCF idea; "IT" idea (unlabeled); firm vs equity matching; free cash flow = after-tax operating income − reinvestment; growth costs reinvestment; ROIC vs cost of capital; forecast + terminal | APV; FCFE vs DDM model choice detail; marginal vs average ROIC |
| Levers | All four levers + failure probability + target margin path + sales-to-capital + parsimony | Line-item expense forecasting (he advises against it for young firms) |
| Closure and bridge | Terminal growth cap; reinvestment g/ROC; no multiple in terminal value; terminal value share can be large; full equity bridge as a list; options/RSUs reduce per-share value | Option valuation of employee grants (engine); voting-share differentials; minority interest P/B conversion |
| Story | 5 steps; possible/plausible/probable; story→lever mapping; feedback; revisit on news | Story-break taxonomy depth; macro stories |
| Pricing | Multiples as standardized prices; consistent definition; median; drivers of P/E, EV/Sales, P/B; peer choice; pricing ≠ value | Sector regressions; PEG; Tobin's Q; market-wide regressions |
| Life cycle | Young, high-growth, mature, declining, distressed (expected-value distress formula) | Value of control math; distressed equity as an option |
| Sectors/geography | Banks (equity-only, regulatory capital, P/B vs ROE); cyclicals/commodities (normalization); emerging/multinational (country risk + currency); intangibles | Insurers/payments specifics; sum of the parts; real estate |
| Advanced | — | Private companies, acquisitions/synergy, real options, simulation/Monte Carlo, value enhancement (EVA/CFROI), valuing the market |
| Mindset | Value ≠ price; ranges not points; bias awareness; be less wrong; you'll be wrong | — |

---

## (e) Notes for the name-free, general-audience constraint

- Paraphrase or drop his **signature coinages and labels** in learner text. To a general reader they are noise, and to anyone who knows him they quietly attribute:
  - "Bermuda Triangle of valuation" → "three traps"
  - "IT proposition", "Don't be a wuss proposition"
  - "Willy Wonkitis", "runaway story", "big market delusion"
  - "Jedi", "Ginzu" (spreadsheet name), "training wheels", "Valuation of the week"
  - "possible, plausible, probable" is plain English and fine.
- Avoid **person-named tools** in learner text:
  - Black-Scholes → "an option pricing formula"
  - Tobin's Q → skip
  - Monte Carlo → "simulation"
  - CAPM → "the cost-of-equity formula"
  - Knaup/Piazza survival data → "US business survival data"
  - "Damodaran's datasets" → "industry averages"
- Repo pointer for other auditors (not audited here): `GLOSSARY.md:251` defines Reference story "such as Damodaran's Amazon of February 2000". Check whether widget copy shows that name to learners.
- Repo pointer (not audited here): `course/topics/` includes many files off this skill tree's critical path (e.g., `der-*`, `bond-duration`, `eco-*`, `ins-risk-transfer`, `fx-bop`). Whether they belong in a "fixed, linear" course to the end state is a scope question for the owner.

## Source index (primary)
- MBA Spring 2025 sessions: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcasteqspr25.htm
- Syllabus Spring 2025: https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/eqsyllspr25.pdf
- Online valuation class: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastvalonline.htm
- Session→chapter map: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valchaptersession.html
- Lecture packet 1 (Jan 2026): https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/valpacket1spr26.pdf
- Lecture packet 2 (Jan 2026): https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/valpacket2spr26.pdf
- Little Book 2e site: https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook2ed.htm
- Little Book 2e TOC: Wiley link above
- Narrative and Numbers TOC: https://cup.columbia.edu/book/narrative-and-numbers/9780231180481
- Investment Valuation 4e TOC: Wiley link above
- Dark Side 3e: Pearson link above
- Damodaran on Valuation 2e TOC: https://www.wiley.com/en-ca/damodaran-on-valuation-security-analysis-for-investment-and-corporate-finance-2nd-edition-p-9781119201786
- Foundations of Finance: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastfoundationsonline.htm
- Accounting 101: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastacctg.htm
- Class sequencing blog: https://aswathdamodaran.blogspot.com/2022/12/a-return-to-teaching-spring-2023-edition.html
- Young companies: https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/younggrowth.pdf; https://pages.stern.nyu.edu/~adamodar/New_Home_Page/littlebook/younggrowthvaluedrivers.htm; CFA 2022 talk recap (secondary): https://rpc.cfainstitute.org/blogs/enterprising-investor/2022/tell-me-a-story-aswath-damodaran-on-valuing-young-companies
- Banks: https://pages.stern.nyu.edu/~adamodar/pdfiles/val3ed/c21.pdf; https://aswathdamodaran.substack.com/p/good-bad-banks-good-bad-investments; https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook/bankvaluedriver.htm
- Cyclical/commodity: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/littlebook/commodityvaluedrivers.htm; https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/commodity.pdf
- Distress: https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/NewDistress.pdf; https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/distress.pdf
- Country risk / currency: https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/countryrisk2024formatted.pdf; https://aswathdamodaran.substack.com/p/country-risk-2025-the-story-behind
- Story to numbers decks: https://pages.stern.nyu.edu/~adamodar/pdfiles/country/narrative%26numbersshort2018.pdf; https://pages.stern.nyu.edu/~adamodar/pdfiles/country/val2day2023.pdf
- Relative valuation four steps: https://people.stern.nyu.edu/adamodar/pdfiles/multintr.pdf
