# Which licence-safe public sources should the Library add next?

Research for issue #27. Checked on 2026-11-15. **Not legal advice.**

Inputs: the baseline in #24 (`research/rag-baseline.md` and `research/rag-baseline-raw.txt` on `research-rag-baseline`) and the licence findings in #26 (`research/library-licences.md` on `research-library-licences`).

## Answer in short

- **Top 5 picks** (all safe for a paid offer on the licence text):
  1. **OpenStax *Principles of Finance* 1st edition, CC BY 4.0 snapshot.** The last Git commit before OpenStax changed the licence (3b7fc65c52, 4 December 2025) is CC BY 4.0. Its text is **99.5% the same** as the 2e text that the Library has now (3,049 of 3,065 paragraphs are identical). CC BY 4.0 permits commercial use and is irrevocable. This one swap keeps the 42 of 78 score questions that a paid offer loses today.
  2. **FOMC historical materials** (Federal Reserve Board, public domain). Statements from 1994, minutes from 1993, Records of Policy Actions 1967–1992, Beige Books from 1983. Each document has its own release date. This fills the old Fed Cases (1979, 1987, 1994, 1998).
  3. **SEC EDGAR: Amazon 1997–2000 and Webvan 1999–2001 filings.** Each filing has its own date. Several Case as-of dates are exact filing dates (Webvan 424B1 on 1999-11-05, 10-K405 on 2000-03-30, 10-K on 2001-04-02).
  4. **SEC EDGAR: The We Company Form S-1 (2019-08-14) and its two amendments (September 2019).** Today the Library has **no** WeWork passage dated on or before the WeWork Case date. The S-1 is dated on the Case date, so it shows.
  5. **Investor.gov explainers** (SEC Office of Investor Education, a US government work). Compound interest, the Rule of 72, bonds and interest-rate risk. Most pages give no year, so the as-of rule lets them show for old Cases.
- **Why old Cases see 10% today.** For every Case up to 2001, the dated sources (Damodaran blog, papers, spreadsheets, Anthropic S-1: 18,468 passages) are hidden (all of them up to 1998; all but 24 Damodaran paper passages from 1999 to 2001), and so is Yale 252 (the `latestYear()` heading bug). What old Cases see is the timeless text: OpenStax (880), Yale 251 (1,178), The Fed Explained (157), NY Fed (25). **In a paid offer only 182 of these stay** (The Fed Explained and NY Fed). Old Cases need two things: timeless text with a commercial licence (pick 1, pick 9) and dated documents from before the Case date (picks 2, 3, 6, 7, 10).
- **Compounding.** The Sensex miss ("Why is the average of yearly returns different from the compound growth rate?", as of 1992-03-31) is a **ranking** problem, not a coverage problem. The expected OpenStax passage (13.1 Measures of Center, geometric mean, `m00078`) has no year in it, so the as-of rule does not hide it. The CC BY snapshot has the same passage. New compounding text (pick 5) can help ranking, but it can also push the expected passage down. Measure it with `scripts/library-score.mjs` after each load.
- **Gaps that no licence-safe source fills well:** India 1991, the Sensex, SEBI 1992 and the Thai baht 1997. RBI, SEBI and the IMF are blocked by the spec. The Indian Ministry of Finance and the Parliament Digital Library require permission. TreasuryDirect prohibits commercial reuse.
- **The one decision for the owner:** see the last section.

## How the facts were checked

- **Licence:** each verdict quotes the owner's own page (URL and date in the notes). "Safe" means the licence text permits store, embed, show and quote in a paid offer, with credit. "Ask" means the owner's terms require permission. "No" means a rule of this repo blocks it.
- **Size:** sample documents were fetched and cut the way `cutPassages` (`src/library/prepare.ts`) cuts them: whole paragraphs packed up to 300 words. Tokens ≈ words × 1.35. Check of the method: it gives 1,035 passages for OpenStax 2e; the database has 1,043 (`rag-baseline-raw.txt`).
- **Old-Case visibility:** for timeless text, the count of passages whose latest year (the `latestYear()` rule) is before 2002. For dated text, the filing or release date.
- **BLOCKED regex:** each candidate's id, title and URL were tested with the regex read from `src/library/ingest.ts`. Only the FRASER copy of Fisher's book hits it (`stlouisfed`).
- **Fetches:** scripts and downloads were kept in `~/value-it/.wayfinder-tmp/` (outside the repo). EDGAR fetches declared the repo's SEC User-Agent. gao.gov refused a plain script request (HTTP 403); its PDFs were read with Firecrawl.

