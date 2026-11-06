// Topics whose file still has a typed Quick try or a stem that asks for a sum (lint L10, ADR 0009). Batch PRs (D2, E6)
// rewrite them and delete their ids. The list can only shrink: a Topic on it with no L10 hit must come off, and a
// Topic off it with a hit fails. One id per line, sorted, so batch PRs merge cleanly. Never add an id.
export const L10_NOT_YET_STORY: readonly string[] = [
  "fs-capex-dep",
  "fs-cashflow",
  "fs-income",
  "fs-leases-debt",
  "fs-ratios",
  "fs-revenue-runrate",
];
