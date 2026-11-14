// This module imports nothing, so `scripts/import-case-data.mjs` and the Course Map check
// (src/course/map.ts, which the scripts run directly with Node's type stripping) can use it.

/**
 * The reserved Case that holds reference series (gold, USD/INR, inflation, rates, index history).
 * It belongs to no Topic, so no Topic Case may use this id; its data is readable in any Topic,
 * clipped to the as-of date of an unrevealed Case when the Learner is in one.
 */
export const REFERENCE_CASE = "reference";

/**
 * The reference datasets that exist in the private database, by id. A written-ahead Widget may read
 * "reference/<id>" for these ids only. Keep this list in step with the import file.
 */
export const REFERENCE_DATASET_IDS: readonly string[] = [
  "gold-inr-10g",
  "gold-usd-oz",
  "usd-inr",
  "cpi-india",
  "repo-rate",
  "sensex-close",
  "nifty-close",
  "fd-rate-typical",
  "ppf-rate",
  "savings-rate-typical",
  "ust-10y",
  "ust-30y",
];
