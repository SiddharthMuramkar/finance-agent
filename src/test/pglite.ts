import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { inject } from "vitest";
import * as schema from "../db/schema";
import type { Db } from "../db/types";

const MIGRATIONS = "./drizzle";

/** A new in-memory Postgres with pgvector loaded, as Neon has it, and the real migrations applied. */
export async function migratedPglite(): Promise<PGlite> {
  const client = new PGlite({ extensions: { vector } });
  await migrate(drizzle({ client, schema }), { migrationsFolder: MIGRATIONS });
  return client;
}

// Booting Postgres and replaying every migration is slow, and far slower when the machine is
// busy, so the global setup does it once and saves the result. Each test file loads that copy
// once and every test gets its own clone of it.
let template: Promise<PGlite> | undefined;
// And one per migration tag testDbThrough() was asked for, replayed here the first time a test file asks.
const throughTemplates = new Map<string, Promise<PGlite>>();

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

/** Closes every database testDb() and testDbThrough() made (clones and templates) and forgets them. */
export async function closeAllTestDbs(): Promise<void> {
  const templates = await Promise.allSettled([...(template ? [template] : []), ...throughTemplates.values()]);
  const clients = [...open, ...templates.flatMap((t) => (t.status === "fulfilled" ? [t.value] : []))];
  open.clear();
  template = undefined;
  throughTemplates.clear();
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

/** A new in-memory Postgres with only the migrations up to and including `tag` applied, from a copy of the folder cut there. */
async function pgliteThrough(tag: string): Promise<PGlite> {
  const journal = JSON.parse(await readFile(join(MIGRATIONS, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const last = journal.entries.findIndex((e) => e.tag === tag);
  if (last < 0) throw new Error(`No migration tagged ${tag} in ${MIGRATIONS}`);
  const entries = journal.entries.slice(0, last + 1);
  const folder = await mkdtemp(join(tmpdir(), "migrations-"));
  try {
    await mkdir(join(folder, "meta"));
    await writeFile(join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const e of entries) await copyFile(join(MIGRATIONS, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
    const client = new PGlite({ extensions: { vector } });
    await migrate(drizzle({ client, schema }), { migrationsFolder: folder });
    return client;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/**
 * A fresh in-memory Postgres migrated only through the migration tagged `tag` (e.g. "0035_sign_in_requests"): the
 * database production runs on between a deploy and the `npm run db:migrate` applied by hand after it. Slower than
 * testDb() the first time in a file: it replays the migrations itself.
 */
export async function testDbThrough(tag: string): Promise<Db> {
  const made = throughTemplates.get(tag) ?? pgliteThrough(tag);
  throughTemplates.set(tag, made);
  const client = (await (await made).clone()) as PGlite;
  open.add(client);
  return drizzle({ client, schema }) as unknown as Db;
}

/**
 * A fresh database with every migration applied, then the two columns migration 0036 gave session_items (turn_id and
 * stored_by) taken away: the table session-items.ts's probe still copes with. testDbThrough("0035_sign_in_requests")
 * no longer serves for this: since migration 0037 the turns table has columns Drizzle names in every insert, so a
 * database migrated only through 0035 cannot run a turn at all.
 */
export async function testDbWithout0036(): Promise<Db> {
  const db = await testDb();
  await db.execute(sql`alter table session_items drop column turn_id, drop column stored_by`);
  return db;
}

/** Puts migration 0036's columns back by running its file by hand, as `npm run db:migrate` once did under a running server. */
export async function apply0036(db: Db): Promise<void> {
  const file = await readFile(join(MIGRATIONS, "0036_session_items_turn.sql"), "utf8");
  for (const statement of file.split("--> statement-breakpoint")) await db.execute(sql.raw(statement));
}

/** Applies every migration a testDbThrough() database lacks, as `npm run db:migrate` does on production. */
export async function migrateToLatest(db: Db): Promise<void> {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS });
}
