import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "@/db/types";
import { config as proxyConfig } from "@/proxy";
import { testDb } from "@/test/pglite";

/** The 15-minute health check's route (decision #12): CRON_SECRET only, 200 and a heartbeat when the database answers, 503 and none when it does not. */

const as = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));

const { GET } = await import("./route");

const HEARTBEAT = "https://uptime.example/api/v1/heartbeat/token";
const call = (headers: Record<string, string> = { authorization: "Bearer right-secret" }) => GET(new Request("https://app.example/api/cron/health", { headers }));

let beats: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  as.db = await testDb();
  process.env.CRON_SECRET = "right-secret";
  process.env.BETTERSTACK_HEARTBEAT_URL = HEARTBEAT;
  beats = vi.fn(async () => new Response("OK"));
  vi.stubGlobal("fetch", beats);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.BETTERSTACK_HEARTBEAT_URL;
  vi.unstubAllGlobals();
});

describe("the health cron route", () => {
  it("answers 401 without the secret and sends nothing", async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call({ authorization: "Bearer undefined" })).status).toBe(401);
    expect(beats).not.toHaveBeenCalled();
  });

  it("answers 200 and sends the heartbeat when the database answers", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, db: "answered", heartbeat: "sent" });
    expect(beats).toHaveBeenCalledTimes(1);
    expect(String(beats.mock.calls[0][0])).toBe(HEARTBEAT);
  });

  it("answers 503 and sends no heartbeat when the database does not answer", async () => {
    await (as.db as unknown as { $client: PGlite }).$client.close();
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, db: "failed", heartbeat: "skipped" });
    expect(beats).not.toHaveBeenCalled();
  });

  it("does nothing more than the check when BETTERSTACK_HEARTBEAT_URL is not set", async () => {
    delete process.env.BETTERSTACK_HEARTBEAT_URL;
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ db: "answered", heartbeat: "off" });
    expect(beats).not.toHaveBeenCalled();
  });

  it("skips the passcode gate at its exact path only", () => {
    const gate = new RegExp(`^${proxyConfig.matcher[0]}$`);
    expect(gate.test("/api/cron/health")).toBe(false);
    for (const path of ["/api/cron/health/x", "/api/cron/healthz", "/api/cron/other"]) expect(gate.test(path), path).toBe(true);
  });

  it("is scheduled every 15 minutes as a Vercel Schedule, and not also as a Cron Job (it would run twice)", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons?: { path: string }[];
      schedules?: Record<string, { schedule: string; path?: string; requestMethod?: string }>;
    };
    expect(vercel.schedules?.health).toEqual({ schedule: "*/15 * * * *", path: "/api/cron/health", requestMethod: "GET" });
    expect((vercel.crons ?? []).map((c) => c.path)).not.toContain("/api/cron/health");
  });
});
