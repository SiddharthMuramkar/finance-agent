import { describe, expect, it } from "vitest";
import { migrateOnBuild, migrationPlan, pendingCount } from "../../scripts/migrate-on-build.mjs";

describe("migrationPlan", () => {
  it("runs on a production build, with the direct connection", () => {
    expect(migrationPlan({ VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: "postgres://direct" })).toEqual({ run: true, url: "postgres://direct" });
  });
  it("skips preview, development and local builds, even with a database URL set", () => {
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      const plan = migrationPlan({ VERCEL_ENV, DATABASE_URL_UNPOOLED: "postgres://direct" });
      expect(plan.run).toBe(false);
    }
  });
  it("fails a production build that has no direct connection, and never falls back to the pooled one", () => {
    expect(() => migrationPlan({ VERCEL_ENV: "production", DATABASE_URL: "postgres://pooled" })).toThrow(/DATABASE_URL_UNPOOLED/);
  });
});

describe("pendingCount", () => {
  it("counts what the repo has and the database lacks", () => expect(pendingCount(35, 32)).toBe(3));
  it("is zero when the database is level or ahead", () => {
    expect(pendingCount(35, 35)).toBe(0);
    expect(pendingCount(35, 36)).toBe(0);
  });
});

describe("migrateOnBuild", () => {
  it("logs a skip and touches nothing outside production", async () => {
    const lines: string[] = [];
    await migrateOnBuild({ VERCEL_ENV: "preview" }, (line) => lines.push(line));
    expect(lines).toEqual(['migrate-on-build: skipped (VERCEL_ENV is "preview", not "production").']);
  });
});
