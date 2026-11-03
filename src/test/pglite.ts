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

// Every PGlite client this file creates, so src/test/setup.ts can close them all after the
// test file. Each one holds a WASM Postgres heap; unclosed, they pile up until the runner dies.
const open = new Set<PGlite>();

/** Marks the databases that exist now, so closeDbsSince can close only the ones a test made. */
export function markTestDbs(): Set<PGlite> {
  return new Set(open);
}

/** Closes the clones made since the mark (the template stays for the next test). */
export async function closeDbsSince(mark: Set<PGlite>): Promise<void> {
  const fresh = [...open].filter((c) => !mark.has(c));
  for (const c of fresh) open.delete(c);
  await Promise.allSettled(fresh.map((c) => (c.closed ? undefined : c.close())));
}

/** Closes every database testDb() made (clones and template) and forgets them. */
export async function closeAllTestDbs(): Promise<void> {
  const clients = [...open, ...(template ? [await template] : [])];
  open.clear();
  template = undefined;
  await Promise.allSettled(clients.map((c) => (c.closed ? undefined : c.close())));
}

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
  open.add(client);
  return drizzle({ client, schema }) as unknown as Db;
}
