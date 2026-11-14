# Which Library sources can Value It keep if it charges Learners?

Research for issue #26. Checked on 2026-11-14. **Not legal advice.**

## Answer in short

- **Keep in a paid offer:** The Fed Explained, the NY Fed pages, and the Anthropic S-1. Each has a licence that permits business use. Together they answer 12 of the 78 score questions.
- **At risk (ask first):** OpenStax, Damodaran's papers and Damodaran's spreadsheets. OpenStax says commercial use and use in AI products need its permission. Damodaran's site rule ("no resale") is not clear for a paid tutor.
- **Drop if paid, unless the owner gives permission:** Yale ECON 251 and 252, and Damodaran's blog. The Yale terms give "tutor services" charged a fee as an example of prohibited use. The blog has no licence.
- **Two problems already exist in the free beta.** (1) The OpenStax book page prohibits use in "generative AI offerings" without written permission. (2) The Yale terms say that a site that requires an email address to view Yale content "may be in violation". Value It requires sign-in.
- **Ask Damodaran: yes.** A draft email is at the end.

## What Value It does with each source

These four words have the same meaning in all of this file:

- **Store**: Value It keeps the full text in its private database (Neon). The scripts cut the text into passages of at most 300 words (`cutPassages` in `src/library/prepare.ts`).
- **Embed**: `scripts/library-embed.mjs` sends each passage to Voyage AI and stores the vector.
- **Show**: the page `/passages/[id]` shows the full passage to a signed-in Learner, with the credit line and the licence name. Exception: the Damodaran blog shows at most 60 words (`quoteWords: 60`).
- **Quote**: the Tutor (a Claude model) gets passages from `search_library` and quotes short parts with a citation.

All four steps need a signed-in Learner (`signedInLearner()` in `src/app/passages/[id]/page.tsx`).

## Table: one row per source

Key for the "beta" and "paid" columns, in the order store / embed / show / quote:
**Y** = permitted. **N** = not permitted without the owner's permission. **?** = uncertain.

