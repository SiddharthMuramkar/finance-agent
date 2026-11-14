import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * The browser test bed's database (spec 2026-11-05, T-00): one in-memory PGlite with pgvector and the real
 * migrations, parked on `globalThis` so the proxy and every route (separate module graphs in `next dev`) share
 * it. Memory only, so every server start is clean. Loaded only from src/instrumentation.ts behind the E2E flag,
 * so a production build never contains it (scripts/check-no-e2e-in-build.mjs checks).
 */
declare global {
  var __faE2eDb: Db | undefined;
  var __faE2eIsPglite: boolean | undefined;
  var __faE2eDbReady: Promise<Db> | undefined;
}

async function build(): Promise<Db> {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  globalThis.__faE2eDb = db as unknown as Db;
  globalThis.__faE2eIsPglite = true;
  return globalThis.__faE2eDb;
}

/** Builds and migrates the test database once per process; a second call returns the same client. */
export function installE2eDb(): Promise<Db> {
  globalThis.__faE2eDbReady ??= build();
  return globalThis.__faE2eDbReady;
}
