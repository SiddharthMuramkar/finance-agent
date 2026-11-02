import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/** A fresh in-memory Postgres with the real migrations applied (pgvector loaded, as Neon has it). */
export async function testDb(): Promise<Db> {
  const db = drizzle({ client: new PGlite({ extensions: { vector } }), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}
