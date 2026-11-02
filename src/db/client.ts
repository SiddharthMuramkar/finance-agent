import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

/**
 * The app's database: Neon over WebSockets on the pooled connection string. WebSockets
 * (unlike Neon's HTTP driver) allow interactive transactions, which the Tutor's tools use
 * to save an effect and its tool call ID together. Node 22+ has WebSocket built in.
 */
export function getDb(): Db {
  db ??= drizzle({ client: new Pool({ connectionString: process.env.DATABASE_URL! }), schema }) as unknown as Db;
  return db;
}
