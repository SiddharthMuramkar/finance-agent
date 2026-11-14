import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => ({ pools: 0 }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    constructor() {
      constructed.pools++;
    }
  },
}));

describe("getDb", () => {
  beforeEach(() => {
    vi.resetModules();
    constructed.pools = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getDb in production never builds a test database", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("NODE_ENV", "production");
    const { getDb } = await import("./client");
    expect(() => getDb()).toThrow(/production/);
    expect(constructed.pools).toBe(0);
  });

  it("builds the Neon pool once without E2E and returns the same object twice", async () => {
    vi.stubEnv("E2E", undefined);
    vi.stubEnv("DATABASE_URL", "postgres://user:pw@example.invalid/db");
    const { getDb } = await import("./client");
    const first = getDb();
    expect(getDb()).toBe(first);
    expect(constructed.pools).toBe(1);
  });
});
