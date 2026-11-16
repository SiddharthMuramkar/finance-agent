# New Library sources: eval results (#38), 2026-11-15

## Summary

- We loaded the new sources on the Neon eval branch `eval-2026-11-15`. Production is not changed.
- The first run failed two bars. FOMC records and SEC filings pushed general answers out of the top 5.
- We tested 9 search changes. We chose "A2": each document gives 1 passage, and each source gives 2 documents (the archive gives 1).
- With A2, Voyage search gets 75/78, hits@1 58, MRR 0.8271. All bars pass.
- The Signal Case score with the as-of date is 0.461. This is better than after the load (0.419), but less than the old 0.489.

## 1. What we loaded

All steps ran on the eval branch. We checked the branch before each write step.

| Source | Documents | Passages | Words | Left out |
|---|---|---|---|---|
| `openstax-principles-finance-1e` | 130 | 1,043 | 191,280 | 0 |
| `fomc-historical` (1979-2001) | 227 | 4,013 | 909,015 | 15 damaged pages, 49 title pages |
| `sec-amazon-1997-2000` | 9 | 765 | 149,015 | 8 title pages |
| `sec-webvan-1999-2001` | 4 | 749 | 142,877 | 2 title pages |
| `sec-wework-s1-2019` | 1 | 801 | 200,247 | 1 damaged page (35 words repaired) |
| `investor-gov-explainers` | not loaded | | | See section 7 |

Other steps:

- We dropped the old textbook, `openstax-principles-finance-2e` (1,043 passages).
- We restamped the Library. This fixed the credits on 4 sources and the dates on 5 sources.
- We embedded 7,371 new passages with Voyage (2.3M tokens).
- Cases from 1999 to 2001 now see 26-30% of the Library (before: about 10%). A 1987 Case sees 15.4% (before: 10.1%).

The 2e entry stays in `scripts/library/sources.json` for now. `src/library/credits.test.ts` needs it.
Production still stores the 2e passages, and their credit comes from this entry. Remove the entry
and that test after the production drop.

## 2. The first run

78 questions. The baseline is the old Library (2e). Higher is better.

| Run | hits@5 | hits@1 | MRR | Signal-12, as of the Case |
|---|---|---|---|---|
| Voyage, baseline | 72/78 | 59 | 0.82 (0.817) | 0.489 |
| Voyage, new Library, no fix | 70/78 | 58 | 0.80 (0.804) | 0.419 |
| Keyword, baseline | 68/78 | 49 | 0.72 | |
| Keyword, new Library, no fix | 65/78 | 46 | 0.68 | |

The cause is crowding. The archive (FOMC records and SEC filings) has about 6,300 passages. These
records share words and meaning with many general questions. But they report events. They do not
teach. In an unscoped search, they took places in the top 5 from the teaching text. The new textbook
pages were mapped correctly. We checked this.

## 3. The candidates

Each change applies only to a search that is not scoped to a source. Voyage, 78 questions. The MRR is not
rounded. "Probes" is the Voyage probe run. One line for each candidate:

| Name | Change | hits@5 | MRR | Signal as-of | Probes | Bars |
|---|---|---|---|---|---|---|
| A | At most 2 passages from each source lead the list; archive sources 1 | 73/78 | 0.8182 | 0.444 | 19/19 | FAIL: MRR |
| B (0.5) | Multiply an archive passage's score by 0.5, if the query does not name it | 71/78 | 0.8167 | 0.419 | 18/19 (Webvan, known) | FAIL: hits@5, MRR |
| B (0.8) | The same, with 0.8 | 70/78 | 0.8038 | 0.419 | 18/19 (Webvan, known) | FAIL: hits@5, MRR |
| C | Rank teaching text in its own pools; top 4 teaching, then the best archive passage | 71/78 | 0.8177 | 0.503 | 19/19 | FAIL: hits@5, MRR |
| A2 | A, plus 1 passage from each document; the source cap counts documents | 75/78 | 0.8271 | 0.461 | 19/19 | PASS |
| A2 (n2) | 1 passage from each document, 2 documents from each source, no archive cap | 75/78 | 0.8250 | 0.461 | 19/19 | PASS |
| AC | A's cap of 2, plus one last place for the archive, with a score floor | 73/78 | 0.8246 | 0.468 | 19/19 | PASS |
| A2+AC | AC, plus A2's cap: 1 passage from each document, the source cap counts documents | 75/78 | 0.8335 | 0.485 | 18/19 (QE lecture) | FAIL: probes |

C added 150-250 ms to each search.

A2+AC has the best scores. But its Voyage probes are not clean. For the probe "quantitative easing balance sheet
expansion of the Federal Reserve" (as of 2008-06-01), an ECON 252 lecture gets into the top 5. The lecture names
quantitative easing and gives no year, so the year rule cannot stop it. This is a real outcome word, not the known
Webvan false flag. A2 and AC keep this lecture out of the Voyage top 5.

Keyword runs of the 3 finalists (78 questions):

| Name | hits@5 | hits@1 | MRR | Signal as-of | Probes |
|---|---|---|---|---|---|
| A2 | 71/78 | 46 | 0.7145 | 0.535 | 17/19 |
| AC | 70/78 | 47 | 0.7060 | 0.625 | 17/19 |
| A2+AC | 71/78 | 47 | 0.7220 | 0.625 | 17/19 |

