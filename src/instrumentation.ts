import { e2eEnabled } from "./dev/e2e-mode";

/**
 * Runs once when the server starts. Only the browser test bed (spec 2026-11-05, T-00) uses it: with `E2E=1` it
 * builds the in-memory PGlite before the first request. The `NODE_ENV` test is replaced at build time, so a
 * production build drops the import (and PGlite) entirely; getDb() refuses E2E in production as well.
 */
export async function register() {
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_RUNTIME === "nodejs" && e2eEnabled(process.env)) {
    const { installE2eDb } = await import("./dev/e2e-db");
    await installE2eDb();
  }
}
