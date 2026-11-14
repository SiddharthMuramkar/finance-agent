import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const made = vi.hoisted(() => ({ neonUrls: [] as string[], pools: 0, appDb: { app: true } }));
vi.mock("@neondatabase/serverless", () => ({
  neon: (url: string) => {
    made.neonUrls.push(url);
    return { http: url };
  },
  Pool: class {
    constructor() {
      made.pools++;
    }
  },
}));
vi.mock("./client", () => ({ getDb: () => made.appDb }));

describe("oneWriteDb", () => {
  beforeEach(() => {
    vi.resetModules();
    made.neonUrls = [];
    made.pools = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("in production is Neon's HTTP driver on DATABASE_URL, built once, and never the WebSocket pool", async () => {
    const { oneWriteDb } = await import("./one-write");
    const env = { DATABASE_URL: "postgres://user:pw@example.invalid/db", NODE_ENV: "production" };
    const first = oneWriteDb(env);
    expect(oneWriteDb(env)).toBe(first);
    expect(first).not.toBe(made.appDb);
    expect(made.neonUrls).toEqual(["postgres://user:pw@example.invalid/db"]);
    expect(made.pools).toBe(0);
  });

  it("in the browser test bed is the app's own database (its PGlite), even with a DATABASE_URL", async () => {
    const { oneWriteDb } = await import("./one-write");
    expect(oneWriteDb({ E2E: "1", DATABASE_URL: "postgres://user:pw@example.invalid/db" })).toBe(made.appDb);
    expect(made.neonUrls).toEqual([]);
  });

  it("with no DATABASE_URL (the unit tests) is the app's own database", async () => {
    const { oneWriteDb } = await import("./one-write");
    expect(oneWriteDb({})).toBe(made.appDb);
    expect(made.neonUrls).toEqual([]);
  });
});
