import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { inject } from "vitest";
import * as schema from "../db/schema";
import type { Db } from "../db/types";

/** A new in-memory Postgres with pgvector loaded, as Neon has it, and the real migrations applied. */
export async function migratedPglite(): Promise<PGlite> {
  const client = new PGlite({ extensions: { vector } });
  await migrate(drizzle({ client, schema }), { migrationsFolder: "./drizzle" });
  return client;
}

// Booting Postgres and replaying every migration is slow, and far slower when the machine is
// busy, so the global setup does it once and saves the result. Each test file loads that copy
// once and every test gets its own clone of it.
let template: Promise<PGlite> | undefined;

async function loadTemplate(): Promise<PGlite> {
  const dumpFile = inject("pgliteDump");
  if (!dumpFile) return migratedPglite(); // a config without the global setup
  const loadDataDir = new Blob([await readFile(dumpFile)]);
  return PGlite.create({ loadDataDir, extensions: { vector } });
}

/** A fresh in-memory Postgres with the real migrations applied (pgvector loaded, as Neon has it). */
export async function testDb(): Promise<Db> {
  template ??= loadTemplate();
  const client = (await (await template).clone()) as PGlite;
  return drizzle({ client, schema }) as unknown as Db;
}
