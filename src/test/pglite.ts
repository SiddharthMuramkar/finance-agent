import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { inject } from "vitest";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

// The migrated data directory is built once per run in src/test/global-setup.ts.
let migrated: Promise<Blob> | undefined;

/** A fresh in-memory Postgres with the real migrations applied (pgvector loaded, as Neon has it). */
export async function testDb(): Promise<Db> {
  migrated ??= readFile(inject("pgliteDataDir")).then((bytes) => new Blob([bytes]));
  const client = await PGlite.create({ loadDataDir: await migrated, extensions: { vector } });
  return drizzle({ client, schema }) as unknown as Db;
}
