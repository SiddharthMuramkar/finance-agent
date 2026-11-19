# Anchor data check: Coca-Cola (KO) and DMart (Avenue Supermarts), as of mid-2019

**Short answer:** mid-2019 works for both companies. Use one As-of date: **Wednesday 31 July 2019, market close.** Keep both as Anchors. Each has a few traps, listed in section 5, and they can be taught.

**Tags on every figure:**
- **[V]** I read it in a primary source: SEC filing, company report, exchange filing, ratings agency, central bank or government data (FRED for US Treasury, Fed FX and World Bank series).
- **[Vd]** It comes from a market-data feed, not the exchange itself (Tiingo for KO prices, Twelve Data for NSE prices, Screener.in).
- **[D]** I calculated it from [V] inputs.
- **[U]** Secondary source only, not confirmed in a primary.

**Units:** KO in USD millions. DMart in ₹ crore (1 crore = 10 million).

## 1. The As-of date

**Filing dates:**
- **KO FY2018 10-K:** filed 21 Feb 2019 [V]. Q1 2019 10-Q filed 25 Apr 2019; Q2 10-Q filed 25 Jul 2019 [V]. Q2 results were released 23 Jul 2019; the stock went from $51.22 to $54.33 that day [Vd].
- **DMart FY2018-19 (year to 31 Mar 2019):**
  - Audited results approved by the board and filed 11 May 2019 [V]. That filing is results only, without the notes.
  - **Full Annual Report sent to BSE/NSE on 23 Jul 2019** (cover letter in the BSE PDF) [V]. This is the first date every note (leases, staff options, debt) is public.
  - AGM held 20 Aug 2019 [V]. Q1 FY20 results came out 13 Jul 2019 [U].

**Why 31 Jul 2019:**
- It is the first clean month-end after DMart's report was filed.
- It sits just before several later events that would otherwise leak:
  - 1 Aug: the US announced new tariffs on China and the US 10-year yield fell from 2.02% to 1.90% [V].
  - 7 Aug: India's central bank (RBI) cut its rate to 5.40% [V].
  - 20 Sep: India's corporate tax cut [V].
  - Feb 2020: DMart's share issue (QIP).
  - COVID.
- The US Fed made its first rate cut since 2008 on 31 Jul itself. The closing prices already include it, which gives the central-bank lesson a hook.
- Fallback date: any trading day from 24 to 31 Jul 2019.
- **Rule for the course:** use the latest annual report plus prices on the As-of date. Quarterly reports that were already out by 31 Jul are public, so using them is not a leak; the course can simply ignore them.

## 2. Inputs at the As-of date

### Coca-Cola
Source: FY2018 10-K, https://www.sec.gov/Archives/edgar/data/21344/000002134419000014/a2018123110-k.htm (page numbers are the 10-K's own).

