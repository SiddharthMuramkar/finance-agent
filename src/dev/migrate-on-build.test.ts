import { describe, expect, it, vi } from "vitest";
import { migrateOnBuild, migrationPlan, pendingCount, snapshotBeforeMigrating } from "../../scripts/migrate-on-build.mjs";

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

describe("snapshotBeforeMigrating", () => {
  const KEY = "napi_test_key_never_logged";
  const env = {
    NEON_API_KEY: KEY,
    NEON_PROJECT_ID: "proj-1",
    DATABASE_URL_UNPOOLED: "postgres://u:p@ep-calm-sky-123456.ap-southeast-1.aws.neon.tech/db?sslmode=require",
    VERCEL_GIT_COMMIT_SHA: "a3493c6f00d",
  };
  const now = () => new Date("2026-11-14T14:27:00.000Z");
  const sleep = async () => {};
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  /** A fake Neon API: each route answers from its own list, the last answer repeating; every call is recorded. */
  function neon(routes: Record<string, Response[] | (() => Response)>) {
    const calls: { method: string; url: string; auth: string | null }[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, auth: new Headers(init.headers).get("authorization") });
      const key = `${method} ${new URL(url).pathname}`;
      const route = routes[key];
      if (!route) throw new Error(`unexpected ${key}`);
      if (typeof route === "function") return route();
      return route.length > 1 ? route.shift()! : route[0].clone();
    });
    return { fetch, calls };
  }
  const ENDPOINT = "GET /api/v2/projects/proj-1/endpoints/ep-calm-sky-123456";
  const SNAPSHOT = "POST /api/v2/projects/proj-1/branches/br-main-1/snapshot";
  const OPERATION = "GET /api/v2/projects/proj-1/operations/op-1";
  const happy = () => ({
    [ENDPOINT]: [json(200, { endpoint: { id: "ep-calm-sky-123456", branch_id: "br-main-1" } })],
    [SNAPSHOT]: [json(200, { snapshot: { id: "snap-1", name: "x" }, operations: [{ id: "op-1", action: "create_branch", status: "running" }] })],
    [OPERATION]: [json(200, { operation: { id: "op-1", status: "running" } }), json(200, { operation: { id: "op-1", status: "finished" } })],
  });

  it("takes no snapshot and calls no API when nothing is pending, even without the Neon variables", async () => {
    const fetch = vi.fn();
    const result = await snapshotBeforeMigrating({}, 0, { fetch });
    expect(result).toEqual({ taken: false, reason: "no pending migrations" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips cleanly when NEON_API_KEY is not set (local, CI, tests), even with a project id", async () => {
    const fetch = vi.fn();
    const result = await snapshotBeforeMigrating({ NEON_PROJECT_ID: "proj-1" }, 2, { fetch });
    expect(result).toEqual({ taken: false, reason: "NEON_API_KEY is not set" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to migrate when the key is set but the project id is not", async () => {
    const fetch = vi.fn();
    await expect(snapshotBeforeMigrating({ NEON_API_KEY: KEY }, 2, { fetch })).rejects.toThrow(/NEON_PROJECT_ID/);
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("in a production build (the gate fails closed)", () => {
    const prod = { ...env, VERCEL_ENV: "production" };

    it("fails the deploy when NEON_API_KEY is missing or empty, and names the opt-out", async () => {
      for (const NEON_API_KEY of [undefined, "", "  "]) {
        const fetch = vi.fn();
        const error = await snapshotBeforeMigrating({ ...prod, NEON_API_KEY }, 1, { fetch, sleep, now }).catch((e: Error) => e);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/NEON_API_KEY is not set/);
        expect((error as Error).message).toMatch(/NEON_SNAPSHOT=off/);
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it("fails the deploy when NEON_PROJECT_ID is missing or empty, and never prints the key", async () => {
      for (const NEON_PROJECT_ID of [undefined, ""]) {
        const fetch = vi.fn();
        const error = await snapshotBeforeMigrating({ ...prod, NEON_PROJECT_ID }, 1, { fetch, sleep, now }).catch((e: Error) => e);
        expect((error as Error).message).toMatch(/NEON_PROJECT_ID is not set/);
        expect((error as Error).message).not.toContain(KEY);
        expect(fetch).not.toHaveBeenCalled();
      }
    });

    it("names both variables when both are missing", async () => {
      const error = await snapshotBeforeMigrating({ VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: env.DATABASE_URL_UNPOOLED }, 3, { fetch: vi.fn() }).catch((e: Error) => e);
      expect((error as Error).message).toMatch(/NEON_API_KEY and NEON_PROJECT_ID are not set/);
    });

    it("with NEON_SNAPSHOT=off, migrates without a snapshot and warns loudly, with or without the Neon variables", async () => {
      for (const opted of [{ ...prod, NEON_SNAPSHOT: "off" }, { VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: env.DATABASE_URL_UNPOOLED, NEON_SNAPSHOT: "off" }]) {
        const fetch = vi.fn();
        const warn = vi.fn();
        const result = await snapshotBeforeMigrating(opted, 2, { fetch, sleep, now, warn });
        expect(result).toMatchObject({ taken: false, reason: expect.stringMatching(/NEON_SNAPSHOT=off/) });
        expect(fetch).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/WARNING.*NEON_SNAPSHOT=off.*no restore point/s);
        expect(warn.mock.calls[0][0]).not.toContain(KEY);
      }
    });

    it("still snapshots normally when both variables are set", async () => {
      const { fetch } = neon(happy());
      const result = await snapshotBeforeMigrating(prod, 1, { fetch, sleep, now });
      expect(result.taken).toBe(true);
    });
  });

  it("fails the deploy when a Neon call does not answer in time, instead of hanging the build", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetch = vi.fn((_url: string, init: RequestInit = {}) => {
      signals.push(init.signal);
      // A call that never answers until its signal aborts it.
      return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }));
    });
    const error = await snapshotBeforeMigrating(env, 1, { fetch, sleep, now, timeoutMs: 20 }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Neon API GET \/projects\/proj-1\/endpoints\/ep-calm-sky-123456 did not answer in 0\.02 s; failing the deploy/);
    expect((error as Error).message).not.toContain(KEY);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("gives every Neon call a time limit", async () => {
    const { fetch } = neon(happy());
    await snapshotBeforeMigrating(env, 1, { fetch, sleep, now });
    expect(fetch.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true);
  });

  it("snapshots the branch behind DATABASE_URL_UNPOOLED and waits for Neon to finish", async () => {
    const { fetch, calls } = neon(happy());
    const result = await snapshotBeforeMigrating(env, 2, { fetch, sleep, now });
    expect(result).toEqual({ taken: true, id: "snap-1", name: "pre-migrate-a3493c6-2026-11-14T142700", branchId: "br-main-1" });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([ENDPOINT, SNAPSHOT, OPERATION, OPERATION]);
    expect(calls.every((c) => c.auth === `Bearer ${KEY}`)).toBe(true);
    const query = new URL(calls[1].url).searchParams;
    expect(query.get("name")).toBe("pre-migrate-a3493c6-2026-11-14T142700");
    expect(query.get("expires_at")).toBe("2026-12-14T14:27:00.000Z");
    expect(new URL(calls[1].url).origin).toBe("https://console.neon.tech");
  });

  it("finds the endpoint from a pooled host too", async () => {
    const { fetch, calls } = neon(happy());
    const pooled = { ...env, DATABASE_URL_UNPOOLED: "postgres://u:p@ep-calm-sky-123456-pooler.ap-southeast-1.aws.neon.tech/db" };
    await snapshotBeforeMigrating(pooled, 1, { fetch, sleep, now });
    expect(new URL(calls[0].url).pathname).toBe("/api/v2/projects/proj-1/endpoints/ep-calm-sky-123456");
  });

  it("retries while Neon answers 423 Locked (another operation is running), then snapshots", async () => {
    const routes = happy();
    routes[SNAPSHOT].unshift(json(423, { code: "", message: "project already has running operations" }));
    const { fetch, calls } = neon(routes);
    const result = await snapshotBeforeMigrating(env, 1, { fetch, sleep, now });
    expect(result.taken).toBe(true);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("fails the deploy when Neon refuses the snapshot, with Neon's reason and without the key", async () => {
    const routes = { ...happy(), [SNAPSHOT]: [json(422, { code: "", message: "snapshots are only supported on root branches" })] };
    const { fetch } = neon(routes);
    const error = await snapshotBeforeMigrating(env, 1, { fetch, sleep, now }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/422.*root branches/);
    expect((error as Error).message).not.toContain(KEY);
  });

  it("fails the deploy when a snapshot operation fails", async () => {
    const routes = { ...happy(), [OPERATION]: [json(200, { operation: { id: "op-1", status: "failed" } })] };
    const { fetch } = neon(routes);
    await expect(snapshotBeforeMigrating(env, 1, { fetch, sleep, now })).rejects.toThrow(/create_branch.*failed/);
  });

  it("fails the deploy when a snapshot operation never finishes", async () => {
    const routes = { ...happy(), [OPERATION]: () => json(200, { operation: { id: "op-1", status: "running" } }) };
    const { fetch } = neon(routes);
    await expect(snapshotBeforeMigrating(env, 1, { fetch, sleep, now })).rejects.toThrow(/did not finish/);
  });

  it("fails the deploy when DATABASE_URL_UNPOOLED is not a Neon endpoint, without printing the URL", async () => {
    const fetch = vi.fn();
    const error = await snapshotBeforeMigrating({ ...env, DATABASE_URL_UNPOOLED: "postgres://u:secret@db.example/x" }, 1, { fetch }).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/Neon endpoint/);
    expect((error as Error).message).not.toContain("secret");
    expect(fetch).not.toHaveBeenCalled();
  });
});
