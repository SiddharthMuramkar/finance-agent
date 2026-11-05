import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { signInAs } from "@/auth/learners";
import { installE2eDb } from "./e2e-db";

afterAll(async () => {
  const client = (globalThis.__faE2eDb as unknown as { $client?: { close(): Promise<void> } } | undefined)?.$client;
  await client?.close();
  globalThis.__faE2eDb = undefined;
  globalThis.__faE2eIsPglite = undefined;
  globalThis.__faE2eDbReady = undefined;
});

describe("the test bed's database", () => {
  it("the test database is migrated, has pgvector and is a singleton", async () => {
    const db = await installE2eDb();
    const tables = await db.execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public'`);
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(["learners", "sessions", "settings"]));
    const extensions = await db.execute<{ extname: string }>(sql`select extname from pg_extension`);
    expect(extensions.rows.map((r) => r.extname)).toContain("vector");
    expect(await installE2eDb()).toBe(db);
    expect(globalThis.__faE2eDb).toBe(db);
    expect(globalThis.__faE2eIsPglite).toBe(true);
    const tools = await signInAs(db, "tools");
    expect(tools.id).toBeGreaterThanOrEqual(1);
  });
});
