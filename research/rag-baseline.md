# Library search baseline (#24)

This file gives the Library search numbers on 14 November 2026. Use them to compare every later RAG change.

- Database: Neon branch `rag-baseline-2026-11-14`, a fresh child of `main`. All queries were read-only.
- Questions: `scripts/library/eval/questions.json`. It has the 78 questions from #20 and #21, plus 12 new Signal Case questions. The total is 90.
- Keyword ranking: BM25 (the branch has the `lakebase_bm25` index).
- Vectors: Voyage `voyage-4`, 1024 dimensions. The run made 1 batched Voyage call.
- Raw output: [`rag-baseline-raw.txt`](rag-baseline-raw.txt).

## Numbers

A question scores a hit when a passage that answers it is in the top 5 results. hits@1 counts a hit in first place. MRR is the mean reciprocal rank (1.00 is best).

| Measure | Keyword only | Keyword + Voyage |
|---|---|---|
| **78 questions from #20/#21:** hits@5 | 68/78 (87%) | 72/78 (92%) |
| hits@1 | 49/78 | 59/78 |
| MRR | 0.72 | 0.82 |
| **All 90 questions:** hits@5 | 76/90 (84%) | 81/90 (90%) |
| hits@1 | 54/90 | 64/90 |
| MRR | 0.69 | 0.78 |
| Judged hits@5 (also counts `alsoExpect`) | 83/90 (92%) | 86/90 (96%) |
| **Author-named (5):** name in the query | 4/5 | 4/5 |
| Scoped by the source filter | 5/5, MRR 1.00 | 5/5, MRR 1.00 |
| **Signal Case questions (12), no as-of limit:** hits@5 | 8/12 | 9/12 |
| hits@1, MRR | 5/12, 0.51 | 5/12, 0.57 |
| **Signal Case questions (12), with the Case's as-of date:** hits@5 | 9/12 | 9/12 |
| hits@1, MRR | 5/12, 0.57 | 4/12, 0.49 |
| **Hindsight probes (9):** no later event in the top 5 | 8/9 | 8/9 |

### Per source (the 78 questions; Signal questions are not in these counts)

| Source | Keyword only | Keyword + Voyage |
|---|---|---|
| openstax-principles-finance-2e | 36/42 | 39/42 |
| yale-econ-251 | 6/6 | 6/6 |
| yale-econ-252 | 4/7 | 5/7 |
| fed-explained | 3/3 | 3/3 |
| nyfed-explainers | 5/5 | 5/5 |
| damodaran-papers | 7/8 | 7/8 |
| damodaran-blog | 3/3 | 3/3 |
| sec-anthropic-s1 | 4/4 | 4/4 |

### Signal Cases, hits@5 (no as-of limit / with the Case's as-of date)

| Case (as-of) | Questions | Keyword only | Keyword + Voyage |
|---|---|---|---|
| Mega Millions (2018-10-24) | 3 | 2/3 / 2/3 | 2/3 / 2/3 |
| Amazon (2000-02-03) | 2 | 1/2 / 1/2 | 2/2 / 1/2 |
| WeWork (2019-08-14) | 2 | 2/2 / 2/2 | 2/2 / 2/2 |
| Fed rates, basis points (1994-02-03) | 2 | 2/2 / 2/2 | 2/2 / 2/2 |
| Compounding, Sensex (1992-03-31) | 3 | 1/3 / 2/3 | 1/3 / 2/3 |

### Hindsight probes

8 of 9 probes are clean in both runs. The probe "inflation in 2021 and 2022" (as of 2018-10-24) is flagged. Damodaran spreadsheets dated before the as-of date mention 2019 to 2022 (2 in the keyword run, 1 with Voyage). These are probably forecast columns. The as-of rule does not check the years inside dated passages.

### Embeddings

No passage is without an embedding. All 21,993 passages in 9 sources have a vector.

### Passages the as-of rule hides

The rule is the one in `src/library/search.ts`. The Library has 21,993 passages. The course has 126 Case entries on 76 as-of dates. The raw file has the full table.

| As-of date (Cases) | Hidden | OpenStax | Yale 251 | Yale 252 | Fed | NY Fed | Damodaran blog | Damodaran papers | Damodaran sheets | S-1 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1992-03-31 (Sensex) | 19,753 (90%) | 163 | 74 | 942 (all) | 79 | 27 | 6,572 (all) | 4,022 (all) | 6,490 (all) | 1,384 (all) |
| 1994-02-03 (Fed 1994) | 19,753 (90%) | 163 | 74 | 942 (all) | 79 | 27 | 6,572 (all) | 4,022 (all) | 6,490 (all) | 1,384 (all) |
| 2000-02-03 (Amazon) | 19,714 (90%) | 160 | 64 | 942 (all) | 78 | 26 | 6,572 (all) | 3,998 | 6,490 (all) | 1,384 (all) |
| 2018-10-24 (Mega Millions) | 8,048 (37%) | 121 | 0 | 0 | 48 | 14 | 3,161 | 0 | 3,320 | 1,384 (all) |
| 2019-08-14 (WeWork) | 7,575 (34%) | 120 | 0 | 0 | 45 | 14 | 2,912 | 0 | 3,100 | 1,384 (all) |

- Every Case up to 2001-12-01 has about 90% of the Library hidden.
- 58 of the 126 Case entries (39 dates) are before 2012. For all of them, Yale 252 is fully hidden.
- No Damodaran passage about Amazon, WeWork, the Sensex or basis points is dated on or before its Case's date.

## What is weak

1. Old Cases see only 10% of the Library. Before 2002, the as-of rule hides about 19,700 of 21,993 passages.
2. Yale 252 (Shiller) is hidden for every Case before 2012. `latestYear()` reads the heading, and each heading says "(2011)".
3. Compounding questions score worst: Sensex 1/3 with no as-of limit, in both runs. Growth-rate and average-return questions miss.
4. Long Yale 251 and Damodaran passages push the textbook out of the top 5. Examples: "dollar today", beta, debt and taxes, hedging.
5. Voyage helps the general set (+4 hits@5, +10 hits@1). With the as-of date, Signal hits@1 falls from 5 to 4, MRR from 0.57 to 0.49.

## Notes

- The Signal questions use strict expected sources. Some top-5 passages may answer the question but do not count (for example, Yale 251 lecture 10 on "rates go up"). Nobody read those passages for this run.
- Two script changes support this run. `scripts/library-score.mjs` scores Signal questions apart, with and without the Case's as-of date. With `--voyage` it embeds all queries in batched calls. The vectors are the same; only the number of calls changes.
- To run again: put the database URL in `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (the script reads `DATABASE_URL_UNPOOLED` first). Then run `npm run library:score` and `npm run library:score -- --voyage`.