## Ranked table

Key for "Fits `SourceDocument`": **yes** = an extractor in the repo already produces it; **small** = a short new reader; **new** = a new crawler.

| # | Source (suggested id) | Fills | As-of years | Format | Own date per passage? | Passages (tokens) | Fits `SourceDocument` | BLOCKED hit? | Licence (paid) | Ingest effort |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | OpenStax *Principles of Finance* 1e, CC BY 4.0 snapshot (`openstax-principles-finance-1e`) | Paid licence for 42/78 questions; old Cases (timeless); compounding (ch. 7–9, 13.1) | Timeless; 886 of ~1,036 passages show for Cases up to 2001 | CNXML in Git (tarball at commit 3b7fc65c52) | No (timeless, latest-year rule) | ~1,036 (~258k) | **yes** (`scripts/library/openstax.py`, book slug `principles-finance`) | No | **Safe** (lawyer check advised) | Very low |
| 2 | FOMC historical materials (`fomc-historical`) | Fed 1994, Volcker 1979, 1987 crash, LTCM 1998, rates and basis points | 1936–2020 (statements 1994+, minutes 1993+, policy records 1967–1992, Beige Books 1983+) | HTML (minutes, statements) and PDF (Beige Books before 1996, transcripts, Greenbooks) | **Yes**, release date per document | Per meeting: minutes ~44, Beige Book ~46, statement 1, transcript ~136. One year of public documents ≈ 700 | **new** (year-page crawler; HTML via `html_blocks`, PDF via `pdf_document`) | No | **Safe** | Medium |
| 3 | SEC EDGAR: Amazon 1997–2000, Webvan 1999–2001 (`sec-amazon-1997-2000`, `sec-webvan-1999-2001`) | Amazon 2000 Signal Case (9 entries); Webvan Cases (1999-11-04, 1999-11-05, 2000-03-30, 2001-04-02) | 1997–2001 | Plain text inside SGML full-submission `.txt` | **Yes**, filing date | Amazon: 10-K405 ~91, 10-K 1999 ~99, 10-Q ~57 each, 10-K 2000 ~123. Webvan: S-1 ~166, 10-K405 ~115, 10-K ~113. The 10-Ks and S-1 alone ≈ 700; with the 424B1 and all 10-Qs ≈ 1,500–1,700 (estimate) | **small** (plain-text reader; `sec_filing()` needs two fixes, see notes) | No | **Safe** | Low |
| 4 | SEC EDGAR: The We Company S-1 and S-1/As (`sec-wework-s1-2019`) | WeWork 2019 Signal Case (8 Case entries dated 2019-08-14 or 2019-08-20) | 2019-08-14 (S-1); amendments 2019-09-04 and 2019-09-13 are reveal material | Flowing HTML (10,381 `<p>`, 768 tables) | **Yes**, filing date | S-1 main document ~776 (~264k); each amendment similar | **small** (`html_blocks` + `sections_from_blocks`; not the layout-page reader) | No | **Safe** | Low |
| 5 | Investor.gov explainers (`investor-gov-explainers`) | Compounding, Rule of 72, bonds, interest-rate risk, fees | Timeless; most pages give no year | HTML | No (timeless) | ~2 per page (compound-interest page: 401 words); a set of 40–60 pages ≈ 150–300 | **yes** (same path as `nyfed`: Firecrawl main content, then Markdown reader) | No | **Safe** | Low |
| 6 | Federal Reserve Board speeches, testimony and monetary policy reports 1996–2001 (`fed-board-speeches`) | Dot-com Cases (2000), LTCM 1998, Amazon/Webvan macro, rates | 1996–2001 (on federalreserve.gov) | HTML | **Yes**, speech date | ~17 per speech (Greenspan, 1996-12-05: 4,390 words). Chair + semiannual reports ≈ 400 a year | **small** (year index + `html_blocks`) | No | **Safe** | Low–medium |
| 7 | GAO reports on financial markets 1988–2001 (`gao-financial-markets`) | Orange County and Metallgesellschaft 1994 (derivatives), LTCM, 1987 crash | 1988–2001 | PDF, 1990s scans with OCR text | **Yes**, report date | GGD-94-133 (200 pages) ≈ 250–300; about 10 reports ≈ 800–1,200 | **yes** (`pdf_document`, plus the vision step for bad OCR) | No | **Safe** | Medium |
| 8 | IRS 2018 Form W-2G and its instructions; Pub. 525 (`irs-gambling-winnings-2018`) | Mega Millions 2018 (tax on a lottery prize) | Tax year 2018 | PDF (text) | **Yes**, revision date | ~20–60 | **yes** (`pdf_document`) | No | **Safe** (US government work) | Low |
| 9 | Walter Bagehot, *Lombard Street* (1873), Project Gutenberg #4359 (`bagehot-lombard-street`) | Lender of last resort, panics: 1987, LTCM, 1991 crises | Timeless; latest year 1873, so all passages show for every Case | Plain text | No (timeless) | ~329 (~107k) | **small** (strip the Gutenberg header and licence, split chapters) | No | **Safe** (US public domain) | Very low |
| 10 | Federal Reserve International Finance Discussion Papers (`fed-ifdp`) | Currency crises before the Thai baht (1997) and Argentina (2001) Cases; Mexico 1994–95 | 1971–today | PDF; older ones have OCR with joined words | **Yes**, paper month | ~60–120 per paper; pick 10–20 papers | **yes** (`pdf_document`, vision for old OCR) | No | **Safe** | Medium |