| Input | Value |
|---|---|
| Revenue 2018 / 2017 / 2016 / 2015 / 2014 | 31,856 / 35,410 / 41,863 / 44,294 / 45,998 [V p.29] |
| Cost of goods sold 2018 | 11,770 [V p.71]; gross margin 63.1% [D] |
| SG&A / other operating charges | 10,307 / 1,079 [V p.71]. The 1,079 includes $450M of impairments at the old US bottling arm and $440M for a cost-cutting programme [V]. |
| Operating profit 2018 / 2017 / 2016 | 8,700 / 7,599 / 8,657 [V p.71]. Margins 27.3% / 21.5% / 20.7% [D] |
| Equity income (share of bottlers' profits; not in operating profit) | 1,008 [V p.71] |
| Effective tax rate | 19.4% (1,623 / 8,350) [V p.48]. Company guided about 19.5% for 2019 [V] |
| Depreciation and amortisation | 1,086 [V p.74] |
| Capital spending | 1,347; asset sales brought in 245 [V p.74] |
| Change in working capital | −1,202, a cash outflow ("net change in operating assets and liabilities") [V p.74] |
| Acquisitions / disposals 2018 | −1,040 / +1,362 [V] |
| Total debt | 43,555 [D] = short-term loans and notes 13,194 + current maturities 4,997 + long-term 25,364 [V p.73] |
| Cash and investments | 15,964 [D] = cash 8,926 + short-term investments 2,025 + marketable securities 5,013 [V p.73]. Net debt 27,591 [D] |
| Bottler stakes (equity-method investments) | 19,407 book [V p.73]. Listed stakes: fair value 18,680 vs carrying value 12,471 [V p.37] |
| Assets / liabilities held for sale (Africa bottler, CCBA) | 6,546 / 1,722 [V p.73] |
| Equity (total) | 19,058, of which non-controlling interests 2,077 [V p.73] |
| Leases | Before the new lease standard: minimum payments $500M in total, $144M in 2019 [V p.112]. Immaterial. |
| Shares outstanding | 4,275,340,031 on 15 Feb 2019 (10-K cover) [V]. **4,276,027,437 on 22 Jul 2019** (Q2 10-Q cover) [V] |
| Staff options | 133M outstanding, average exercise price $36.74, 4.6 years left; intrinsic value at year-end $1.41B [V p.113]. Intrinsic value at $52.63: about $2.1B [D] |
| Share price, 31 Jul 2019 | $52.63 close [Vd] |
| Market value | $225.0B [D]. Enterprise value about $252.6B before the bottler stakes [D] |
| Dividend | $1.56 per share in 2018 [V p.29] |
| Invested capital, book [D] | Equity + debt − cash = 46,649. Minus bottler stakes and other investments = 26,375. Also minus held-for-sale CCBA net (4,824) = 21,551. |
| Ratios [D] | Revenue to capital 1.2–1.5. After-tax return on capital 27–33%. Reinvestment (net capex 261 + working capital 1,202) = 21% of after-tax operating profit. |

### DMart
Source: Annual Report 2018-19, https://www.bseindia.com/bseplus/AnnualReport/540376/5403760319.pdf (pages are the report's own). Use the **consolidated** figures, which include the DMart Ready losses. Standalone figures shown where useful.

| Input | Value |
|---|---|
| Revenue FY19 | Consolidated 20,004.52 (FY18: 15,033.20, +33.1%) [V p.149]. Standalone 19,916.25 [V] |
| Standalone revenue FY15–FY19 | 6,434 / 8,575 / 11,881 / 15,009 / 19,916 [V p.8]. 4-year growth 32.6% a year [D] |
| Same-store growth (stores 24+ months old), FY15–FY19 | 22.4 / 21.5 / 21.2 / 14.2 / 17.8% [V p.8] |
| Stores | 89 / 110 / 131 / 155 / **176**; selling area 5.9M sq ft [V] |
| Cost of goods | 17,000.84 [D] = purchases 17,445.49 − inventory build 444.65 [V]. Gross margin 15.0% [D] |
| Staff costs / other expenses | 355.42 / 1,014.97 [V p.149] |
| Operating profit | 1,420.80 = 7.1% [D] (profit before tax 1,421.94 + finance cost 47.21 − other income 48.35). EBITDA 1,633 = 8.2% [D]. Standalone EBITDA 1,642 [V p.8] |
| Effective tax rate | 36.5% (519.48 / 1,421.94) [D]. Tax at applicable rates 513.34 [V, tax note]; India's pre-cut corporate rate was 34.94% [V] |
| Depreciation and amortisation | 212.49 [V] |
| Capital spending | 1,416.80, which is 6.7 times depreciation [V p.150-151; D]. Includes land, which never depreciates. |
| Change in working capital | −350.65 [V]. This includes a +51.65 change in short-term investments, so the operating figure is about −402 [D]. Inventory rose 445.20 [V] |
| Debt | 700.15 [D] = long-term 125.67 + short-term 304.15 (of which commercial paper 246.45) + current maturities 270.33 [V, notes 17/21/23]. Rates 8.1–10.4% |
| Cash | 235.60 [D] = cash 124.98 + other bank balances 94.09 + short-term investments 16.53 [V p.148] |
| Equity (total) | 5,588.01 [V p.148] |
| Invested capital, book [D] | 6,052.56. Revenue to capital 3.31; return on capital 23.5% before tax, 14.9% after. Reinvestment about 1,607, or **178% of after-tax operating profit** (versus KO's 21%). |
| Leases | Rent 75.71 (0.4% of revenue). Minimum payments 314.70 [V note 37; D]. New lease standard (Ind AS 116) applied from 1 Apr 2019 |
| Shares outstanding | 624,084,486 [V] |
| Staff options | 12,233,475 at ₹299 [V, option note]. Intrinsic value about ₹1,448 crore, 1.6% of market value [D] |
| Promoter (founding family) holding | **81.20%** on 31 Mar 2019 [V, shareholding annex] |
| Share price, 31 Jul 2019 | ₹1,482.70 NSE close [Vd] |
| Market value | ₹92,533 crore, about $13.4B [D]. Enterprise value ₹92,998 crore. EV/sales 4.65x, EV/operating profit 65x, price/earnings about 103x [D] |
| Store ownership | "predominantly on an ownership model (including long-term leases >30 yrs where building owned)… owned or long-term leased a majority of our 196 stores" (31 Dec 2019) [V, QIP placement document]. Management said it owns 85–90% [U, IDBI broker note Jul 2019] |
| Credit rating | CRISIL AA+/Stable long-term, CRISIL A1+ for commercial paper, reaffirmed 26 Apr 2019 [V]. CARE A1+ for commercial paper [V] |

## 3. Market readings, 31 Jul 2019

| Reading | Value |
|---|---|
| US 10-year Treasury | **2.02%** [V FRED DGS10]. 1.90% on 1 Aug |
| India 10-year bond (7.26% GS 2029) | **6.37%** [V-ish: STCI primary-dealer daily citing market close]. 6.88% on 1 Jul [V, DEA debt report]. July average 6.60% [V, OECD via FRED] |
| Rupees per dollar | **68.81** [V FRED DEXINUS]. CCIL spot 68.80 [V via STCI] |
| Inflation 2019 (CPI) | US 1.81%, India 3.73% [V, World Bank via FRED]. 2018: 2.44% / 3.94% |
| Policy rates | Fed cut on 31 Jul 2019 [V date]. RBI repo 5.75%, cut to 5.40% on 7 Aug [V-secondary] |
| US equity risk premium | Implied premium **5.67%** on 1 Jul 2019 (5.96% in Jan 2019) [V, the publisher's own blog]. Duff & Phelps recommended 5.5% with a normalised 3.5% risk-free rate [V, Kroll] |
| India country risk | Moody's Baa2. Default spread **2.15%** [V, July 2019 deck]. India total equity premium 8.17% [V, same deck], so country premium **≈2.50%** [D]. Jan 2019 values: 2.64% premium, 8.60% total [V, archived page]. Rupee risk-free rate 6.49% − 2.15% = 4.34% [V, deck, 1-Jul yield] |
| Credit ratings | KO: A+ (S&P), A1 (Moody's) [V 10-K p.62]. DMart: CRISIL AA+ [V] |

The risk premium figures come from Damodaran datasets. Per the owner's rule, learner-visible text must not name him: show them as "a published dataset", credited only in fine-print source lines.

## 4. What happened next (for the Reveal)

### Coca-Cola: revenue and operating profit [V, SEC filings]
2018 restated (CCBA moved back into continuing operations): revenue 34,300, operating profit 9,152 (26.7%).

| Year | Revenue | Op. margin [D] | Revenue change: volume / price-mix / currency / acquisitions [V] |
|---|---|---|---|
| 2019 | 37,266 | 27.1% | +1 / +5 / −4 / +7 (Costa) = +9% |
| 2020 | 33,014 | 27.3% | −7 / −2 / −2 / 0 = −11% (COVID) |
| 2021 | 38,655 | 26.7% | +9 / +6 / +1 / 0 = +17% |
| 2022 | 43,004 | 25.4% | +5 / +11 / −7 / +2 = +11% |
| 2023 | 45,754 | 24.7% | +2 / +10 / −4 / −1 = +6% |
| 2024 | 47,061 | 21.2% | +2 / +11 / −5 / −4 = +3% |
| 2025 | 47,941 | 28.7% | +1 / +4 / −2 / −1 = +2% |
| 9M 2026 | 39,232 (+8.6%) | 34.4% | — |

Revenue grew about 4.9% a year from the restated 2018 base [D].

**Events [V unless noted]:**
- Costa bought Jan 2019 for $4.9B. This is after the 10-K balance sheet but before the As-of date.
- **CCBA:** on 20 May 2019 KO decided to keep its African bottler, so it went back into continuing operations. The recast 2018 figures were filed in a Sep 2019 8-K [date inferred from the filename, U].
- 2024 margin hit by a $3.1B fairlife contingent-payment charge. BodyArmor brand write-downs of $760M (2024) and $960M (2025).
- IRS transfer-pricing case: the Tax Court ruled mostly for the IRS (Nov 2020). KO paid a $6.0B deposit (Sep 2024). Further possible exposure for 2010–2025 is about $14B as of Dec 2025.
- Strong dollar: currency took 4–7 points off revenue a year from 2022 to 2024.
- 2025 aluminium tariffs: [U].

**KO share price** [Vd]:
- Path: $52.63 → $55.35 (Dec 2019) → March 2020 low $36.27 (−38% from Jan) → $54.84 (2020) → $59.21 (2021) → $63.61 (2022) → $58.93 (2023) → $62.26 (2024) → $69.91 (2025) → **$98.09 (18 Nov 2026)**.
- Price +86%. **Total return with dividends +132%, about 12.2% a year** [D].

### DMart [Vd Screener unless tagged]

| FY (to March) | Revenue | Growth | EBITDA margin | Op. margin [D] | Profit after tax |
|---|---|---|---|---|---|
| FY20 | 24,870 | +24% | 8.6% | 7.1% | 1,301 |
| FY21 | 24,143 | −3% (COVID) | 7.2% | 5.5% | 1,099 |
| FY22 | 30,976 | +28% | 8.1% | 6.5% | 1,492 |
| FY23 | 42,840 | +38% | 8.5% | 7.0% | 2,378 |
| FY24 | 50,789 | +19% | 8.1% | 6.6% | 2,536 |
| FY25 | 59,358 [V ICRA] | +17% | 7.6% | 6.1% | 2,707 |
| FY26 | **68,821 [V]** | +16% | EBITDA 5,187 = 7.5% [V] | 6.0% | 2,970 [V] |
| H1 FY27 | 38,439 | — | ≈7.5% | — | — |

Revenue grew about 19.3% a year from FY19 to FY26 [D]; ICRA states 19% [V].

**Events:**
- **India's corporate tax cut, 20 Sep 2019:** 34.94% to 25.17% [V, PIB]. DMart's tax rate fell from 37% to 25% [Vd].
- Share issue (QIP) Feb 2020: 2 crore shares at ₹2,049, raising ₹4,098 crore [U]. Share capital went from 624 to 648 [Vd].
- COVID: Q1 FY21 EBITDA margin 2.9% [U].
- Stores: 176 → 196 (Dec 2019) [V] → **500 on 31 Mar 2026; 85 added in FY26** [V] → about 519 by Oct 2026 [U].
- Same-store growth slowed: 8.1% in Q4 FY25, 10.8% in Q4 FY26 [V].
- Rapid grocery delivery apps hurt sentiment from 2024 [U]. CEO change: Noronha to Anshul Asawa (named Jan 2025; MD & CEO by 2026) [V].
- DMart Ready cut back to 18 cities [V].
- CRISIL upgraded the rating to AAA (2024) [V].
- Promoter holding now about 74% [U].

**DMart share price** [Vd]:
- Path: ₹1,482.70 → ₹1,838 (Dec 2019) → ₹2,324 (Feb 2020) → March 2020 low ₹1,729 → ₹2,764 (2020) → **peak ₹5,900 (Oct 2021)** → ₹4,671 / 4,069 / 4,083 (Dec 2021 / 2022 / 2023) → ₹5,096 (Sep 2024), then ₹3,931 (Oct 2024) → ₹3,782 (Dec 2025) → **₹3,459 (18 Nov 2026)**.
- **+133% in rupees, about 12.3% a year.** In dollars only +70% (rupee 68.81 → 94.24), about 7.6% a year [D].
- **Reveal hook:** two very different stories, almost identical rupee/dollar returns; currency then splits them.

**Path of the world [V FRED]:**

| Year | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 YTD |
|---|---|---|---|---|---|---|---|---|
| Rupees per $ (avg) | 70.4 | 74.1 | 73.9 | 78.6 | 82.6 | 83.7 | 87.1 | 94.1 |
| US 10-yr (avg) | 2.14 | 0.89 | 1.45 | 2.95 | 3.96 | 4.21 | 4.29 | 4.55 |
| India 10-yr (avg) | — | 6.19 | 6.26 | 7.19 | 7.22 | 6.98 | 6.53 | — |
| US CPI | — | 1.2 | 4.7 | 8.0 | 4.1 | 2.9 | — | — |
| India CPI | — | 6.6 | 5.1 | 6.7 | 5.6 | 5.0 | 2.4 | — |

## 5. Teaching fit and traps

### Coca-Cola: good fit, keep
- **Fit on the four levers:** low growth, high margin (27–29%), low reinvestment (capex about 4% of revenue), low risk (A+). 64% of revenue is outside the US, which suits the currency lessons.
- **Traps:**
  1. Refranchising makes reported revenue fall (−8.8% a year 2014–18 [D]) and margin jump. Underlying 2018 growth was about +5% (volume 3 + price-mix 2); sales of bottling businesses took off 16% [V].
  2. **CCBA restatement.** The 10-K shows 2018 revenue of 31,856; later filings and many data sites show **34,300**. One example: Analyst Lens shows $34.30B as "the FY2018 10-K". Content authors must use the as-filed figure. This also works as a ready-made "updating on news" lesson.
  3. Bottler stakes ($19.4B) and equity income ($1.0B) sit outside operating profit, so value them separately (the share unit).
  4. One-off charges recur every year (2018: $1,079M).
  5. Costa ($4.9B, Jan 2019) is after the balance sheet. Acquisitions count as reinvestment.
  6. IRS dispute: known at the As-of date, lost later. A good bridge/contingent-liability lesson.
  7. Staff options: 133M.

### DMart: excellent fit, keep
- **Fit:** high growth (+33%), thin margin (7% operating), very heavy reinvestment (capex 6.7 times depreciation, owned stores), India country risk, about 100x earnings. Ideal for "what a multiple assumes".
- **Traps:**
  1. Standalone vs consolidated: DMart Ready lost ₹50.8 crore in FY19 [V].
  2. Land in capex never depreciates.
  3. Promoter 81.2% means a small free float; public-shareholding rules pushed later dilution [U].
  4. The ₹4,098 crore share issue changes the share count after the As-of date.
  5. Staff options at ₹299, deep in the money.
  6. Tax rate changes from 36.5% to 25% after the As-of date.
  7. The new lease standard from FY20 shifts EBITDA slightly.
  8. Related parties are small: promoter entities rent space from the company (₹0.99 crore), and DMart Ready was a promoter-linked associate before Feb 2018 [V].

**Alternatives: not needed.** Ruled out:
- Mature USD: PepsiCo (15% margin); P&G (June year-end, 10-K filed Aug 2019, clashes with the date); Colgate and McDonald's (negative or low book equity).
- Fast INR: Titan (gold-lease and hedging complexity); Trent (fast growth only after 2020); Jubilant FoodWorks (franchise, asset-light).
- **Optional:** Future Retail, same sector and same date, later collapsed (insolvency 2022) [U]. It could serve the survival or distressed lessons.

## Source links
**Coca-Cola**
- XBRL figures: https://data.sec.gov/api/xbrl/companyconcept/CIK0000021344/us-gaap/Revenues.json and .../OperatingIncomeLoss.json and .../dei/EntityCommonStockSharesOutstanding.json
- 10-Ks for FY2019–FY2025: sec.gov/Archives/edgar/data/21344/ under accessions 000002134420000006, 000002134421000008, 000002134422000009, 000002134423000011, 000002134424000009, 000002134425000011, 000162828026010047.
- CCBA press release: https://investors.coca-colacompany.com/news-events/press-releases/detail/6/coca-cola-updates-plans-for-coca-cola-beverages-africa-including-intent-to-retain-majority-stake-in-bottler
- Recast 8-K: https://www.sec.gov/Archives/edgar/data/21344/000002134419000039/a201909208-kexhibit991.htm

**DMart**
- Results 11 May 2019: https://nsearchives.nseindia.com/corporate/DMART_11052019161351_ASLOutcomeOfBoardMeeting11052019_057.pdf
- CRISIL Apr 2019: https://www.crisil.com/mnt/winshare/Ratings/RatingList/RatingDocs/Avenue_Supermarts_Limited_April_26_2019_RR.html
- QIP placement document: https://www.bseindia.com/corporates/download/11375/QIP%20Open/PPD_20200205181032.pdf
- FY26 press release: https://api.dmartindia.com/corporate/content/file/v1/2/R2aWBiIpiuD39xgfm4wrqQKc1777723315/Press%20release%20dated%202nd%20May,%202026.pdf
- Screener: https://www.screener.in/company/DMART/consolidated/

**Markets and macro**
- STCI daily note: https://www.stcipd.com/UserFiles/File/01-08-19.pdf
- DEA debt report: http://dea.gov.in/files/public_debt_management_documents/Quarterly_Report_on_Public_Debt_Management_for_the_Quarter_July_September_2019.pdf
- Mid-2019 country risk blog: https://aswathdamodaran.blogspot.com/2019/08/country-risk-mid-year-2019-update.html
- July 2019 India deck: https://pages.stern.nyu.edu/~adamodar/pdfiles/country/val2dayIndia2019.pdf
- Kroll: https://www.kroll.com/en/publications/valuation/us-normalized-risk-free-effective-september-30-2019
- PIB tax cut: https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1585641

## Working files and tool problems
- **Scraped full text:**
  - /tmp/valr/ko/ko10k2018.md
  - /tmp/valr/ko/fy19.md through /tmp/valr/ko/fy24.md
  - /tmp/valr/ko/ko10k2025.md
  - /tmp/valr/dmart/ar1819.md
- **Parallel:** hit its free-tier rate limit twice mid-run and later recovered. I used Tavily and Firecrawl in its place.
- **Octen:** gave irrelevant results for the risk-premium query.
