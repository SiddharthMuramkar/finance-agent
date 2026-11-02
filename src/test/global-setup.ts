import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    pgliteDataDir: string;
  }
}

/**
 * Runs the real migrations once per test run and saves the resulting Postgres data directory.
 * Each test's `testDb()` starts a fresh database from this copy, so no test pays for (or times
 * out on) running every migration itself.
 */
export default async function setup(project: TestProject) {
  const client = new PGlite({ extensions: { vector } });
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  const dump = await client.dumpDataDir("none");
  await client.close();
  const dir = await mkdtemp(join(tmpdir(), "finance-agent-pglite-"));
  const file = join(dir, "migrated.tar");
  await writeFile(file, Buffer.from(await dump.arrayBuffer()));
  project.provide("pgliteDataDir", file);
  return () => rm(dir, { recursive: true, force: true });
}