## 4. The fix we chose: A2

We used this order to choose from A2+AC, A2 and AC:

1. The candidate passes all bars. A2+AC fails the probes bar. A2 and AC pass.
2. The candidate has the higher Voyage hits@5. A2 has 75/78. AC has 73/78. We chose A2.

A2 also has the higher MRR (0.8271, against 0.8246 for AC). AC has a higher Signal as-of MRR (0.468, against
0.461), but the order puts hits@5 first. Against AC, A2 finds 2 more answers ("a payment that goes on forever" at
rank 5, "forward and futures contracts" at rank 4). It moves 2 answers up and 1 answer down by one place.

How the search works now, when it is not scoped to a source:

1. A document is the part of a passage ref before `#`: one chapter module, lecture, paper, post or filing.
2. Each document gives only its best passage to the lead of the list.
3. Each source gives its best 2 documents to the lead. An archival source gives 1 document.
4. An archival source has an id that starts with `fomc-` or `sec-`. These are the FOMC records, the Amazon,
   Webvan and WeWork filings, and the Anthropic S-1.
5. The lead is in fused order. All other passages come after the lead, also in fused order.

A search scoped to a source keeps the fused order. The 4 Anthropic S-1 questions stay at rank 1.

Why A2:

- It passes all bars, and it has the most Voyage hits@5 of the candidates that pass.
- It keeps one pool and one ORDER BY. It adds no clear time: p50 521 ms in the test run, against 529 ms for AC.
- It has no score floor and no special place for the archive. Its code is shorter than the code of AC.

The code is in `src/library/search.ts`. The tests are in `src/library/search.test.ts` (7 cases). They cover the
cap of 2 for a source, the cap of 1 for an archival source (`fomc-` and `sec-`), the cap of 1 passage for a
document, the order of the other passages, and the fused order of a scoped search. The commit on this branch
takes only the fix. It does not include the #37 reranker code.

## 5. Final numbers

We ran the final scores from this branch, on the eval branch.

| Run | hits@5 | hits@1 | MRR | Signal-12, as of the Case |
|---|---|---|---|---|
| Voyage, baseline | 72/78 | 59 | 0.82 (0.817) | 0.489 |
| Voyage, final (A2) | 75/78 (96%) | 58 | 0.8271 | 0.461 |
| Keyword, baseline | 68/78 | 49 | 0.72 | |
| Keyword, final (A2) | 71/78 (91%) | 46 | 0.7145 | 0.535 |

Other results (Voyage, final):

- Judged hits@5: 77/78.
- Author-named questions, scoped to the source: 5/5, MRR 1.00.
- Signal-12 with no as-of date: hits@5 9/12, MRR 0.542.
- The rank of each question is the same as in the A2 test run, in both modes.

The 3 questions that Voyage still misses:

- "Why is a dollar today worth more than a dollar next year?"
- "How should operating leases and R&D expenses be treated in valuation?"
- "Robert Shiller on bubbles and irrational exuberance"

## 6. The bars

| Bar | Final (A2) | Result |
|---|---|---|
| Voyage hits@5 at least 72/78 | 75/78 | PASS |
| Voyage MRR at least 0.82 (not rounded) | 0.8271 | PASS |
| Probes clean (one known false flag) | Voyage 19/19 | PASS |
| Author-scoped MRR stays 1.00 | 1.00 | PASS |
| Old Cases see clearly more than ~10% of the Library | 1999-2001 Cases 26-30%, 1987 Case 15.4% | PASS |
| Secondary: Signal-12 as-of MRR, old baseline 0.49 | 0.461 | Less than the baseline |

The MRR margin is small (0.007). One question that moves from rank 1 to rank 2 changes the MRR by about 0.006.

## 7. Probes, and the SEC investor-education pages

The probes check that a search with a Case's as-of date does not show the outcome (hindsight).

- Voyage search: 19/19 clean.
- Keyword search: 17/19. The app uses keyword search only when Voyage is not available.
  - "Webvan cash burn and funding" (as of 2001-04-02). A Webvan filing of that day says "ceased
    operations" about a facility that closed in February 2001. This was public on that date. This is
    the known false flag.
  - "quantitative easing balance sheet expansion of the Federal Reserve" (as of 2008-06-01). An ECON 252
    lecture names quantitative easing and gives no year, so the year rule cannot find it. Before the
    cap, FOMC records hid this lecture. The first keyword run had 18/19. With A2+AC, the Voyage search
    also shows this lecture (see section 3).
- No Signal Case outcome words got through, in any run.

The SEC investor-education explainers (`investor-gov-explainers`) are not loaded. The site returns 403 to the
fetcher. The fetcher skips and lists each page that fails. This is a follow-up.

## 8. Next step

1. Take a Neon snapshot of the production branch. This lets us go back.
2. Load the same sources to production, in the same order: load, drop 2e, restamp, embed.
3. Score again on production, with Voyage and with keyword, and run the probes.
4. Then remove the 2e entry from `sources.json` and the credits test that needs it.
5. Follow-up: load the SEC investor-education explainers when the fetcher can get them.

The eval branch expires on 2026-11-18. Raw outputs: `2026-11-15-sources-final-voyage.txt` and
`2026-11-15-sources-final-keyword.txt`, and their `-ranks` files, in the eval-runs folder.