| # | Source (id) | What Value It stores | Licence text (quoted) | URL, checked 2026-11-14 | (a) Free invite-only beta | (b) Paid offer | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | OpenStax, Principles of Finance 2e (`openstax-principles-finance-2e`) | The full book, from the OpenStax GitHub repo. Cut, embedded, shown whole (≤300 words), quoted. | "NonCommercial means not primarily intended for or directed towards commercial advantage or monetary compensation." Book page: "This book may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without OpenStax's prior written permission." "Commercial use requires permission." | [CC BY-NC-SA 4.0 legal code](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en); [book page, licence box](https://openstax.org/books/principles-finance-2e/pages/1-why-it-matters) | **? ? ? ?** | **N N N N** | Paid: high. Beta: low. **UNCERTAIN** |
| 2 | Damodaran, Musings on Markets blog (`damodaran-blog`) | Every post, whole (Blogger feed). Pictures read into text by an OpenAI model. Weekly refresh (cron). Embedded. Shows and quotes at most 60 words. | No licence. The blog page has no copyright notice and no terms. The footer says only: "Powered by Blogger." Without a licence, US copyright law reserves all rights to the author. | [aswathdamodaran.blogspot.com](https://aswathdamodaran.blogspot.com/) (no notice found); [17 U.S.C. §107](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section107&num=0&edition=prelim) (fair use) | **? ? Y Y** (fair use; see notes) | **N N ? ?** | Medium. **UNCERTAIN** |
| 3 | Damodaran spreadsheets (`damodaran-spreadsheets`) | Saved cell values from the .xls/.xlsx files his posts link to. At most 12 passages per workbook. | "I have no problem with your use of any of the informatiion on this site but I will only ask two things of you. The first is that you do not try to commercially exploit the data on this site by turning around and selling it ... The second is that you acknowledge the parentage when you used the data from this site." | [NYU site guide, "Rules on using data and spreadsheets"](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/guide.html) | **Y Y Y Y** (with credit) | **? ? ? ?** | Medium. **UNCERTAIN (paid)** |
| 4 | Damodaran papers (`damodaran-papers`) | Full text of his PDFs. Pages with charts read by a vision model. Embedded, shown whole (≤300 words), quoted. | The same guide clause as row 3. The papers page itself has no terms. | [NYU site guide](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/guide.html); [papers page](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/papers.html) (no terms found) | **Y Y Y Y** (with credit) | **? ? ? ?** | Medium. **UNCERTAIN (paid)** |
| 5 | Yale ECON 251, Geanakoplos (`yale-econ-251`) | Lecture transcripts. Embedded, shown whole (≤300 words), quoted. | "You may not exercise any of the rights granted to You in Section 3 above in any manner that is primarily intended for or directed toward commercial advantage or private monetary compensation." OYC terms: "Premium Services: If your website provides and/or promotes services for which the user will be charged a fee (e.g., tutor services) ..." and "Marketing: ... you may be in violation of our “Terms of Use” if you require the user to enter an email address in order to view Open Yale Courses content". | [CC BY-NC-SA 3.0 US legal code](https://creativecommons.org/licenses/by-nc-sa/3.0/us/legalcode); [Open Yale Courses Terms of Use, §4–§6](https://oyc.yale.edu/terms) | **? ? ? ?** (email-gate clause) | **N N N N** | Paid: high. Beta: medium. **UNCERTAIN (beta)** |
| 6 | Yale ECON 252, Shiller (`yale-econ-252`) | Same as row 5. | Same as row 5. | Same as row 5. | **? ? ? ?** | **N N N N** | Paid: high. Beta: medium. **UNCERTAIN (beta)** |
| 7 | The Fed Explained, Federal Reserve Board (`fed-explained`) | Full text of the PDF. Chart pages read by a vision model. | "Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information." | [Board website disclaimer](https://www.federalreserve.gov/disclaimer.htm) (page "Last Update: August 02, 2024"); [17 U.S.C. §105](https://uscode.house.gov/view.xhtml?req=(title:17%20section:105%20edition:prelim)) | **Y Y Y Y** | **Y Y Y Y** | High |
| 8 | New York Fed explainer pages (`nyfed-explainers`) | 14 pages listed in `NYFED_PAGES` (`scripts/library/sources.py`), main content only. | "The New York Fed grants you a non-exclusive license, subject to the Terms, to use, copy, and distribute Content for your personal or business purposes. You may: ... Download, store, and use Content in any format or media, ... Copy and distribute the Content in any format or media, and ... Modify and create derivative works from the Content." | [NY Fed Terms of Use](https://www.newyorkfed.org/privacy/termsofuse) ("Last Updated: 6/9/2023") | **Y Y Y Y** (with its credit form) | **Y Y Y Y** (with its credit form) | High (medium on condition 5) |
| 9 | Anthropic PBC Form S-1 (`sec-anthropic-s1`) | The full filing, as one document cut into passages. | "Information presented on sec.gov is considered public information and may be copied or further distributed by users of the web site without the SEC's permission." | [SEC privacy and website policy, "Website Dissemination"](https://www.sec.gov/about/privacy-information) | **Y Y Y Y** | **Y Y Y Y** | Medium-high |

## Notes per source

### 1. OpenStax (UNCERTAIN in the beta, N if paid)

- The licence is CC BY-NC-SA 4.0. The GitHub README says the same: "*Principles of Finance 2e* is available under the Creative Commons Attribution-NonCommercial-ShareAlike License" ([repo](https://github.com/openstax/osbooks-principles-finance)).
- The licence grants rights "for NonCommercial purposes only" (§2(a)(1)). A paid offer is "directed towards ... monetary compensation". So a paid offer needs a separate licence from OpenStax.
- The book page adds an AI clause (quoted in the table). It also says: "Anyone who intends to incorporate this content ... into large language models, use it in AI offerings, use it commercially (including in print), and/or has questions about another use case is welcome to complete our reuse request form." Page dated "© Jul 6, 2026 OpenStax."
- **This AI clause touches the free beta.** The Tutor puts OpenStax passages into a Claude prompt. That is plausibly "ingested into ... generative AI offerings".
- Uncertain point: the AI clause is on the web page. It is not in the CC legal code or in the GitHub LICENSE file. Value It took the text from GitHub under the CC licence. A lawyer must say if the web-page clause binds Value It. The safe step is to ask.
- OpenStax moved its whole library to CC BY-NC-SA on 22 April 2026. It says this lets it "thoughtfully consider how commercial entities use our content" ([OpenStax licensing update](https://openstax.org/license)). So OpenStax expects requests like this one.
- For a beta, Creative Commons itself says that a for-profit reuser can still make a NonCommercial use: "NonCommercial turns on the use, not the identity of the reuser." ([CC wiki, NonCommercial interpretation](https://wiki.creativecommons.org/wiki/NonCommercial_interpretation)). But a free beta that leads to a paid product may be "directed towards commercial advantage". This is uncertain.
- Attribution rules for the beta: the licence requires "the URI or hyperlink to, this Public License" and to "indicate if You modified the Licensed Material" (§3(a)(1)). The book page asks for "Access for free at https://openstax.org/books/principles-finance-2e/pages/1-why-it-matters" on "every digital page view".
- Permission route: the [OpenStax reuse request form](https://riceuniversity.tfaforms.net/52).

### 2. Damodaran blog (UNCERTAIN)

- The blog has no licence. On 2026-11-14 the home page HTML has no "copyright", "all rights", "licence" or "terms" text. The only footer text is "Powered by Blogger."
- `scripts/library/sources.json` points this source's `licenceUrl` to the NYU site guide. That guide covers his NYU site (pages.stern.nyu.edu), not the Blogspot blog. **Correct that link.** The licence label "All rights reserved" is the correct default.
- Value It stores each post whole, reads its pictures with a model, and refreshes weekly. It shows and quotes at most 60 words with credit and a link.
- Without a licence, Value It depends on fair use (17 U.S.C. §107). The first factor is "the purpose and character of the use, including whether such use is of a commercial nature or is for nonprofit educational purposes". A free, small beta with 60-word quotes and links is a stronger case. A paid offer is a weaker case. Damodaran also sells classes and books, which matters for the fourth factor (market effect).
- Beta: store and embed are "?" because they copy whole posts. Show and quote (60 words, credit, link) are probably fair use.
- Paid: get permission for store and embed. Short quotes with credit may stay fair use, but this is uncertain.

### 3–4. Damodaran spreadsheets and papers (Y in the beta, UNCERTAIN if paid)

- His guide permits use with two conditions: no "commercially exploit[ing] the data on this site by turning around and selling it", and "acknowledge the parentage". It adds: "You have every right to use the data or spreadsheets that you find here as part of your regular occupation or research."
- His spreadsheets page says: "These spreadsheet programs are in Excel and are not copy protected. Download them and feel free to modify them to your own specifications." ([spreadsheets page](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/spreadsh.htm))
- The beta gives credit on every passage. So the beta meets both conditions.
- Paid: Value It does not sell his data as data. But a paid Tutor that shows his passages could be seen as "selling it". The rule is informal and not clear. Ask him.
- Some papers also appear in journals or books. A publisher can own the copyright of a published version. This is not checked paper by paper.
- The course also uses his spreadsheets for Case numbers (24 links to `adamodar` in `course/outline.yaml`, for example `TeslaJan2020DIY.xlsx`). Ask about this in the same email.

### 5–6. Yale ECON 251 and 252 (UNCERTAIN in the beta, N if paid)

- The OYC terms say: "Most of the lectures and course material within Open Yale Courses are licensed under a Creative Commons Attribution-Noncommercial-Share Alike 3.0 license". Third-party content in a lecture is not covered unless the Credits say so.
- The OYC terms define the limit more tightly than the CC licence: "Yale considers any use of Open Yale Courses and its content for the purpose of deriving profit or promoting a profit-based enterprise to be prohibited commercial use."
- **Paid: N.** The terms give fee-charging "tutor services" as an example of prohibited use. That is a near-exact description of a paid Value It.
- **Beta: uncertain.** The "Marketing" clause says a site "may be in violation" if it requires "the user to enter an email address in order to view Open Yale Courses content". Value It requires sign-in to see any passage or Tutor reply. Also, a free beta that promotes a later paid product may be "promoting a profit-based enterprise".
- The attribution form Yale asks for: "[Name], [Course Title] (Yale University: Open Yale Courses), http://oyc.yale.edu (Accessed Date). License: Creative Commons BY-NC-SA", plus a link to the licence or to the terms. The current credit line has no URL and no access date.
- Permission route: Yale Office of General Counsel. The terms warn that Yale "may not be able to respond to all questions".

### 7. The Fed Explained (Y, Y)

- The Board's site is in the public domain "unless otherwise indicated". The Board asks you to "cite to the Board as the source". The current credit line does this.
- 17 U.S.C. §105(a): "Copyright protection under this title is not available for any work of the United States Government".
- Exception: "any photo, graphic, or other material that is identified as being associated with a non-Board" source. The vision step can read a third-party chart into text. The risk is low.

### 8. New York Fed pages (Y, Y, with conditions)

- The licence covers "personal or business purposes". So a paid offer is permitted.
- Conditions to meet now (beta and paid):
  - Credit form. The terms say: "Otherwise, follow this format: “© [year] Federal Reserve Bank of New York. Content from the New York Fed subject to the Terms of Use at newyorkfed.org.”" The current credit line ("used under its Terms of Use") does not follow this form.
  - Changes: "If you modify any of the Content, you must clearly label the modified Content". "You may not modify the title or headline of the Content."
  - Reference rates: the pages `markets/reference-rates/sofr` and `markets/reference-rates/effr` are reference-rate information. They need this notice: "The [NAME OF DATA or CONTENT] is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the [DATA NAME] by [NAME OF PUBLISHER], does not [sanction] or [endorse] any particular republication, and has no liability for your use."
  - No endorsement: "You must not state or imply that the New York Fed endorses your use".
- Condition 5 (uncertain for paid): "If you distribute the Content, you must make the Content available with the same permissions, conditions, and restrictions set forth in these Terms. You may not impose more restrictive terms or conditions on the Content." A paywall probably does not break this. But Value It's own terms must not forbid Learners from reusing NY Fed text.
- None of the 14 pages are Liberty Street Economics posts or Staff Reports. Those have tighter "Use Restrictions". Do not add them without a separate licence.

### 9. Anthropic S-1 (Y, Y)

- The SEC permits copying of what it presents on sec.gov.
- Uncertain point: the SEC statement covers the SEC's dissemination. The filer can still own copyright in the text. Reuse of filings in paid products is common. The risk is low.
- The S-1 can contain third-party data (for example, market studies). Those parts can carry their own rights.
- The extractor declares a User-Agent and makes one request, as the EDGAR access rule asks.

### CNBC (not a Library source)

- `src/library/ingest.ts` blocks CNBC with the `BLOCKED` regex. That rule keeps CNBC *text* (the CNBC Buffett Archive) out of the Library. It is about storing articles.
- The jackpot widget shows one figure, the cash option, with the credit "CNBC, 24 October 2018" and a link (fixture in `src/widgets/case-data-view.test.tsx`; live Case Data is in the private database and was not checked).
- A figure is a fact. 17 U.S.C. §102(b) says copyright does not extend to "any idea, procedure, process, system, method of operation, concept, principle, or discovery" ([§102](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section102&edition=prelim)). One cited, linked figure is not a copy of CNBC content. **No conflict, in the beta or paid.**
- Accuracy note: CNBC's figure on 24 October 2018 was the estimate before the claim (about $877.8 million). The paid amount was $877,784,124 (Mega Millions and Reuters, both already in `course/outline.yaml`). If the widget shows the exact paid amount, credit the source that printed it.

## Fixes the beta needs now (no cost)

1. Show the licence as a link on `/passages/[id]`. `licence_url` is in the database but no page shows it. CC 4.0 §3(a)(1)(C) and CC 3.0 §4 require the licence link.
2. Say that passages are cut and cleaned (CC "indicate if You modified"; NY Fed "clearly label the modified Content").
3. Use each owner's credit form: OpenStax (page URL), Yale (URL and access date), NY Fed (the "©" form, plus the reference-rate notice on SOFR and EFFR passages).
4. Correct the `licenceUrl` of `damodaran-blog` in `scripts/library/sources.json`.
5. Send the OpenStax reuse request now. The AI clause applies to the beta.
6. Decide on Yale for the beta: ask Yale OGC, or accept the email-gate risk for a small invite-only group.

## What a paid offer would lose

Source: `scripts/library/eval/questions.json` (78 questions, used by `scripts/library-score.mjs`). A question counts for a source when its `expect` or `sources` names that source. Bare OpenStax module IDs count as OpenStax. The `scoped.source` author filters are not counted as sources.

Questions per source (one question can name two sources):

| Source | Questions that expect it |
|---|---|
| OpenStax | 44 |
| Yale ECON 252 | 9 |
| NY Fed | 8 |
| Damodaran papers | 8 |
| Yale ECON 251 | 6 |
| Damodaran blog | 4 |
| Anthropic S-1 | 4 |
| The Fed Explained | 3 |
| Damodaran spreadsheets | 0 |

Questions left with **no** expected source if Value It drops a group. The judged column also counts `alsoExpect` passages from other sources.

| Dropped | Questions lost (strict) | Lost (judged) |
|---|---|---|
| OpenStax only | 42 / 78 | 38 / 78 |
| Yale 251 + 252 | 11 / 78 | 10 / 78 |
| Damodaran blog + papers + spreadsheets | 11 / 78 | 11 / 78 |
| OpenStax + Yale (all NC sources) | 55 / 78 | 49 / 78 |
| OpenStax + Yale + Damodaran | **66 / 78** | 66 / 78 |

- If Value It drops every at-risk source, only 12 of 78 questions keep an expected source. They come from the Fed Explained, the NY Fed and the S-1.
- All 5 author-named questions are lost (3 Damodaran, 1 Shiller, 1 Geanakoplos).
- The Damodaran spreadsheets answer no score question. They are the cheapest source to drop.
- OpenStax is the largest loss by far. A licence from OpenStax is the most valuable permission.

## Ask Damodaran for permission?

**Yes. Ask now, before the paid offer.**

- The blog has no licence. Value It stores it whole and refreshes it weekly. Only the owner can permit that for a paid product.
- His site rule ("no resale", "acknowledge the parentage") fits a free beta. It is not clear for a paid tutor.
- His material answers 11 of 78 score questions and all 3 Damodaran author-named questions. The course also uses his spreadsheets in Cases.
- He invites email: "You can reach me by email at adamodar@stern.nyu.edu" and "I hope that you find the content useful and that you will share it with others." ([bio page](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/biomission.html))
- Context: a public "Damodaran Bot" built on his work exists ([damodaranbot.com](https://damodaranbot.com), named in a [podcast listing](https://podcasts.apple.com/in/podcast/authors-in-august-vasant-dhar-thinking-with-machines/id1017325738?i=1000782986894&l=or), 12 Aug 2026). So he has seen AI use of his writing before. He can also see Value It as a competitor. Do not assume a yes.
- If he says no: drop the blog from storage. Keep links to his posts. Keep his papers and spreadsheets only in a free tier, or drop them.

### Draft email (do not send; the owner sends it)

> **To:** adamodar@stern.nyu.edu
> **Subject:** Permission to quote your blog and papers in a small valuation course
>
> Dear Professor Damodaran,
>
> I am building Value It, an online course that teaches valuation the way you teach it: a story first, then the numbers. Learners study real Cases, such as your Amazon valuation of 2000. An AI tutor helps them, and it quotes sources with a credit and a link.
>
> Today the course is a free beta for a small invited group. Later I want to charge Learners. Before I do, I want your permission for these uses of Musings on Markets, your papers and the spreadsheets linked from your posts:
>
> 1. Keep the text in a private search index (not public, not for sale).
> 2. Let the tutor show short passages (at most 60 words from the blog), always with your name, the title and a link to the original.
> 3. Use numbers from your spreadsheets in Cases, with credit.
>
> I will not sell your data, train a model on your work, or present your words as mine. I will remove anything you ask me to remove. I am happy to give you free access to see how it works.
>
> Is this acceptable to you? If you prefer limits (for example, links only, or the free tier only), I will follow them.
>
> Thank you for everything you share so openly.
>
> Siddharth Muramkar
> [email] · [link to Value It]

## Sources

All checked on 2026-11-14.

- Creative Commons, [BY-NC-SA 4.0 legal code](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en) and [BY-NC-SA 3.0 US legal code](https://creativecommons.org/licenses/by-nc-sa/3.0/us/legalcode)
- Creative Commons wiki, [NonCommercial interpretation](https://wiki.creativecommons.org/wiki/NonCommercial_interpretation)
- OpenStax, [Principles of Finance 2e, licence box](https://openstax.org/books/principles-finance-2e/pages/1-why-it-matters); [licensing update, 22 Apr 2026](https://openstax.org/license); [Terms of Use](https://openstax.org/tos); [GitHub repo](https://github.com/openstax/osbooks-principles-finance)
- Open Yale Courses, [Terms of Use](https://oyc.yale.edu/terms)
- Aswath Damodaran, [site guide](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/guide.html); [spreadsheets page](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/spreadsh.htm); [papers page](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/papers.html); [bio page](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/biomission.html); [blog](https://aswathdamodaran.blogspot.com/)
- Federal Reserve Board, [website disclaimer](https://www.federalreserve.gov/disclaimer.htm)
- Federal Reserve Bank of New York, [Terms of Use](https://www.newyorkfed.org/privacy/termsofuse)
- SEC, [privacy and website policy](https://www.sec.gov/about/privacy-information)
- US Code, title 17: [§102](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section102&edition=prelim), [§105](https://uscode.house.gov/view.xhtml?req=(title:17%20section:105%20edition:prelim)), [§107](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section107&num=0&edition=prelim)
- Repo: `scripts/library/sources.json`, `scripts/library/sources.py`, `src/library/ingest.ts`, `src/library/prepare.ts`, `src/app/passages/[id]/page.tsx`, `scripts/library/eval/questions.json`, `scripts/library-score.mjs`

**Not legal advice.** Ask a lawyer before the paid launch.
