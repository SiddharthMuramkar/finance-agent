import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { migratedPglite } from "./pglite";

declare module "vitest" {
  export interface ProvidedContext {
    pgliteDump: string;
  }
}

let dir: string | undefined;

/**
 * Runs once before any test worker starts: builds one migrated Postgres and saves its data
 * directory, so each test file loads it instead of booting Postgres and replaying migrations.
 */
export async function setup(project: TestProject) {
  const client = await migratedPglite();
  const dump = await client.dumpDataDir("none");
  await client.close();
  dir = await mkdtemp(join(tmpdir(), "finance-agent-pglite-"));
  const file = join(dir, "migrated.tar");
  await writeFile(file, Buffer.from(await dump.arrayBuffer()));
  project.provide("pgliteDump", file);
}

export async function teardown() {
  if (dir) await rm(dir, { recursive: true, force: true });
}
