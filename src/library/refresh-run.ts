// What the health check (src/alerts/health.ts) reads about the weekly refresh's runs, kept out of refresh.ts so the
// health route does not load the Library's parsers.

/** A run still `running` after this long is dead (the function was cut off); the next run marks it failed. */
export const STALE_AFTER_MS = 10 * 60_000;
