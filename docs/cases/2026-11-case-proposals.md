# Six proposed Cases (ticket #117, spec #68)

Date: 2026-11-16. Ticket #117 asks for six new Cases: two from India, two from Japan or Korea, and two from Europe or the US. This file holds all six, ranked.

**Method.** Facts come from primary sources: prospectuses and annual reports, regulators (SEBI, RBI, FSS/DART, SESC/FSA, SEC, CPSC, ESMA, BaFin), exchanges (BSE, NSE, KRX, JPX, Nasdaq, Deutsche Börse) and courts. News and price sites fill gaps only, and are named as such. Every fact has a URL. Each Story to judge holds only what was public on its As-of date (the as-of rule, ADR 0013). Everything later sits in the Known outcome. Each proposal names its Hindsight probe words: words that would give the outcome away if they showed up before the reveal.

**Ranking.** Each region keeps its own order (#1 before #2). The overall rank weighs three things: a published valuation to judge, a clear dated outcome, and how soon it can be built. INR and USD Cases can be built today. JPY, KRW and EUR Cases need the new currencies (#112), and their market parts (exchange, Price data, filings) need #113-#115.

None of the six is already a Case in `course/outline.yaml` or a Topic.

## Ranked summary

| Rank | Region | Case | Story kind | As-of | Outcome | Build readiness |
|---|---|---|---|---|---|---|
| 1 | Europe/US #1 | Peloton's IPO at $29 (September 2019) | The Price's claim, against an analyst's published value | 2019-09-25 | Listing day $25.76 (-11%); peak close $167.42 (Jan 2021); Tread+ recall, CEO change; 2024 low $2.88 | USD: build now (published value to reproduce) |
| 2 | India #1 | Paytm's IPO at Rs 2,150 (November 2021) | The Price's claim | 2021-11-07 | Listing day Rs 1,564.15 (-27%); Rs 528.20 by 31 Mar 2022; RBI orders on Paytm Payments Bank; FY24 close Rs 402.80 | INR: build now (illustration, `match_price`) |
| 3 | Japan/Korea #1 | Krafton's IPO at 498,000 won, priced off game makers' P/E (August 2021) | The analyst's claim (lead managers' peer P/E), then the Price's | 2021-08-01 | Debut -8.8%; 276,000 won (-45%) by Mar 2022; low 146,500 won (Oct 2023); still below offer in 2025 despite record profit | KRW: needs #112, market parts #113-#115 |
| 4 | India #2 | LIC's IPO at about 1.1 times embedded value (May 2022) | The seller's and the Price's claim (Price against embedded value) | 2022-05-03 | Listing day Rs 875.45 (-7.8%); Rs 534.70 (-44%) on 31 Mar 2023; FY24 high Rs 1,175 | INR now, but wants a "Price against a published value" view (roadmap) |
| 5 | Europe/US #2 | Wirecard and the €1.9 billion of cash (June 2020) | The company's claim, and the Price's | 2020-06-17 | €1.9bn of cash did not exist; -62% on 18 Jun 2020; insolvency 25 Jun; out of the DAX | EUR: needs #112, market parts #113-#115 |
| 6 | Japan/Korea #2 | Toshiba's profits before the accounting probe (April 2015) | The Price's claim, built on the company's own accounts | 2015-04-02 | Profit before tax cut by 224.8bn yen (39%); SESC penalty; Westinghouse Chapter 11; delisted Dec 2023 at 4,620 yen | JPY: needs #112, market parts #113-#115 |

Why this order: Peloton has a free published valuation the engine can try to reproduce and works in dollars today. Paytm works in rupees today and has the sharpest outcome. Krafton has a published, checkable peer-P/E valuation that a regulator questioned, but waits for the won. LIC works in rupees but its published value (embedded value) is not a DCF, so it wants a new view. Wirecard and Toshiba are strong lessons about false inputs, but neither has a published valuation and both wait for #112.

## Picks

The Owner delegated the picks. Taking the top-ranked proposal of each region: **India #1, Paytm's IPO at Rs 2,150**; **Japan/Korea #1, Krafton's IPO at 498,000 won**; **Europe/US #1, Peloton's IPO at $29**. Each becomes its own Case ticket; none is opened yet, and the Owner confirms the picks when opening them. Paytm (INR) and Peloton (USD) can be built now. Krafton (KRW) waits for #112 and the Korea market parts (#113-#115).

---

## Rank 1 (Europe/US #1): Peloton's IPO at $29 (September 2019)

**Story to judge (the Price's claim, against an analyst's).** The offer price of $29 claims that Peloton, a maker of exercise bikes with a monthly class subscription, is worth about $8.1 billion, almost nine times its revenue for the year to June 2019, while it is losing money. An analyst published a value of $19.35 a share eight days earlier. As known on 25 Sep 2019:
- The S-1/A of 10 Sep 2019 offers 40,000,000 Class A shares at an estimated $26.00 to $29.00 a share, on the Nasdaq as `PTON`. [S-1/A No. 1 (SEC EDGAR)](https://www.sec.gov/Archives/edgar/data/1639825/000119312519242158/d738839ds1a.htm)
- Fiscal year to 30 Jun 2019: revenue $915 million, up 110% from $435 million. The net loss widened to $245.7 million from $47.9 million. [CNBC, 27 Aug 2019](https://www.cnbc.com/2019/08/27/peloton-reveals-its-financials-for-the-first-time-in-filing-to-go-public.html), [Prospectus (424B4, SEC EDGAR)](https://www.sec.gov/Archives/edgar/data/1639825/000119312519255124/d738839d424b4.htm)
- 64,602,124 options to buy Class B shares were outstanding at 30 Jun 2019, at a weighted-average exercise price of $6.71. Cash was $162.1 million, or $1,358.1 million "as adjusted" for the offer. [Prospectus (424B4)](https://www.sec.gov/Archives/edgar/data/1639825/000119312519255124/d738839d424b4.htm)
- 25 Sep 2019, evening: the offer is priced at $29.00, the top of the range. Peloton raises about $1.16 billion. Reuters reports that this values Peloton at about $8.1 billion, almost double its last private round of $4.15 billion (PitchBook). [Peloton press release](https://investor.onepeloton.com/news-releases/news-release-details/peloton-announces-pricing-initial-public-offering), [Reuters](https://www.reuters.com/article/business/peloton-raises-12-billion-after-ipo-prices-at-top-of-range-idUSKBN1WA30O/), [CNBC](https://www.cnbc.com/2019/09/25/peloton-prices-ipo-at-29-per-share.html)
- 17 Sep 2019: the analyst's blog values the equity at $6.65 billion, with revenue just above $10 billion by year 10. After netting out the options, that is $19.35 a share. Counting the options, $29 a share values the equity at "$9.5-$10 billion", not the $8 billion that 277.76 million shares give. The analyst's limit buy is at $15. [Damodaran, "Insights on VC Pricing: Lessons from Uber, WeWork and Peloton!"](https://aswathdamodaran.blogspot.com/2019/09/insights-on-vc-pricing-lessons-from.html), [his spreadsheet, PelotonIPO2019.xlsx](http://www.stern.nyu.edu/~adamodar/pc/blog/PelotonIPO2019.xlsx)
- Worked from the above: 277.76 million shares x $29 = $8.06 billion, which is 8.8 times $915 million of revenue.

**As-of date:** 2019-09-25 (the offer is priced; trading starts the next day).

**Known outcome (dated, sourced):**
- 26 Sep 2019 (listing day): opens at $27, $2 below the offer price, and closes at $25.76, down 11.2%. [MarketWatch](https://www.marketwatch.com/story/peloton-stock-spins-in-reverse-during-trading-debut-as-ipo-market-cools-down-2019-09-26), [CNBC](https://www.cnbc.com/2019/09/26/peloton-pton-ipo-stock-starts-trading-at-27-per-share.html)
- 2020: the lowest close of the year is $19.51, so the Price stays above the analyst's $15 limit buy. The year closes at $151.72. [Macrotrends, PTON price history](https://www.macrotrends.net/stocks/charts/PTON/peloton-interactive/stock-price-history)
- 13 Jan 2021: the all-time high close, $167.42, almost six times the offer price. [Macrotrends](https://www.macrotrends.net/stocks/charts/PTON/peloton-interactive/stock-price-history)
- 5 May 2021: Peloton and the US Consumer Product Safety Commission recall about 125,000 Tread+ treadmills after one child died and more than 70 incidents. [CPSC recall](https://www.cpsc.gov/Recalls/2021/Peloton-Recalls-Tread-Plus-Treadmills-After-One-Child-Died-and-More-than-70-Incidents-Reported), [CPSC news release](https://www.cpsc.gov/Newsroom/News-Releases/2021/CPSC-and-Peloton-Announce-Recall-of-Tread-Plus-Treadmills-After-One-Child-Death-and-70-Incidents-Recall-of-Tread-Treadmills-Due-to-Risk-of-Injury)
- 8 Feb 2022: Peloton announces a cost programme of at least $800 million a year. Co-founder John Foley steps down as CEO; Barry McCarthy (ex-CFO of Netflix and Spotify) replaces him; about 2,800 jobs go. [Peloton press release](https://investor.onepeloton.com/news-releases/news-release-details/peloton-announces-comprehensive-program-reduce-costs-and-drive), [Reuters](https://www.reuters.com/business/retail-consumer/peloton-names-former-netflix-exec-mccarthy-new-ceo-after-foley-exits-wsj-2022-02-08/)
- Fiscal 2022 (to 30 Jun 2022): Connected Fitness Subscriptions grow to 2,965,677, but monthly churn rises from 0.61% to 0.96%. [10-K FY2022 (SEC EDGAR)](https://www.sec.gov/Archives/edgar/data/1639825/000163982522000117/pton-20220630.htm), [Q4 FY2022 shareholder letter (SEC EDGAR)](https://www.sec.gov/Archives/edgar/data/1639825/000163982522000100/a4q2022shareholderletter.htm)
- Closes: $7.94 at the end of 2022 (down 78% in the year), and a low of $2.88 in 2024, 90% below the offer price. [Macrotrends](https://www.macrotrends.net/stocks/charts/PTON/peloton-interactive/stock-price-history)

**Sources (primary first):**
- https://www.sec.gov/Archives/edgar/data/1639825/000119312519242158/d738839ds1a.htm (S-1/A No. 1, 10 Sep 2019)
- https://www.sec.gov/Archives/edgar/data/1639825/000119312519255124/d738839d424b4.htm (Prospectus, 424B4)
- https://investor.onepeloton.com/news-releases/news-release-details/peloton-announces-pricing-initial-public-offering
- https://investor.onepeloton.com/news-releases/news-release-details/peloton-announces-comprehensive-program-reduce-costs-and-drive
- https://www.sec.gov/Archives/edgar/data/1639825/000163982522000117/pton-20220630.htm (10-K FY2022)
- https://www.cpsc.gov/Recalls/2021/Peloton-Recalls-Tread-Plus-Treadmills-After-One-Child-Died-and-More-than-70-Incidents-Reported
- https://aswathdamodaran.blogspot.com/2019/09/insights-on-vc-pricing-lessons-from.html and http://www.stern.nyu.edu/~adamodar/pc/blog/PelotonIPO2019.xlsx (the published valuation)
- Prices: Macrotrends (above). News: Reuters, CNBC, MarketWatch (above)

**Why a beginner cares.** Many people know the bike, and some own one. The Price first fell below the analyst's value, then rose to almost six times the offer price, then fell 98% from its peak. A beginner sees that the Price can be "proved right" for a year and still be wrong, and that a value per share must count the options.

**Build notes:**
- Published valuation: **yes**, free to cite: the analyst's $19.35 a share and the spreadsheet (both in Sources). Build it like `s12-wework-iwg`: the engine is checked against the published value, and the block says `reproduces` only if the engine lands within `REPRODUCE_TOLERANCE`.
- Inputs from the spreadsheet and the 424B4: base revenue $915.0 million (FY2019), revenue just above $10 billion by year 10, 277.76 million shares, 64.6 million options at $6.71 (valued as options, as the published valuation does), cash $1,358.1 million as adjusted.
- Currency `USD` (works today), unit `millions`, `per: share`, price `{value: 29, date: 2019-09-25, note: "offer price"}`.
- Case Data: Nasdaq symbol `PTON`. Daily closes from Nasdaq or Peloton's historic price lookup (https://investor.onepeloton.com/stock-information/historic-price-lookup).
- Hindsight probe words (ADR 0013): "listing day", "25.76", "pandemic", "lockdown", "167", "Tread+", "recall", "McCarthy", "2,800".
- Host Topics: `jud-ipo-forecast`, `val-young` (a young, loss-making firm), `spine-09-to-one-share` (the options overhang), `spine-12-price-or-value`, `mkt-ipo-float`.

---

## Rank 2 (India #1): Paytm's IPO at Rs 2,150 (November 2021)

**Story to judge (the Price's claim).** The Price of Rs 2,080 to Rs 2,150 a share claims that One 97 Communications (Paytm) is worth about Rs 1.39 lakh crore at the top of the band, about 50 times its revenue for the year to March 2021, while it is still losing money. As known on 7 Nov 2021:
- The red herring prospectus is dated 26 Oct 2021. The offer runs from 8 to 10 Nov 2021: a fresh issue of Rs 8,300 crore plus an offer for sale of Rs 10,000 crore, Rs 18,300 crore in all. It is the largest Indian IPO since Coal India in 2010. [Paytm RHP](https://paytm.com/document/ir/ipo-documents/paytm-red-herring-prospectus.pdf), [The Hindu, price band](https://www.thehindu.com/business/markets/paytm-ipo-price-band-set-at-rs-2080-2150-subscription-to-open-on-nov-8/article37207792.ece)
- Consolidated revenue from operations was Rs 2,802.41 crore in FY2020-21, down from Rs 3,280.84 crore in FY2019-20. The consolidated loss narrowed from Rs 2,942.36 crore to Rs 1,701.01 crore. [Annual report 2020-21](https://paytm.com/document/ir/annual-reports/annual-report-2020-21.pdf)
- At Rs 2,150 the market value is about Rs 1,39,379 crore. That is about 64.8 crore shares after the offer: the 8,51,16,278 shares offered are 13.13% of the post-offer share capital. The RHP gives the same capital structure; the Prospectus, dated after the As-of date, is used only to check the numbers. [Paytm RHP](https://paytm.com/document/ir/ipo-documents/paytm-red-herring-prospectus.pdf), [Prospectus (NSE)](https://nsearchives.nseindia.com/corporate/FP_INE982J01020_16NOV2021.pdf), [The Hindu, "Rs 1.39 lakh crore"](https://www.thehindu.com/business/markets/paytm-ipo-offer-price-fixed-at-2150-apiece/article37451410.ece)
- Ant Group, the top investor, sells shares worth Rs 4,704 crore in the offer. [Reuters, 27 Oct 2021](https://www.reuters.com/world/india/ant-group-backed-paytm-revises-ipo-target-244-bln-2021-10-27/)

**As-of date:** 2021-11-07 (the day before bidding opened).

**Known outcome (dated, sourced):**
- 12 Nov 2021: the offer is priced at the top of the band, Rs 2,150. [Reuters](https://www.reuters.com/technology/indias-paytm-prices-stock-top-range-25-bln-ipo-2021-11-12), [Prospectus 11 Nov 2021](https://nsearchives.nseindia.com/corporate/FP_INE982J01020_16NOV2021.pdf)
- Subscribed 1.95 times overall. [JP Morgan track record (book running lead manager, SEBI format)](https://indiaipo.jpmorgan.com/content/dam/jpm/india-private-limited/documents/one97-communications-ltd-aug-2023.pdf)
- 18 Nov 2021 (listing day): opens at Rs 1,955 on the BSE and Rs 1,950 on the NSE. Closes at Rs 1,564.15 on the BSE, 27.25% below the issue price. [The Hindu](https://www.thehindu.com/business/markets/paytm-shares-make-weak-debut-tumble-over-27-during-day-trade/article37558672.ece), [JP Morgan track record](https://indiaipo.jpmorgan.com/content/dam/jpm/india-private-limited/documents/one97-communications-ltd-aug-2023.pdf)
- 18 Nov 2021: Macquarie starts coverage at "underperform" with a target of Rs 1,200. [VCCircle](https://www.vccircle.com/macquarie-initiates-underperform-rating-on-paytm-cuts-target-price-by-40)
- BSE closes: Rs 1,321.90 on the 30th calendar day after listing, Rs 851.70 on the 90th day (Feb 2022), Rs 528.20 on 31 Mar 2022 (down 75%) and Rs 637.00 on 31 Mar 2023. [JP Morgan track record](https://indiaipo.jpmorgan.com/content/dam/jpm/india-private-limited/documents/one97-communications-ltd-aug-2023.pdf)
- 11 Mar 2022: the RBI tells Paytm Payments Bank to stop taking on new customers (Section 35A, Banking Regulation Act). [RBI press release, 31 Jan 2024 (cites the 11 Mar 2022 order)](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=57224), [RBI, 11 Mar 2022](https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=53405)
- 31 Jan 2024: the RBI cites "persistent non-compliances and continued material supervisory concerns". No deposits, credits or top-ups after 29 Feb 2024 to accounts, wallets or FASTags. The nodal accounts of One 97 Communications are to be ended. [RBI press release 2023-2024/1774](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=57224)
- 1 Feb 2024: the shares fall 20%, their lower circuit, to Rs 608.80 on the BSE. The market value drops to about Rs 38,664 crore. [The Hindu (PTI)](https://www.thehindu.com/business/markets/paytm-shares-slump-20-hit-lower-circuit-limit/article67799410.ece)
- 16 Feb 2024: the RBI moves the deadline to 15 Mar 2024. [RBI press release, 16 Feb 2024](https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=57345)
- FY2023-24 (to 31 Mar 2024): the BSE closing price ranges from a high of Rs 987.40 to a low of Rs 325.30. It closes the year at Rs 402.80, 81% below the issue price. Revenue from operations is Rs 9,978 crore and the loss Rs 1,422 crore. [Lead manager track record (FY24 update)](https://d3cobg6h0snvt3.cloudfront.net/worldwide/india/documents/track-record/one97-communications.pdf)

**Sources (primary first):**
- https://paytm.com/document/ir/ipo-documents/paytm-red-herring-prospectus.pdf (RHP, 26 Oct 2021)
- https://nsearchives.nseindia.com/corporate/FP_INE982J01020_16NOV2021.pdf (Prospectus, 11 Nov 2021, NSE)
- https://paytm.com/document/ir/annual-reports/annual-report-2020-21.pdf
- https://indiaipo.jpmorgan.com/content/dam/jpm/india-private-limited/documents/one97-communications-ltd-aug-2023.pdf
- https://d3cobg6h0snvt3.cloudfront.net/worldwide/india/documents/track-record/one97-communications.pdf
- https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=57224
- https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=53405
- https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=57345
- News: The Hindu (above), Reuters (above), VCCircle (above)

**Why a beginner cares.** Many beginners have the Paytm app on their phone. A brand you use every day can still be a bad buy at the IPO Price. Here a famous name paid 50 times revenue and lost three quarters of its Price in four months.

**Build notes:**
- Published valuation: none that a paid product can use. Macquarie's Rs 1,200 target is only reported in the news; the report itself is paid broker research. So build it as an **illustration** (`illustration: true`), and judge the Price's claim with `match_price` ("what the Price assumed"), as in Spine 13.
- Inputs: base revenue Rs 2,802.41 crore (FY21), or the TTM to Jun 2021 from the RHP's restated accounts. The losses carried, cash and debt are in the RHP restated balance sheet (as at 30 Jun 2021); add the Rs 8,300 crore fresh issue to cash. Shares are about 64.8 crore after the offer. Options: the ESOP pool, from the RHP capital structure.
- Currency `INR` (works today), unit `crores`, `per: share`, price `{value: 2150, date: 2021-11-12, note: "offer price"}`.
- Case Data: NSE symbol `PAYTM` (ISIN INE982J01020). Daily closes come from the NSE historical data or BSE price pages. The lead-manager track records give checked closes on dated days.
- Hindsight probe words (ADR 0013): "listing day", "1,564", "lower circuit", "Section 35A", "Payments Bank", "Macquarie", "underperform", "608".
- Host Topics: `jud-ipo-forecast` (judging an IPO forecast), `mkt-ipo-float`, `val-young` (a young, loss-making firm), `spine-13-price-assumes`. `bank-regulation` could take the 2024 RBI action as a second Moment.

---

## Rank 3 (Japan/Korea #1): Krafton's IPO at 498,000 won, priced off game makers' P/E (August 2021)

**Story to judge (the analyst's claim, then the Price's).** The lead managers put a value of 579,153 won a share on Krafton, the Korean maker of PlayerUnknown's Battlegrounds (PUBG). They took the average P/E of four listed Korean game makers (43.8 times) and applied it to Krafton's earnings. The offer price of 498,000 won is 14.0% below that value. At that Price the market value is about 24,351 billion won (24.4 trillion), 43.8 times 2020 profit and 14.6 times 2020 revenue. As known on 1 Aug 2021:
- 16 Jun 2021: Krafton files its registration statement. The band is 458,000 to 557,000 won for 10,060,230 shares, up to 5.6 trillion won, the largest Korean IPO ever. [Krafton press release, 16 Jun 2021](https://www.krafton.com/news/press/%ED%81%AC%EB%9E%98%ED%94%84%ED%86%A4-%EC%A6%9D%EA%B6%8C%EC%8B%A0%EA%B3%A0%EC%84%9C-%EC%A0%9C%EC%B6%9C%EB%A1%9C-7%EC%9B%94-%EC%83%81%EC%9E%A5-%EB%B3%B8%EA%B2%A9%ED%99%94), [DART filing list](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20210729000415)
- That first valuation used the average P/E (45.2 times) of seven "comparable" firms, including Walt Disney and Warner Music Group. 25 Jun 2021: the Financial Supervisory Service orders Krafton to correct the statement. [Korea Herald, 27 Jun 2021](https://www.koreaherald.com/article/2641647)
- 1 Jul 2021: the corrected statement on DART cuts the band to 400,000 to 498,000 won and the offer to 8,654,230 shares. The peers are now NCSoft, Netmarble, Kakao Games and Pearl Abyss. [Korea Herald, 1 Jul 2021](https://www.koreaherald.com/article/2644424), [Reuters, 1 Jul 2021](https://www.reuters.com/technology/game-developer-krafton-lowers-ipo-target-2021-07-01/)
- The final prospectus (29 Jul 2021) shows the sum. Applied profit is 666,170 million won: the average of the 2020 profit (556,267 million) and the first quarter of 2021 times four (776,073 million). 666,170 million x 43.8 is about 29,178 billion won; with the P/E unrounded (about 43.78) the prospectus gives a value of 29,166,229 million won. Divided by 50,360,185 shares (48,898,070 after the offer plus 1,462,115 options), that is 579,153 won a share. The band sits 30.9% to 14.0% below it. [Final prospectus (Mirae Asset)](https://securities.miraeasset.com/bbs/download/2086524.pdf?attachmentId=2086524), [same on DART](https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20210729000438)
- 2020: revenue 1,670,428 million won, operating profit 773,871 million won. Battlegrounds is 96.5% of revenue, and one publisher ("A") pays 68.1% of it. [Final prospectus](https://securities.miraeasset.com/bbs/download/2086524.pdf?attachmentId=2086524)
- 29 Jul 2021: priced at the top of the band, 498,000 won, raising 4,309,807 million won. Institutions bid 243 times the shares on offer, the weakest demand of any 2021 listing. Retail bidding runs on 2 and 3 Aug; listing is on 10 Aug. [Final prospectus](https://securities.miraeasset.com/bbs/download/2086524.pdf?attachmentId=2086524), [KED Global, 29 Jul 2021](http://www.kedglobal.com/ipos/newsView/ked202107290015), [Reuters, 29 Jul 2021](https://www.reuters.com/technology/skoreas-krafton-ipo-prices-top-range-raise-375-bln-2021-07-29)
- Worked from the prospectus: 48,898,070 shares x 498,000 won = 24,351 billion won. That is 43.8 times the 2020 profit of 556.3 billion and 14.6 times the 2020 revenue of 1,670.4 billion.

**As-of date:** 2021-08-01 (the day before retail bidding opened).

**Known outcome (dated, sourced):**
- 10 Aug 2021 (listing day): opens 9.9% below the offer price, the weakest Korean debut since 2004. Closes 8.8% below, at about 454,000 won. [Reuters, 10 Aug 2021](https://www.reuters.com/technology/skoreas-krafton-maker-hit-game-pubg-tumbles-debut-2021-08-10)
- 17 Nov 2021: peaks at 580,000 won. [Korea Herald, 12 Oct 2022](https://www.koreaherald.com/article/2977306)
- 10 Feb 2022: 2021 revenue is 1,886.3 billion won (up 13%), but operating profit falls to 639.6 billion won. [Krafton press release, 10 Feb 2022](https://krafton.com/news/press/%ED%81%AC%EB%9E%98%ED%94%84%ED%86%A4-2021%EB%85%84-%EC%97%AD%EB%8C%80-%EC%B5%9C%EB%8C%80-%EC%8B%A4%EC%A0%81-1%EC%A1%B0-8863%EC%96%B5-%EC%9B%90-%EB%8B%AC%EC%84%B1)
- 21 Mar 2022: closes at 276,000 won, 45% below the offer price, the worst of 17 large Korean IPOs of the year before. [KED Global, 22 Mar 2022](http://www.kedglobal.com/korean-stock-market/newsView/ked202203220001), [Korea Times, 21 Mar 2022](https://www.koreatimes.co.kr/business/tech-science/20220321/krafton-founder-slammed-for-plunging-share-price)
- 12 Oct 2022: closes at 180,500 won. Employees who bought 351,525 shares at 498,000 won are down by more than half. [Korea Herald, 12 Oct 2022](https://www.koreaherald.com/article/2977306)
- Oct 2023: the low, 146,500 won. [KFE News, 12 May 2025](https://www.kfenews.co.kr/news/articleView.html?idxno=636348)
- 11 Feb 2025: 2024 revenue is 2,709.8 billion won and operating profit 1,182.5 billion won, both records. Profit is half as large again as in 2020. [Krafton press release](https://www.krafton.com/en/news/press/krafton-records-all-time-highs-in-sales-2-7098t-krw-and-operating-profit-1-1825t-krw-in-2024), [FY2024 earnings release](https://www.krafton.com/wp-content/uploads/2025/02/KRAFTON-4Q24-Earnings-Release_vF_ENG.pdf)
- The Price still has not come back: 338,000 won on 29 Jul 2025, and still well below 498,000 won on 30 Oct 2025. [Mirae Asset research, 30 Jul 2025](https://securities.miraeasset.com/bbs/download/2137621.pdf?attachmentId=2137621), [Newsis, 23 Feb 2025](https://www.newsis.com/view/NISX20250221_0003074658), [Business Post, 30 Oct 2025](https://www.businesspost.co.kr/BP?command=article_view&num=417803)

**Sources (primary first):**
- https://securities.miraeasset.com/bbs/download/2086524.pdf?attachmentId=2086524 (final prospectus, 29 Jul 2021)
- https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20210729000415 (registration statement and its corrections, DART)
- https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20210729000438 (prospectus, DART)
- https://www.krafton.com/news/press/%ED%81%AC%EB%9E%98%ED%94%84%ED%86%A4-%EC%A6%9D%EA%B6%8C%EC%8B%A0%EA%B3%A0%EC%84%9C-%EC%A0%9C%EC%B6%9C%EB%A1%9C-7%EC%9B%94-%EC%83%81%EC%9E%A5-%EB%B3%B8%EA%B2%A9%ED%99%94 (Krafton, 16 Jun 2021)
- https://krafton.com/news/press/%ED%81%AC%EB%9E%98%ED%94%84%ED%86%A4-2021%EB%85%84-%EC%97%AD%EB%8C%80-%EC%B5%9C%EB%8C%80-%EC%8B%A4%EC%A0%81-1%EC%A1%B0-8863%EC%96%B5-%EC%9B%90-%EB%8B%AC%EC%84%B1 (Krafton 2021 results)
- https://www.krafton.com/en/news/press/krafton-records-all-time-highs-in-sales-2-7098t-krw-and-operating-profit-1-1825t-krw-in-2024 (Krafton 2024 results)
- https://www.krafton.com/wp-content/uploads/2022/06/%ED%81%AC%EB%9E%98%ED%94%84%ED%86%A4%EB%B6%84%EA%B8%B0%EB%B3%B4%EA%B3%A0%EC%84%9C2022.05.16.pdf (quarterly report, Q1 2022: 48,967,045 shares at end-2021)
- News: Reuters, Korea Herald, Korea Times, KED Global, KFE News, Newsis, Business Post (above). Broker research: Mirae Asset (above; a price quote only).

**Why a beginner cares.** Many beginners have played PUBG, or BGMI, Krafton's version for India. A famous game is not a reason to pay any Price. Here the bankers chose which firms to compare against, the regulator pushed back, and the Price still lost more than half. Profits later grew by half, yet four years on the Price was still below the offer. A good company bought at too high a Price can still be a bad buy.

**Build notes:**
- Published valuation: **yes**, the lead managers' P/E valuation in the prospectus (579,153 won a share). It is a multiple, not a DCF, so the engine (ADR 0010) cannot reproduce it: do not set `reproduces`. Judge it with Value levers `match_price` ("what the Price assumed"), or better with the `multiple_decoder` Workbench: which peers, which P/E, which profit. Two peer sets (with and without Disney) make a natural `two_stories` pair.
- Inputs: base revenue 1,670.4 billion won (2020); operating margin 46.3% (773.9 / 1,670.4). Cash, debt and the tax rate come from the 2020 consolidated audit report (filed on DART with the statement). Add the new-share money (5,624,000 x 498,000 won = 2,800.8 billion) to cash. Shares 48,898,070, options 1,462,115.
- Currency `KRW` (needs #112), unit `billions` (won), `per: share`, price `{value: 498000, date: 2021-07-29, note: "offer price"}`. Market parts for Korea (KRX Price data, DART filings) need #113-#115.
- Case Data: KRX code 259960 (KOSPI). Daily closes from KRX market data (data.krx.co.kr) or the KIND listing pages.
- Hindsight probe words (ADR 0013): "debut", "454,000", "580,000", "276,000", "180,500", "146,500", "1,182.5", "record".
- Host Topics: `val-multiples` (the peer choice), `mkt-ipo-float`, `jud-ipo-forecast`, `spine-12-price-or-value`.

---

## Rank 4 (India #2): LIC's IPO at about 1.1 times embedded value (May 2022)

**Story to judge (the seller's and the Price's claim).** The Government of India, the only shareholder, is selling 3.5% of Life Insurance Corporation of India at Rs 902 to Rs 949 a share. The Price claims LIC is worth Rs 5.71 to 6.00 lakh crore, about 1.06 to 1.11 times the embedded value of Rs 5,39,686 crore that an independent actuary put on it at 30 Sep 2021. As known on 3 May 2022:
- The RHP is dated 26 Apr 2022. It is an offer for sale of 22,13,74,920 shares by the President of India (Ministry of Finance), so no new money goes to LIC. 632,49,97,701 shares are outstanding before and after the offer. The price band is Rs 902 to Rs 949. [LIC RHP (SEBI)](https://www.sebi.gov.in/sebi_data/attachdocs/apr-2022/1651036586707.PDF), [same RHP (BSE)](https://www.bseindia.com/downloads/ipo/RHP_260420222354.pdf)
- Indian Embedded Value (consolidated): Rs 53,96,860 million (Rs 5,39,686 crore) at 30 Sep 2021, against Rs 9,56,050 million (Rs 95,605 crore) at 31 Mar 2021. The source is the Independent Actuary's reports dated 10 Feb 2022, summarised in the RHP. [LIC RHP](https://www.sebi.gov.in/sebi_data/attachdocs/apr-2022/1651036586707.PDF)
- The price-to-earnings ratio on FY2021 diluted EPS is 201.91 at the top of the band (RHP, basis for offer price). [LIC RHP](https://www.sebi.gov.in/sebi_data/attachdocs/apr-2022/1651036586707.PDF)
- The Government cut the stake on sale from 5% to 3.5% "considering the current (volatile) environment". Policyholders get Rs 60 off a share; retail investors and employees get Rs 45 off. Bidding runs from 4 to 9 May 2022. [The Hindu, 27 Apr 2022](https://www.thehindu.com/business/lic-ipo-to-open-on-may-4-in-price-band-of-902-949/article65360898.ece), [Reuters, 26 Apr 2022](https://www.reuters.com/world/india/india-sets-lic-ipo-price-band-between-902-949-rupees-2022-04-26/)
- Worked from the RHP: 632.50 crore shares x Rs 949 = Rs 6,00,242 crore, which is 1.11 times Rs 5,39,686 crore. At Rs 902 it is Rs 5,70,515 crore, or 1.06 times.

**As-of date:** 2022-05-03 (the day after the anchor book, before public bidding opened).

**Known outcome (dated, sourced):**
- 12 May 2022: the offer is priced at Rs 949 (Rs 904 for retail and employees, Rs 889 for policyholders). It raises Rs 20,557 crore and is 2.44 times subscribed (excluding anchors). [LIC Prospectus (SEBI)](https://www.sebi.gov.in/sebi_data/attachdocs/may-2022/1652369344669.pdf), [AIBI track record (SEBI format)](https://aibi.org.in/TRackrecords/P000015987.pdf)
- 17 May 2022 (listing day): opens at Rs 867.20 on the BSE, below the price paid even by policyholders. Closes at Rs 875.45 on the BSE, 7.8% below the issue price. [The Hindu](https://www.thehindu.com/business/markets/lic-opens-at-862-discount-at-86720-per-share-on-bse/article65421816.ece), [AIBI track record](https://aibi.org.in/TRackrecords/P000015987.pdf)
- BSE closes: Rs 669.20 on 16 Jun 2022 (30th calendar day), Rs 682.20 on 12 Aug 2022 (90th day) and Rs 534.70 on 31 Mar 2023 (down 44%). [AIBI track record](https://aibi.org.in/TRackrecords/P000015987.pdf)
- 15 Jul 2022: LIC reports an embedded value of Rs 5,41,492 crore at 31 Mar 2022. [LIC filing to BSE/NSE, 14 Jul 2022](https://web.licindia.in/documents/d/guest/press_release-1-), [LIC IEV presentation](https://originlic.licindia.in/documents/20121/0/Investor-presentation-final-10-30-PM+%282%29.pdf/83875c26-3fae-7e0c-303d-a890b40ab362?t=1667797271296)
- FY2023-24: the BSE closing high is Rs 1,175.00, and the year closes at Rs 914.60 on 31 Mar 2024. FY2024-25 closes at Rs 799.40. Profit after tax is Rs 35,997 crore (FY23), Rs 40,916 crore (FY24) and Rs 48,320 crore (FY25). [AIBI track record (updated to 15 Nov 2025)](https://aibi.org.in/TRackrecords/P000015987.pdf)

**Sources (primary first):**
- https://www.sebi.gov.in/sebi_data/attachdocs/apr-2022/1651036586707.PDF (RHP, 26 Apr 2022)
- https://www.bseindia.com/downloads/ipo/RHP_260420222354.pdf (same RHP, BSE)
- https://www.sebi.gov.in/sebi_data/attachdocs/may-2022/1652369344669.pdf (Prospectus, 12 May 2022)
- https://aibi.org.in/TRackrecords/P000015987.pdf (track record, SEBI format)
- https://web.licindia.in/documents/d/guest/press_release-1- (LIC exchange filing on IEV)
- https://originlic.licindia.in/documents/20121/0/Investor-presentation-final-10-30-PM+%282%29.pdf/83875c26-3fae-7e0c-303d-a890b40ab362?t=1667797271296
- News: The Hindu, Reuters (above)

**Why a beginner cares.** Most Indian families know LIC, and many own its policies. The issue gave policyholders a discount. A Price "close to what the experts say it is worth" still lost 44% in ten months, because an insurer's value rests on actuarial assumptions a beginner cannot see.

**Build notes:**
- Published valuation: **yes**, the Indian Embedded Value (Rs 5,39,686 crore at 30 Sep 2021). The Independent Actuary's reports are summarised in the RHP ("Embedded Value Reports", definitions and the summary financial table). But an embedded value is an actuarial value of in-force policies plus net worth, not a free-cash-flow DCF. The engine (ADR 0010, maths never changes) cannot reproduce it, so do not set `reproduces`.
- Two ways to build it: (a) an **illustration** with `per: company`, showing the Price against the published value (Price / IEV = 1.11) with no Lever maths; or (b) a `val-banks`-style equity Case. Either may need a "Price against a published value" view that no Value levers mode has today. That is a roadmap item, not part of this ticket.
- Currency `INR` (works today), unit `crores`, price `{value: 949, date: 2022-05-12, note: "offer price"}`, shares 632.50 crore.
- Case Data: BSE scrip 543526, NSE symbol `LICI` (from LIC's exchange filing). Daily closes come from the BSE or NSE historical data. The AIBI track record gives checked closes on dated days.
- Hindsight probe words (ADR 0013): "listed at", "875", "867", "discount on debut", "5,41,492", "534".
- Host Topics: `val-banks` (valuing financial firms), `ins-risk-transfer`, `mkt-ipo-float` (a 3.5% float), `spine-12-price-or-value`.

---

## Rank 5 (Europe/US #2): Wirecard and the €1.9 billion of cash (June 2020)

**Story to judge (the company's claim, and the Price's).** Wirecard, a German payments company in the DAX 30, says it is growing fast and that €1.9 billion of its cash sits in trust accounts. The Price of €104.50 claims the company is worth about €12.9 billion, about 16 times its preliminary 2019 EBITDA. Newspaper reports have questioned its accounts for over a year, and a special audit could not confirm part of its revenue. As known on 17 Jun 2020:
- 14 Feb 2020 (preliminary 2019 results): revenue about €2.8 billion, up 38%. EBITDA up about 40% to €785 million. The audited accounts are due on 8 Apr 2020. [Wirecard, preliminary results 2019 (PR Newswire)](https://www.prnewswire.co.uk/news-releases/wirecard-ag-preliminary-results-2019-859745302.html), [same release in German (OTS)](https://www.ots.at/presseaussendung/OTS_20200214_OTS0003/wirecard-ag-vorlaeufiges-ergebnis-2019)
- 6 Nov 2019: the Management Board forecasts 2020 EBITDA of €1.0 to €1.12 billion. [Wirecard ad hoc, forecast 2020](https://wirecard.com/wp-content/uploads/2021/01/2019_11_06_Guidance-2020.pdf)
- Jan to Feb 2019: the Financial Times reports possible fictitious and backdated contracts in Singapore. BaFin, the German regulator, investigates the short sellers and on 18 Feb 2019 bans new short positions in Wirecard for two months. Mar to Oct 2019: the FT reports that half of revenue and almost all profit come from three opaque "third-party acquiring" partners. [ESMA peer review of BaFin and FREP, timeline section 4.2.4 and section 4.2.5](https://www.esma.europa.eu/sites/default/files/library/esma42-111-5349_fast_track_peer_review_report_-_wirecard.pdf)
- 27 Apr 2020: KPMG's special investigation cannot say whether the third-party acquiring revenue for 2016 to 2018 existed. Documents were "almost exclusively in electronic form, making their authenticity impossible to verify." The shares fall 26%. On 3 May Wirecard publishes its own summary, saying that revenue was "verified". [KPMG report (convenience translation)](https://cdn.gmtresearch.com/public-ckfinder/hall-of-shame/Wirecard%20AG/KPMG_Special%20Investigation%20Report_Apr27-2020.pdf), [Reuters, 28 Apr 2020](https://www.reuters.com/article/technology/wirecard-shares-crash-26-after-critical-kpmg-audit-idUSKCN22A0R4), [Wirecard, "Key aspects of the KPMG report"](https://www.wirecard.com/uploads/statement_2020_05_03_EN_KPMG_Key_aspects.pdf)
- 123,565,586 ordinary shares (the dividend base in the 2018 annual report, which EY audited without qualification). [Annual report 2018](https://wirecard.com/wp-content/uploads/2020/12/Annual-Report-2018.pdf), [ESMA timeline (25 Apr 2019)](https://www.esma.europa.eu/sites/default/files/library/esma42-111-5349_fast_track_peer_review_report_-_wirecard.pdf)
- 17 Jun 2020: the shares close at €104.50. [Fortune, 25 Jun 2020](https://fortune.com/2020/06/25/wirecard-insolvency-accounting-scandal/), [CNBC, 9 Jul 2020](https://www.cnbc.com/2020/07/09/why-some-investors-are-holding-onto-wirecard-shares-even-after-insolvency.html)
- Worked from the above: 123,565,586 shares x €104.50 = €12.91 billion, which is 16.4 times €785 million.

**As-of date:** 2020-06-17 (the day before the audited 2019 accounts were due).

**Known outcome (dated, sourced):**
- 16 Jun 2020: EY tells Wirecard that the banks deny the trust-account confirmations, which were forged. [ESMA timeline](https://www.esma.europa.eu/sites/default/files/library/esma42-111-5349_fast_track_peer_review_report_-_wirecard.pdf)
- 18 Jun 2020, 10:43: the accounts are delayed again. EY has "no sufficient audit evidence" for €1.9 billion of cash in trust accounts, "approximately a quarter of the consolidated balance sheet total". Loans of about €2 billion can be ended if no audited accounts appear by 19 June. [Wirecard ad hoc, 18 Jun 2020](https://wirecard.com/2020/06/18/wirecard-ag-date-for-publication-of-annual-and-consolidated-financial-statements-2019-delayed-due-to-indications-of-presentation-of-spurious-balance-confirmations/)
- 18 Jun 2020: the shares open at €99.50 and close at €39.90, down 62%. 19 Jun: CEO Markus Braun resigns, James Freis takes over, and the shares close at €25.82. [Nebenwerte Magazin chronology](https://www.nebenwerte-magazin.com/tecdax-wirecard-aktie-update-chronologie-vom-18-06-2020-10-43-uhr-bis-28-06-2020-incl-dpr-rausschmiss), [Reuters](https://www.reuters.com/article/technology/total-disaster-phantom-billions-plunge-wirecard-into-chaos-idUSKBN23T06V)
- 22 Jun 2020: the Management Board says there is "a prevailing likelihood that the bank trust account balances in the amount of 1.9 billion EUR do not exist". That evening, a warrant is out for Braun and he gives himself up. [Wirecard ad hoc, 22 Jun 2020](https://wirecard.com/2020/06/22/wirecard-ag-statement-of-the-management-board-about-the-current-situation-of-the-company/), [Nebenwerte Magazin chronology](https://www.nebenwerte-magazin.com/tecdax-wirecard-aktie-update-chronologie-vom-18-06-2020-10-43-uhr-bis-28-06-2020-incl-dpr-rausschmiss)
- 25 Jun 2020: Wirecard AG files for insolvency at the Munich Local Court. 26 Jun: the shares trade at €1.28, down 99% in seven trading days. [Wirecard ad hoc, 25 Jun 2020](https://wirecard.com/wp-content/uploads/2021/01/AH_2020_06_25_Application-Insolvency.pdf), [Munich Local Court press release](https://www.justiz.bayern.de/gerichte-und-behoerden/amtsgerichte/muenchen/presse/2020/26.php), [CNBC](https://www.cnbc.com/2020/07/09/why-some-investors-are-holding-onto-wirecard-shares-even-after-insolvency.html)
- 24 Aug 2020: under a new insolvency rule, Wirecard leaves the DAX and Delivery Hero replaces it. [STOXX / Deutsche Börse](https://stoxx.com/unscheduled-changes-in-dax-selection-indices/)
- 3 Nov 2020: the EU securities regulator ESMA finds a "lack of coordination and/or procedural inefficiencies" within BaFin, whose accounts team missed press reports that moved the Price. [ESMA peer review](https://www.esma.europa.eu/sites/default/files/library/esma42-111-5349_fast_track_peer_review_report_-_wirecard.pdf)
- 22 Jun 2021: the Bundestag's inquiry committee publishes its final report. [Drucksache 19/30900](https://dserver.bundestag.de/btd/19/309/1930900.pdf), [Bundestag, 25 Jun 2021](https://www.bundestag.de/dokumente/textarchiv/2021/kw25-de-3ua-bericht-847030)

**Sources (primary first):**
- https://wirecard.com/2020/06/18/wirecard-ag-date-for-publication-of-annual-and-consolidated-financial-statements-2019-delayed-due-to-indications-of-presentation-of-spurious-balance-confirmations/ (ad hoc, 18 Jun 2020)
- https://wirecard.com/2020/06/22/wirecard-ag-statement-of-the-management-board-about-the-current-situation-of-the-company/ (ad hoc, 22 Jun 2020)
- https://wirecard.com/wp-content/uploads/2021/01/AH_2020_06_25_Application-Insolvency.pdf (ad hoc, 25 Jun 2020)
- https://wirecard.com/wp-content/uploads/2021/01/2019_11_06_Guidance-2020.pdf (ad hoc, 6 Nov 2019)
- https://wirecard.com/wp-content/uploads/2020/12/Annual-Report-2018.pdf
- https://www.wirecard.com/uploads/statement_2020_05_03_EN_KPMG_Key_aspects.pdf
- https://cdn.gmtresearch.com/public-ckfinder/hall-of-shame/Wirecard%20AG/KPMG_Special%20Investigation%20Report_Apr27-2020.pdf (KPMG report, mirror; Wirecard published it on 28 Apr 2020)
- https://www.esma.europa.eu/sites/default/files/library/esma42-111-5349_fast_track_peer_review_report_-_wirecard.pdf (ESMA, regulator)
- https://www.justiz.bayern.de/gerichte-und-behoerden/amtsgerichte/muenchen/presse/2020/26.php (Munich Local Court)
- https://dserver.bundestag.de/btd/19/309/1930900.pdf (Bundestag final report)
- https://stoxx.com/unscheduled-changes-in-dax-selection-indices/ (index owner)
- Prices and news: Fortune, CNBC, Reuters, Nebenwerte Magazin (above)

**Why a beginner cares.** Every valuation starts from the company's own numbers. Here the audited numbers were false, and a DAX company worth €12.9 billion was bust a week later. In 2019 the regulator had banned new bets against the shares. A beginner learns to ask where the cash is and who has checked it, before trusting any value built on it.

**Build notes:**
- Published valuation: none a paid product can use (broker targets are paid research). Build it as an **illustration** (`illustration: true`) from the company's reported figures, and judge the Price's claim with `match_price` ("what the Price assumed"), as in Spine 13. The lesson is that the inputs were false, not the engine (ADR 0010).
- Inputs: 2019 preliminary revenue about €2.8 billion and EBITDA €785 million; 2020 EBITDA guidance €1.0 to €1.12 billion; 123,565,586 shares. Cash and debt come from the H1 2019 or Q1 2020 report, with and without the €1.9 billion.
- Currency `EUR`: **needs #112** (the euro). Unit `millions`, `per: share`, price `{value: 104.50, date: 2020-06-17, note: "close"}`.
- Case Data: Xetra symbol `WDI` (ISIN DE0007472060). Daily closes come from Deutsche Börse; the market parts (#113 to #115) bring non-US prices.
- Hindsight probe words (ADR 0013): "spurious", "do not exist", "insolvency", "39.90", "Freis", "arrested", "Delivery Hero", "1.28".
- Host Topics: `fs-earnings-quality`, `jud-filing-vs-claim`, `spine-03-cash`, `gov-ethics`, `fs-filings`.

---

## Rank 6 (Japan/Korea #2): Toshiba's profits before the accounting probe (April 2015)

**Story to judge (the Price's claim, built on the company's own accounts).** The Price of about 512 yen a share claims Toshiba is worth about 2,170 billion yen, about 18 times the 120 billion yen it said it would earn in the year to March 2015. That claim rests on the profits Toshiba had reported. As known on 2 Apr 2015:
- FY2013 (to 31 Mar 2014), as reported: net sales 6,502.5 billion yen, operating income 290.8 billion yen, net income 50.8 billion yen. [Toshiba mid-term plan, 22 May 2014](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/pr/pdf/tpr20140522e.pdf), [FY2013 results, 8 May 2014](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/finance/er/er2013/q4/ter2013q4e_ca.pdf)
- The FY2014 forecast (18 Sep 2014): net sales 6,700 billion yen, operating income 330 billion yen, net income 120 billion yen, earnings per share 28.34 yen. [Toshiba notice, 8 May 2015 (repeats the 18 Sep 2014 forecast)](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150508_2.pdf)
- The mid-term plan (May 2014) aims for "5% or more" return on sales in every business by FY2016. [Mid-term plan](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/pr/pdf/tpr20140522e.pdf)
- Worked: 120 billion / 28.34 yen = about 4,234 million shares. At about 512 yen that is about 2,168 billion yen, or 18.1 times forecast earnings. The 512 yen is worked back from Reuters: the shares closed at 487.4 yen on 6 Apr 2015, down 4.88%, so 512 yen is the close of the trading day before, 3 Apr 2015, not 2 Apr. [Reuters, 6 Apr 2015](https://www.reuters.com/article/world/toshiba-shares-fall-after-accounting-probe-launched-idUSKBN0MX0BJ/) The Case Data import should take the TSE close for 2 Apr 2015.

**As-of date:** 2015-04-02 (the day before Toshiba announced a special investigation committee).

**Known outcome (dated, sourced):**
- 3 Apr 2015: Toshiba sets up a Special Investigation Committee into percentage-of-completion accounting on some infrastructure projects. 6 Apr: the shares close at 487.4 yen. [Toshiba notice, 3 Apr 2015](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150403.pdf), [Reuters](https://www.reuters.com/article/world/toshiba-shares-fall-after-accounting-probe-launched-idUSKBN0MX0BJ/)
- 8 May 2015: the forecast is withdrawn ("Undetermined"), an Independent Investigation Committee takes over and the dividend is dropped. 11 May: the shares fall 17% to 403.3 yen. [Toshiba notice, 8 May 2015](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150508_2.pdf), [Bloomberg, 11 May 2015](https://www.bloomberg.com/news/articles/2015-05-10/toshiba-poised-to-plunge-in-tokyo-on-extended-accounting-probe), [Japan Times, 9 May 2015](https://www.japantimes.co.jp/news/2015/05/09/business/corporate-business/toshiba-pulls-earnings-forecast-cancels-dividend-over-improper-accounting)
- 20 Jul 2015: the committee's report finds profit before tax overstated by 151.8 billion yen from FY2008 to FY2014 Q3, with top management involved. The president and two former presidents resign. [Investigation Report (English)](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20151208_2.pdf), [Toshiba notice, 20 Jul 2015](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150720_1.pdf), [Reuters, 20 Jul 2015](https://www.reuters.com/article/business/toshiba-inflated-profits-by-12-billion-with-top-execs-knowledge-investigatio-idUSKCN0PU0E8/)
- 7 Sep 2015: the restatement. Profit before tax for FY2008 to FY2014 Q3 falls by 224.8 billion yen, from 583.0 billion yen to 358.2 billion yen (39% of it was not there). FY2013 operating income becomes 257.1 billion yen. FY2014 ends with a net loss of 37.8 billion yen, not the 120 billion yen profit forecast. [Toshiba notice, 7 Sep 2015](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150907_1.pdf)
- 15 Sep 2015: the TSE names the shares a "Security on Alert" and fines Toshiba for breaking its listing agreement. [JPX, 15 Sep 2015](https://www.jpx.co.jp/english/news/1021/20150915-11.html), [Toshiba notice, 14 Sep 2015](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150914_1.pdf)
- 7 Dec 2015: the SESC recommends a 7,373.5 million yen penalty. For example, FY2011 net income was stated as 70,054 million yen; the correct figure was 3,194 million yen. [SESC (FSA), 7 Dec 2015](https://www.fsa.go.jp/sesc/english/news/reco/20151207-1.htm), [Toshiba notice, 7 Dec 2015](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20151207_2.pdf)
- 29 Mar 2017: Westinghouse, Toshiba's US nuclear unit, files for Chapter 11. FY2016 ends with a net loss of 965.7 billion yen. [Toshiba notice, 29 Mar 2017](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20170329_1.pdf), [Annual Report 2017](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/finance/ar/ar2017/tar2017e_fr.pdf)
- 1 Aug 2017: moved down to the TSE Second Section because its net worth is negative. It returns to the First Section on 29 Jan 2021. [Toshiba notice, 23 Jun 2017](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20170623_5.pdf), [Toshiba notice, 22 Jan 2021](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20210122_1.pdf)
- 1 Oct 2018: ten shares are consolidated into one. [Toshiba notice, 15 May 2018](https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20180515_5.pdf)
- 20 Dec 2023: delisted after the TBJH (Japan Industrial Partners) tender offer at 4,620 yen a share, which is 462 yen per pre-2018 share. [JPX, 22 Nov 2023](https://www.jpx.co.jp/english/news/1023/20231122-11.html), [Toshiba tender offer page](https://www.global.toshiba/ww/ir/corporate/tender-offer.html), [Toshiba notice, 21 Sep 2023](https://www.global.toshiba/content/dam/toshiba/ww/ir/corporate/news/20230921_1.pdf), [Reuters, 19 Dec 2023](https://www.reuters.com/markets/deals/scandal-delisting-toshibas-long-running-crisis-2023-12-19/)

**Sources (primary first):**
- https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/pr/pdf/tpr20140522e.pdf (mid-term plan, 22 May 2014)
- https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/finance/er/er2013/q4/ter2013q4e_ca.pdf (FY2013 results)
- https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150403.pdf
- https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150508_2.pdf
- https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20151208_2.pdf (Independent Investigation Committee report, English)
- https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/news/20150907_1.pdf (restatement)
- https://www.jpx.co.jp/english/news/1021/20150915-11.html (TSE, Security on Alert)
- https://www.fsa.go.jp/sesc/english/news/reco/20151207-1.htm (SESC penalty)
- https://www.global.toshiba/content/dam/toshiba/migration/corp/irAssets/about/ir/en/finance/ar/ar2015/tar2015e_fr.pdf (Annual Report 2015, restated five-year summary)
- https://www.jpx.co.jp/english/news/1023/20231122-11.html (TSE, delisting)
- News: Reuters, Bloomberg, Japan Times (above)

**Why a beginner cares.** Everything a beginner values starts from reported profit. Here a household name, checked by a big auditor, reported profits for about seven years, and 39% of them were not there. The Story the Price told was built on numbers that were not true. It shows why cash flow, auditors and "who checks the checkers" matter before any multiple.

**Build notes:**
- Published valuation: none that a paid product can use (broker research only). Build it as an **illustration** (`illustration: true`). Value it twice from the same Levers: once on the reported margins, once on the restated ones (FY2013 operating income 290.8 billion against 257.1 billion yen). A `two_stories` pair or the `failure` mode ("which assumption failed": the profit itself) fits.
- Inputs: base revenue 6,502.5 billion yen (FY2013, as reported; 6,489.7 restated). Cash, debt, minority interests and shares from the 175th annual securities report (yuho, FY2013) and the Annual Report 2014; restated figures from the 7 Sep 2015 notice and the Annual Report 2015. Shares about 4,234 million (pre-2018).
- Currency `JPY` (needs #112), unit `billions` (yen), `per: share`, price `{value: <the TSE close for 2 Apr 2015>, date: 2015-04-02}`, from Case Data (512 yen is the 3 Apr close, a stand-in until then). Market parts for Japan (TSE/JPX Price data, EDINET yuho filings) need #113-#115.
- Case Data: TSE code 6502 (delisted 20 Dec 2023). Daily closes from JPX/TSE historical data or a licensed vendor. Adjust for the 1-for-10 consolidation of 1 Oct 2018.
- Hindsight probe words (ADR 0013): "Special Investigation Committee", "151.8", "224.8", "restatement", "Security on Alert", "Westinghouse", "Chapter 11", "delisted".
- Host Topics: `fs-earnings-quality` (a second Case beside Satyam), `fs-filings`, `spine-12-price-or-value`.

---

## Considered, not picked

### India

- **Adani group and Hindenburg (Jan 2023):** a short seller's claim against a group's. The allegations are contested and still under review by regulators and courts, so a "known outcome" is hard to state fairly. The main source is the short seller's own report, not a filing.
- **Byju's:** private, with no exchange price and late, disputed accounts. There is no Price to judge.
- **Yes Bank (Mar 2020):** already in the course.

### Japan/Korea

- **Olympus (2011):** years of hidden investment losses. A strong story, but older, and the same lesson as Toshiba with fewer English primary sources.
- **SoftBank Vision Fund and WeWork (2019-20):** already in the course (`ana-who-pays-whom`, `val-multiples`).
- **Kakao Bank IPO (Aug 2021):** offered at 39,000 won, peaked at 94,400 won on 20 Aug 2021 and closed at 17,750 won on 12 Oct 2022 ([Korea Herald](https://www.koreaherald.com/article/2977306)). A bank needs price-to-book, which the engine does not do, so it is harder to build than Krafton.
- **LG Energy Solution IPO (Jan 2022):** the Price went up, not down, so there is no clear failed Story to judge.
- **Samsung C&T and Cheil merger (2015):** about governance and a merger ratio, not a valuation a beginner can judge.
- **Terra/Luna (May 2022):** a crypto token with no company accounts and no Price for an equity claim.
- **Livedoor (2006):** fraud like Toshiba, with fewer English primary sources.

Ranking: Krafton is #1. It has a published, checkable valuation (a peer P/E in the prospectus), a regulator who questioned it, a clear Price path, and a game most beginners know. Toshiba is #2: the lesson ("the profit itself was wrong") is strong, but there is no published valuation to judge.

### Europe/US

- **WeWork's S-1 (Aug 2019):** already in the course (`s12-wework-iwg` and the Example `wework-2019`).
- **Credit Suisse taken over by UBS (Mar 2023):** a strong Case, but it needs the Swiss franc (#112), and a run on a bank's deposits in the same month as SVB repeats a lesson the course already has.
- **Nikola (2020):** a founder's claim with a clear outcome, but the lesson (a company's own claims were false) is the same as Wirecard's, and Nikola is less known to a beginner.
- **Carvana (2022):** in dollars, but the outcome is not settled: the shares later rose a long way from the 2022 low, so the "known outcome" depends on the date chosen.
