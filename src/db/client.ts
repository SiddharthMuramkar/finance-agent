import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

/** The app's database: Neon over HTTP on the pooled connection string. */
export function getDb(): Db {
  db ??= drizzle({ client: neon(process.env.DATABASE_URL!), schema }) as unknown as Db;
  return db;
}