## Notes per pick

### 1. OpenStax *Principles of Finance* 1e, CC BY 4.0 snapshot — safe

- **The facts in Git** (read with `gh api` on 2026-11-15, repo `openstax/osbooks-principles-finance`):
  - Commit `c802474325`, 2026-04-08: "updating license from CC BY to CC BY NC SA".
  - The last commit before it is `3b7fc65c527e`, 2025-12-04 ("Update README"). At that commit the `LICENSE` file starts "Attribution 4.0 International". The README says: "*Principles of Finance* is available under the [Creative Commons Attribution License](./LICENSE) license." The collection metadata says `<md:license url="http://creativecommons.org/licenses/by/4.0/"/>`. No file in the snapshot contains "large language" or "generative AI".
  - The 2e text came with commit `ac5b1a7176`, 2026-04-28 ("2e init").
- **Same text.** Both versions were extracted with `scripts/library/openstax.py`. 1e: 130 documents, 191,262 words. 2e: 130 documents, 191,388 words. 3,049 of the 3,065 2e paragraphs (99.5%) are identical in 1e. The module ids are the same (`m00078` and so on), so `scripts/library/eval/questions.json` keeps working if the expected ids are re-pointed to the new source id.
- **Licence quotes:**
  - CC BY 4.0, §2(a)(1), from the snapshot's `LICENSE` file: "the Licensor hereby grants You a worldwide, royalty-free, non-sublicensable, non-exclusive, irrevocable license to exercise the Licensed Rights in the Licensed Material to: a. reproduce and Share the Licensed Material, in whole or in part; and b. produce, reproduce, and Share Adapted Material."
  - Creative Commons FAQ ([creativecommons.org/faq](https://creativecommons.org/faq/), 2026-11-15): "once you receive material under a CC license, you will always have the right to use it under those license terms, even if the licensor changes his or her mind and stops distributing under the CC license terms." Also: "CC licenses are not revocable once granted unless there has been a breach".
  - OpenStax, "An update on OpenStax licensing", 22 April 2026 ([openstax.org/license](https://openstax.org/license), 2026-11-15): "This change will apply to all newly released and updated versions of our titles, with limited exceptions." and "No action is needed by anyone who has previously created derivatives of CC BY content."
- **The risk.** The 1e web page now shows CC BY-NC-SA and the AI clause: "This book may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without OpenStax's prior written permission." Page footer "© Apr 23, 2026 OpenStax" ([1e book page](https://openstax.org/books/principles-finance/pages/1-why-it-matters), 2026-11-15). That clause is on the website, not in the Git snapshot. Creative Commons has a precedent where a website's terms of service could not take back CC BY rights (the CrunchBase settlement, [CC blog, 13 Dec 2013](https://creativecommons.org/2013/12/13/permanence-of-cc-licenses-upheld-in-crunchbase-settlement/)). A lawyer should still confirm before the paid launch.
- **Credit (CC BY 4.0 §3(a)):** name the authors, keep the copyright and licence notice, link the licence, link the source, say that the text was modified (cut into passages). Suggested credit: "Julie Dahlquist and Rainford Knight, *Principles of Finance* (OpenStax, 2022), CC BY 4.0; text from the OpenStax GitHub repository at commit 3b7fc65c52, cut into passages". Do not use the OpenStax logo or imply endorsement (trademarks are not licensed).
- **Effort:** download the tarball (`gh api repos/openstax/osbooks-principles-finance/tarball/3b7fc65c527e`), run `openstax.py <dir> principles-finance <out>`, load under a new source id, re-embed (~1,040 passages), re-point `questions.json`, then drop `openstax-principles-finance-2e`.

### 2. FOMC historical materials — safe

- **Licence:** "Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information." ([Board disclaimer](https://www.federalreserve.gov/disclaimer.htm); quoted in #26, checked 2026-11-14). The FOMC pages are on the Board's site. Beige Books are written by Reserve Bank staff but published there with no other notice.
- **What is there** ([Transcripts and other historical materials](https://www.federalreserve.gov/monetarypolicy/fomc_historical.htm), "Last Update: January 28, 2022", read 2026-11-15): transcripts, statements, minutes (1993–present), Record of Policy Actions and Minutes of Actions (1967–1992), Greenbooks (1964–2010), Bluebooks (1965–2010), Beige Books, historical minutes (1936–1967).
- **Dates per document (for the as-of rule):**
  - Statements: "The FOMC first announced the outcome of a meeting in February 1994." Date = meeting date.
  - Minutes: "From their emergence in their present form in February 1993 until December 2004, the minutes were published approximately three days after the Committee's subsequent meeting." The year pages print the exact date, for example "Minutes (Released March 25, 1994)" for the meeting of 3–4 February 1994 ([1994 page](https://www.federalreserve.gov/monetarypolicy/fomchistorical1994.htm)).
  - Records of Policy Actions: "In 1976, the Committee sped up release further by setting the publication date for each record a few days after the subsequent meeting".
  - Beige Books: "released to the public approximately two weeks prior to each regularly scheduled FOMC meeting". The file name carries the date (for example `fomc19940204beige19940119.pdf`).
  - Transcripts, Greenbooks and Bluebooks: "made available to the public through this website with about a five-year lag." Dated by release, they show only for Cases five or more years later.
- **What the 1994 Cases (as of 1994-02-03) would see** ([1993 page](https://www.federalreserve.gov/monetarypolicy/fomchistorical1993.htm), 2026-11-15): the 1993 minutes up to the meeting of 16 November 1993 ("Released December 23, 1993") and the Beige Book of 1994-01-19. They would not see the minutes of 21 December 1993 ("Released February 4, 1994") or the statement of 4 February 1994. That is correct for "what the public knew".
- **Size (meeting of 3–4 February 1994):** minutes 10,553 words (~44 passages); Beige Book 45 pages, 11,533 words (~46); transcript 70 pages, 34,256 words (~136); statement about 120 words (1). Start with statements, minutes and Beige Books for the Case years (1979, 1987, 1993–2001): about 11 years × ~8 meetings × ~90 ≈ 8,000 passages. Minutes and statements alone are about half.
- **Note:** `latestYear()` does not matter here, because the source is dated.

### 3. SEC EDGAR: Amazon 1997–2000 and Webvan 1999–2001 — safe

- **Licence:** "Information presented on sec.gov is considered public information and may be copied or further distributed by users of the web site without the SEC's permission." ([SEC privacy and website policy](https://www.sec.gov/about/privacy-information); quoted in #26, checked 2026-11-14). Same basis as the Anthropic S-1 that is in the Library now. #26's caveat applies: the filer can own copyright in the text; reuse of filings is common and the risk is low.
- **Amazon (CIK 0001018724)**, from the [EDGAR filing list](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001018724&type=10-&dateb=20010501&owner=include&count=40) (2026-11-15):
  - 10-K405 filed 1998-03-30 (0000891020-98-000448): 21,777 words, ~91 passages.
  - 10-K filed 1999-03-05 (0000891020-99-000375): 25,259 words, ~99.
  - 10-Qs filed 1999-05-17, 1999-08-16, 1999-11-15 (the last: 14,006 words, ~57).
  - 10-K filed 2000-03-29 (0000891020-00-000622): 31,286 words, ~123. It is after the 2000-02-01/03 Case dates, so it stays hidden for those Cases.
  - The famous shareholder letters are not in these filings.
- **Webvan (CIK 0001092657)**, from the EDGAR submissions API (67 filings, all in `recent`):
  - S-1 filed 1999-08-06 (0000891618-99-003537): 42,794 words, ~166 passages. Eight S-1/As follow (1999-09-08 to 1999-11-04).
  - 424B1 prospectus filed 1999-11-05 — the as-of date of "Webvan's warehouse and fleet build-out".
  - 10-K405 filed 2000-03-30 (0000891618-00-001877): 27,823 words, ~115 — the as-of date of "Webvan's plan for 26 more distribution centres".
  - 10-K filed 2001-04-02 (0001012870-01-001485): 28,416 words, ~113 — the as-of date of "Webvan's cash burn".
- **Extractor changes:** `sec_filing()` in `scripts/library/sources.py` (a) looks the accession up only in `filings.recent`, which does not reach Amazon's 1990s filings (they are in the older `filings.files` pages), (b) asserts on `primaryDocument`, which is empty for Webvan's 1999–2000 rows, and (c) uses `layout_pages_to_document`, which reads page-layout HTML. The 1990s documents are plain text inside the full-submission `.txt` (`<DOCUMENT>`/`<TEXT>` blocks). A short reader is needed: split on blank lines, take "ITEM n." lines as headings, keep only the first `<DOCUMENT>` (the main form).

### 4. SEC EDGAR: The We Company S-1 — safe

- **Licence:** as pick 3.
- **Filings** (EDGAR full-text search, 2026-11-15): CIK 0001533523 ("We Co."), S-1 accession 0001193125-19-220499, main document `d781982ds1.htm`, filed 2019-08-14. S-1/A 0001193125-19-236798 (2019-09-04) and S-1/A No. 2 0001193125-19-244329 (2019-09-13).
- **Why it matters:** `rag-baseline-raw.txt` shows 52 Damodaran blog passages and 24 spreadsheet passages that name WeWork, and **0** of them are dated on or before 2019-08-14. Today the WeWork Cases have no WeWork-specific passage. Six WeWork Cases are dated 2019-08-14 and two 2019-08-20, so the S-1 shows for all eight. The September amendments are after every WeWork Case date, so they only add reveal material; the S-1 alone is enough. (One WeWork Case is dated 2019-01-08; the S-1 is correctly hidden there.)
- **Size:** 195,673 words with tables, ~776 passages, ~264k tokens (about half the Anthropic S-1's 1,384 passages).
- **Extractor:** the document is flowing HTML (no page boxes), so use the existing `html_blocks` + `sections_from_blocks` in `sources.py`, not `layout_pages_to_document`.

### 5. Investor.gov explainers — safe

- **Licence:** Investor.gov is written by the SEC's Office of Investor Education and Assistance: "The Office of Investor Education and Assistance has provided this information as a service to investors. ... Paid for by the U.S. Securities and Exchange Commission." ([investor.gov/disclaimer](https://www.investor.gov/disclaimer), 2026-11-15). 17 U.S.C. §105: "Copyright protection under this title is not available for any work of the United States Government" (quoted in #26). No terms of use with limits were found on the site. Pictures or quotes from third parties can still carry their own rights.
- **Example:** "What is compound interest?" ([page](https://www.investor.gov/additional-resources/information/youth/teachers-classroom-resources/what-compound-interest), 2026-11-15): 401 words, compound interest and the Rule of 72, no year. The glossary has a "Compound Interest" entry.
- **Caution:** some pages name 2026 items (for example "Trump Accounts"). The latest-year rule hides those passages for old Cases, which is correct.
- **Effort:** choose 40–60 pages (compounding, bonds, interest-rate risk, mutual fund fees, stocks), save main content with Firecrawl, read them like `NYFED_PAGES`.

### 6. Federal Reserve Board speeches, testimony and monetary policy reports 1996–2001 — safe

- **Licence:** as pick 2 (Board site).
- **What is there:** speeches from 1996 at `federalreserve.gov/boarddocs/speeches/<year>/`; testimony from 1996 ([1996 testimony list](https://www.federalreserve.gov/newsevents/testimony/1996testimony.htm)); the semiannual monetary policy testimony from 1996 (for example [Humphrey-Hawkins, 26 February 1997](https://www.federalreserve.gov/boarddocs/hh/1997/february/testimony.htm)). Example: Greenspan's "irrational exuberance" speech of 5 December 1996 ([page](https://www.federalreserve.gov/boarddocs/speeches/1996/19961205.htm)): 4,390 words, ~17 passages.
- **Before 1996** the Board's copies are on FRASER, which the BLOCKED regex rejects (`stlouisfed`).
- **Dates:** the speech or testimony date. Greenspan's LTCM testimony (1 October 1998) is after the LTCM Case dates, so it stays hidden there (it is the reveal).

### 7. GAO reports on financial markets 1988–2001 — safe

- **Licence:** GAO's standard notice: "This is a work of the U.S. government and is not subject to copyright protection in the United States. The published product may be reproduced and distributed in its entirety without further permission from GAO. However, because this work may contain copyrighted images or other material, permission from the copyright holder may be necessary if you wish to reproduce this material separately." ([GAO-17-767G](https://www.gao.gov/assets/700/695657.pdf), read 2026-11-15). The 1990s reports carry no notice, but §105 applies to them too. Keep third-party charts and long quotes out.
- **Reports:** *Financial Derivatives: Actions Needed to Protect the Financial System*, GAO/GGD-94-133, 18 May 1994, 200 pages ([PDF](https://www.gao.gov/assets/ggd-94-133.pdf)) — shows for the Orange County Cases (1994-06-30, 1994-09-30) and LTCM. *Financial Derivatives: Actions Taken or Proposed Since May 1994*, GAO/GGD/AIMD-97-8 (November 1996). *Long-Term Capital Management: Regulators Need to Focus Greater Attention on Systemic Risk*, GAO/GGD-00-3, 29 October 1999 ([PDF](https://www.gao.gov/assets/ggd-00-3.pdf)) — after the LTCM Case dates (a reveal source).
- **Quality:** the 1994 scan has OCR errors (search excerpts show "Carefhl" and "enforceabiliw"). Expect `corruptionReasons` rejections and use the vision step.

### 8. IRS 2018 Form W-2G and instructions; Publication 525 — safe

- **Licence:** US government work (17 U.S.C. §105). No site statement on reuse was found on irs.gov; none is needed for a federal work.
- **What:** the 2018 Form W-2G ([PDF](https://www.irs.gov/pub/irs-prior/fw2g--2018.pdf)) and its 2018 instructions say when a state lottery prize is reported and when federal tax is withheld. This gives the tax step of the Mega Millions Case from a primary source. The prior-year file names follow the same pattern for the instructions and Pub. 525.
- **Not checked here:** the exact 2018 withholding rate. Read it from the 2018 instructions before a Case uses it.

### 9. Bagehot, *Lombard Street* (1873) — safe

- **Licence:** US public domain (published 1873). Project Gutenberg: "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever." ([Gutenberg #4359](https://www.gutenberg.org/cache/epub/4359/pg4359.html), 2026-11-15). But: "If you use the Project Gutenberg name, which is a registered trademark, you need to pay royalties for any commercial use" ([permission how-to](https://gutenberg.org/policy/permission), 2026-11-15). So strip the Gutenberg header and licence and do not use the name in the credit.
- **Size:** 79,451 words, ~329 passages, ~107k tokens. Latest year 1873, so every passage shows for every Case.

### 10. Federal Reserve International Finance Discussion Papers — safe

- **Licence:** as pick 2 (Board site). Each paper carries a staff-views disclaimer, not a licence limit.
- **Examples:** IFDP 535, Truman, *The Risks and Implications of External Financial Shocks: Lessons from Mexico*, January 1996 ([page](https://www.federalreserve.gov/econres/ifdp/the-risks-and-implications-of-external-financial-shocks-lessons-from-mexico.htm)); IFDP 552 (1996) on the "Tequila Effect" in Argentina in 1995 ([page](https://www.federalreserve.gov/pubs/ifdp/1996/552/default.htm)). Both are before the Thai baht (1997-07-01) and Argentina (2001-12-01) Case dates.
- **Quality:** the 1996 PDF text has joined words ("thewriter hashadaccess"). `corruptionReasons` does not catch joined words; use the vision step or skip the oldest papers.

## Considered and not picked

| Source | Verdict | Why (quote, URL, date) |
|---|---|---|
| TreasuryDirect explainers (bills, notes, STRIPS) | **Ask** | "You may view, download and print material on this site for non-commercial personal use only. ... You should not assume anything on this site is necessarily in the public domain." ([treasurydirect.gov/terms.htm](https://treasurydirect.gov/terms.htm), 2026-11-15). For bond price and yield formulas, 31 CFR Part 356 Appendix B (a regulation) is an option, but its worked examples mention 1990 and 2012, so the latest-year rule hides most of it before 2013. |
| Union Budget speech 1991–92 and Economic Survey (Ministry of Finance, India) | **Ask** | "This contents of this website may not be reproduced partially or fully, without due permission from Ministry of Finance, Govt. of India." ([indiabudget.gov.in website policies](https://indiabudget.gov.in/website-policies.php), 2026-11-15). |
| Parliament Digital Library (for example the Joint Committee report on the 1992 securities scam) | **Ask** | "Items in Parliament Digital Library are protected by copyright, with all rights reserved, unless otherwise indicated." ([eparlib.sansad.in](https://eparlib.sansad.in/handle/123456789/824883?view_type=browse), 2026-11-15). |
| Mega Millions website (FAQ, jackpot history) | **Ask** | No licence or terms found on [megamillions.com](https://www.megamillions.com/faqs.aspx) (2026-11-15), so all rights are reserved by default. Use the IRS forms (pick 8) and cite single figures as facts. |
| FRASER (St. Louis Fed): Fisher, *The Theory of Interest* (1930), old Federal Reserve Bulletins, pre-1996 testimony | **No** (repo rule) | The BLOCKED regex in `src/library/ingest.ts` matches `stlouisfed`. Fisher's 1930 book is US public domain since 1 January 2026, but the only clean copies found were FRASER (blocked) and the Online Library of Liberty (terms not checked). Other scans have poor OCR. |
| RBI, SEBI, IMF material | **No** (repo rule) | Blocked by the spec and the regex. |

## The one decision for the owner

**Replace the OpenStax 2e text with the CC BY 4.0 1st-edition snapshot (Git commit 3b7fc65c52), or keep 2e and wait for OpenStax's answer to the reuse request?**

- Swap: the text is 99.5% the same. CC BY 4.0 permits commercial use and is irrevocable. It removes the NonCommercial problem for the paid offer and the AI-clause problem in the free beta. Cost: one reload and re-embed of ~1,040 passages, a new credit line, and re-pointed `questions.json` ids. Risk: OpenStax's website now asks for permission for AI use; a lawyer should confirm that the CC BY grant on the Git snapshot is enough.
- Keep and wait: no change now, but the 42 OpenStax-only questions stay at risk until OpenStax replies.

## Sources

All read on 2026-11-15 unless marked.

- OpenStax: [licensing update, 22 Apr 2026](https://openstax.org/license); [*Principles of Finance* 1e book page](https://openstax.org/books/principles-finance/pages/1-why-it-matters); GitHub repo `openstax/osbooks-principles-finance`, commits `c802474325`, `3b7fc65c527e`, `ac5b1a7176` (read with `gh api`)
- Creative Commons: [FAQ](https://creativecommons.org/faq/); [CrunchBase settlement post, 13 Dec 2013](https://creativecommons.org/2013/12/13/permanence-of-cc-licenses-upheld-in-crunchbase-settlement/); CC BY 4.0 legal code (the snapshot's `LICENSE` file)
- Federal Reserve Board: [disclaimer](https://www.federalreserve.gov/disclaimer.htm) (2026-11-14, #26); [FOMC historical materials](https://www.federalreserve.gov/monetarypolicy/fomc_historical.htm); [FOMC 1994](https://www.federalreserve.gov/monetarypolicy/fomchistorical1994.htm); [speech of 5 Dec 1996](https://www.federalreserve.gov/boarddocs/speeches/1996/19961205.htm); [1996 testimony](https://www.federalreserve.gov/newsevents/testimony/1996testimony.htm); [IFDP 535](https://www.federalreserve.gov/econres/ifdp/the-risks-and-implications-of-external-financial-shocks-lessons-from-mexico.htm)
- SEC: [privacy and website policy](https://www.sec.gov/about/privacy-information) (2026-11-14, #26); [Amazon filings](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001018724&type=10-&dateb=20010501&owner=include&count=40); [Webvan company search](https://www.sec.gov/cgi-bin/browse-edgar?company=webvan&match=starts-with&owner=include&count=40&action=getcompany); [We Co. S-1](https://www.sec.gov/Archives/edgar/data/1533523/000119312519220499/d781982ds1.htm); [Investor.gov disclaimer](https://www.investor.gov/disclaimer)
- GAO: [GAO-17-767G (notice text)](https://www.gao.gov/assets/700/695657.pdf); [GGD-94-133](https://www.gao.gov/assets/ggd-94-133.pdf); [GGD-00-3](https://www.gao.gov/assets/ggd-00-3.pdf)
- IRS: [2018 Form W-2G](https://www.irs.gov/pub/irs-prior/fw2g--2018.pdf)
- Project Gutenberg: [#4359](https://www.gutenberg.org/cache/epub/4359/pg4359.html); [permission how-to](https://gutenberg.org/policy/permission)
- Not picked: [TreasuryDirect terms](https://treasurydirect.gov/terms.htm); [India Budget website policies](https://indiabudget.gov.in/website-policies.php); [Parliament Digital Library](https://eparlib.sansad.in/handle/123456789/824883?view_type=browse); [Mega Millions FAQ](https://www.megamillions.com/faqs.aspx)
- US Code: 17 U.S.C. §105 (quoted in #26)
- Repo: `src/library/ingest.ts` (BLOCKED, `latestYear()`), `src/library/prepare.ts` (`cutPassages`), `src/library/search.ts` (as-of rule), `scripts/library/sources.py`, `scripts/library/openstax.py`, `scripts/library/sources.json`, `course/outline.yaml` (Case dates), `research/rag-baseline-raw.txt` (#24)

**Not legal advice.** Ask a lawyer before the paid launch.
