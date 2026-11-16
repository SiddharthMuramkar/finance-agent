# Reranker re-test (#37), 2026-11-15

Decision: **parked.** The scorer flags (`--rerank`, `--pool`) and the 12 Signal questions stay. Product search does not change. It does not rerank.

## What we tested

- We tested a reranker. A reranker is a second step that puts the search results in a new order.
- We tested two Voyage models: rerank-3-lite and rerank-3.
- We tested two pool sizes: 20 and 30. The pool is the number of results the reranker reads before it keeps the top 5.
- We compared each setting with the base search (no reranker).
- The first runs used a Neon branch copy (eval-2026-11-15) with the old library (OpenStax 2e). No new sources were loaded.
- All runs used Voyage search. All runs started from the VPS, one at a time. Each setting ran one time.
- The runs wrote nothing to the database.

## Results on the old library

Each cell shows hits@1 · hits@5 · MRR. Higher is better.
"Added time" is the extra search time with the reranker. Base search time is 468 ms (p50) and 513 ms (p95).

| Setting | 78 general questions | 12 Signal questions, no date | 12 Signal questions, with date | Added time p50 / p95 | Cost per 1,000 turns* | Hindsight probes clean | Source-scoped MRR |
|---|---|---|---|---|---|---|---|
| Base (no reranker) | 59 · 72 · 0.82 | 5 · 9 · 0.57 | 4 · 9 · 0.49 | – | $0 | 14/15 | 1.00 |
| rerank-3-lite, pool 20 | 59 · 73 · 0.83 | 8 · 10 · 0.70 | 5 · 9 · 0.52 | +225 / +426 ms | $0.13 | 12/15 | 0.90 |
| rerank-3, pool 20 | 60 · 73 · 0.83 | 8 · 10 · 0.72 | 5 · 10 · 0.54 | +169 / +326 ms | $0.33 | 12/15 | 0.90 |
| rerank-3-lite, pool 30 | 59 · 71 · 0.82 | 7 · 9 · 0.64 | 5 · 9 · 0.52 | +169 / +330 ms | $0.20 | 14/15 | 0.90 |
| rerank-3, pool 30 | 60 · 71 · 0.82 | 7 · 10 · 0.66 | 5 · 10 · 0.54 | +227 / +308 ms | $0.50 | 13/15 | 0.90 |

*We calculated the cost from token counts. We used the prices in the #28 notes. We did not check these prices again. Both models have 200M free tokens, so these runs probably cost $0.

Notes:

- The quality numbers agree with #28 (difference 0.01 MRR or less).
- On the 78 general questions, about 10 questions got better and 9-10 got worse in every run.
- On the Signal questions with a date, 3-4 got better and 3 got worse.
- The added time is lower than in #28 (#28: +0.55 to +0.68 s). The reason: the VPS is nearer to Voyage than the laptop. Database time changes by up to 60 ms between runs, so these times are approximate.
- Hindsight problems at pool 20: some WeWork 2019 probes now show a blog post that mentions 2023. With rerank-3, one Anthropic probe (date 2018-10-24) shows a post that mentions 2021.
- No outcome words got through in any run.

## Why we parked it

- The reranker is fast enough. It adds about 0.2 s (p50) and 0.3-0.4 s (p95). The limit is about 0.6 s.
- But the gain is too small.
- On the 78 general questions, MRR goes up by 0.01 or less. About the same number of questions get worse as get better.
- On the Signal questions with a date, MRR goes from 0.49 to 0.52-0.54. The Tutor uses this type of search during a Case. This gain is about one question.
- The gain without a date (0.57 to 0.70) does not help, because the Tutor does not search that way.
- The best setting (pool 20) causes a new hindsight problem: WeWork passages that mention 2023 now show.
- All reranker settings make source-scoped search worse (MRR 1.00 to 0.90).
- Pool 30 removes most of the hindsight problem. But hits@5 on the 78 questions falls below base (71 against 72).

## On the new Library (#38 sources)

We ran the scorer again on the merged library (#38 sources).

- Base Voyage search: 70/78 in the top 5. hits@1 is 58. MRR is 0.804. Signal MRR with the as-of date is 0.42.
- rerank-3-lite, pool 20: 73/78 in the top 5. MRR is 0.818. Signal MRR with the as-of date is 0.46. It adds about 0.3 s per search.
- The gain is still small. Signal MRR with a date stays low with or without the reranker.
- Decision: still parked. Re-test after the #38 ranking fix.

## When to test again

- After the #38 ranking fix is merged.
- Run base Voyage and rerank-3-lite, pool 20, one more time. Use the current question set.
- Compare Signal MRR with the as-of date. Check the WeWork hindsight probes.

## How to re-run

Run these from a worktree of the feat-37-reranker branch. Use a Neon branch copy for evals only, never the main branch. Run the eval guard first. The eval env file holds the keys. It is outside the repo. Do not print it.

```
node --env-file=<eval env file> scripts/library-score.mjs --voyage
node --env-file=<eval env file> scripts/library-score.mjs --voyage --rerank=rerank-3-lite --pool=20
node --env-file=<eval env file> scripts/library-score.mjs --voyage --rerank=rerank-3 --pool=20
node --env-file=<eval env file> scripts/library-score.mjs --voyage --rerank=rerank-3-lite --pool=30
node --env-file=<eval env file> scripts/library-score.mjs --voyage --rerank=rerank-3 --pool=30
```

Run one command at a time, through gate.sh. The full outputs are kept outside the repo, with the eval runs.
