import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { assertE2eSafe, e2eEnabled } from "@/dev/e2e-mode";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

/**
 * The app's database: Neon over WebSockets on the pooled connection string. WebSockets
 * (unlike Neon's HTTP driver) allow interactive transactions, which the Tutor's tools use
 * to save an effect and its tool call ID together. Node 22+ has WebSocket built in.
 *
 * The browser test bed (`E2E=1`, never in production or on Vercel: assertE2eSafe throws) gets the in-memory
 * PGlite that src/instrumentation.ts parked on globalThis instead.
 */
export function getDb(): Db {
  assertE2eSafe(process.env);
  if (e2eEnabled(process.env)) {
    const e2e = (globalThis as { __faE2eDb?: Db }).__faE2eDb;
    if (!e2e) throw new Error("E2E=1, but the test database is not installed yet (src/instrumentation.ts).");
    return e2e;
  }
  db ??= drizzle({ client: new Pool({ connectionString: process.env.DATABASE_URL! }), schema }) as unknown as Db;
  return db;
}
