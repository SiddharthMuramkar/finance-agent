# Library search with a reranker (#28)

This file gives the results of the reranker prototype on 15 November 2026. Compare it with [`rag-baseline.md`](rag-baseline.md) (#24).

- Database: Neon branch `rag-baseline-2026-11-14` (the same branch as #24). All queries were read-only.
- Search: the app's search (`src/library/search.ts`): BM25 + Voyage `voyage-4` vectors, fused by RRF. Each ranking gives 30 candidates, so the merged list has 30 to 60 passages.
- Reranker: `scripts/library-score.mjs --voyage --rerank=<model> --pool=<n>`. The scorer takes the merged top n, sends heading + text of each passage to Voyage `/v1/rerank` with `top_k: 5`, and keeps the 5 that Voyage returns. Only the scorer changed. The app did not change.
- Runs: one run for each setting, one run at a time, from the laptop. Raw output: [`rerank-runs/`](rerank-runs/).
- Prices: [docs.voyageai.com/docs/pricing](https://docs.voyageai.com/docs/pricing) (page dated 2026-09-29): `rerank-3-lite` $0.02 and `rerank-3` $0.05 for each million tokens, after 200 million free tokens for each model. Tokens = query tokens × documents + document tokens.

## Numbers

Each cell gives hits@1 · hits@5 · MRR. "Added latency" is search + rerank minus the search without a reranker (642 ms p50, 687 ms p95). "Cost" assumes one search for each Tutor turn, after the free tokens.

| Run | 78 questions | Signal 12, no as-of | Signal 12, with as-of | Added latency p50 / p95 | Rerank call p50 / p95 | Tokens per search (mean / max) | Cost per 1,000 turns |
|---|---|---|---|---|---|---|---|
| No rerank (baseline, re-run) | 59 · 72 · 0.82 | 5 · 9 · 0.57 | 4 · 9 · 0.49 | – | – | – | $0 |
| rerank-3-lite, top 20 → 5 | 59 · 73 · 0.83 | 8 · 10 · 0.70 | 5 · 9 · 0.52 | +551 / +641 ms | 365 / 468 ms | 6,544 / 10,687 | $0.13 |
| rerank-3, top 20 → 5 | 60 · 73 · 0.83 | 8 · 10 · 0.71 | 5 · 10 · 0.54 | +586 / +596 ms | 378 / 402 ms | 6,544 / 10,687 | $0.33 |
| rerank-3-lite, top 30 → 5 | 60 · 71 · 0.83 | 7 · 9 · 0.64 | 5 · 9 · 0.52 | +669 / +807 ms | 375 / 409 ms | 9,933 / 16,025 | $0.20 |
| rerank-3, top 30 → 5 | 60 · 71 · 0.82 | 7 · 10 · 0.66 | 5 · 10 · 0.54 | +676 / +766 ms | 387 / 428 ms | 9,933 / 16,025 | $0.50 |
| rerank-3-lite, top 50 → 5 | 60 · 70 · 0.82 | 7 · 8 · 0.63 | 5 · 7 · 0.49 | +681 / +828 ms | 388 / 522 ms | 15,491 / 28,411 | $0.31 |
| rerank-3, top 50 → 5 | 61 · 71 · 0.83 | 7 · 9 · 0.65 | 5 · 10 · 0.52 | +675 / +813 ms | 392 / 463 ms | 15,491 / 28,411 | $0.77 |

The re-run baseline is the same as #24: 78 questions 59 · 72 · 0.82; Signal with as-of MRR 0.49.

### Questions that moved (better / worse / same rank, against no rerank)

| Run | 78 questions | Signal, no as-of | Signal, with as-of |
|---|---|---|---|
| rerank-3-lite, top 20 | 10 / 9 / 59 | 4 / 1 / 7 | 3 / 3 / 6 |
| rerank-3, top 20 | 11 / 9 / 58 | 4 / 1 / 7 | 4 / 3 / 5 |
| rerank-3-lite, top 30 | 9 / 9 / 60 | 2 / 1 / 9 | 3 / 3 / 6 |
| rerank-3, top 30 | 11 / 10 / 57 | 3 / 1 / 8 | 4 / 3 / 5 |
| rerank-3-lite, top 50 | 9 / 10 / 59 | 2 / 1 / 9 | 3 / 3 / 6 |
| rerank-3, top 50 | 10 / 10 / 58 | 2 / 1 / 9 | 3 / 4 / 5 |

## What the numbers say

1. On the 78 general questions, the reranker does not help. MRR changes by +0.01 or less. It moves about 20 questions, and about half of them get worse.
2. On the 12 Signal questions with no as-of limit, top 20 helps: hits@1 goes from 5 to 8, MRR from 0.57 to 0.70 (lite) or 0.71 (full).
3. With the Case's as-of date (how the Tutor searches during a Case), the gain is small: MRR 0.49 → 0.52 (lite) or 0.54 (full). One question that moves from rank 2 to rank 1 changes MRR by 0.04 on this set, so this gain is about one question. 3 or 4 questions get better and 3 get worse.
4. A bigger pool is worse. Top 30 and top 50 lose hits@5 on the 78 questions and on Signal, and cost more tokens.
5. `rerank-3` and `rerank-3-lite` are within one question of each other. `rerank-3` costs 2.5 times more.
6. Latency stays inside the 5 s budget: search + rerank is 1.2–1.3 s p50 and 1.3–1.5 s p95 from the laptop. Of the added time at top 20, about 370 ms is the Voyage call and about 200 ms is the larger database result (20 full passages, not 5).
7. Side effects: the author-named check "name left in the query" falls from 4/5 to 3/5 in 5 of 6 runs; the scoped check falls from MRR 1.00 to 0.90. With `rerank-3`, the hindsight probe "Anthropic IPO prospectus valuation" (as of 2018-10-24) now shows a pre-2018 dated blog post that mentions 2021, so 7 of 9 probes are clean (8 of 9 before). The as-of rule did not change; the reranker only moves that passage up.

## Limits of this test

- One run for each setting. Voyage and Neon latency change from run to run.
- Latency is from the laptop to Neon (Singapore) and Voyage. The app runs in Vercel `sin1`, so the numbers there will be different.
- 12 Signal questions is a small set. One question changes MRR by 0.04 to 0.08.
- The reranker cannot find passages that the as-of rule hides (the Yale 252 `latestYear()` bug from #24, and old Cases that see about 10% of the Library).
