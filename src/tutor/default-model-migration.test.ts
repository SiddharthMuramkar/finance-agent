import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { settings } from "@/db/schema";
import { testDb } from "@/test/pglite";

const file = readdirSync("drizzle").find((f) => f.endsWith("_tutor_default_opus.sql"));
const migration = readFileSync(join("drizzle", file!), "utf8");

async function run(db: Awaited<ReturnType<typeof testDb>>) {
  for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await db.execute(sql.raw(statement));
}

const modelOf = async (db: Awaited<ReturnType<typeof testDb>>) => (await db.select().from(settings).where(eq(settings.key, "model")))[0]?.value;

describe("data migration: Tutor default model", () => {
  it("moves a stored Sonnet default to Opus 5.5", async () => {
    const db = await testDb();
    await db.insert(settings).values({ key: "model", value: "claude-sonnet-5-5" }).onConflictDoUpdate({ target: settings.key, set: { value: "claude-sonnet-5-5" } });
    await run(db);
    expect(await modelOf(db)).toBe("claude-opus-5-5");
  });

  it("leaves a model the owner chose by hand alone", async () => {
    const db = await testDb();
    await db.insert(settings).values({ key: "model", value: "claude-haiku-5-5" }).onConflictDoUpdate({ target: settings.key, set: { value: "claude-haiku-5-5" } });
    await run(db);
    expect(await modelOf(db)).toBe("claude-haiku-5-5");
  });

  it("does nothing when no model has been stored yet", async () => {
    const db = await testDb();
    await db.delete(settings).where(eq(settings.key, "model"));
    await run(db);
    expect(await modelOf(db)).toBeUndefined();
  });
});
