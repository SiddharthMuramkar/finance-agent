import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";

const as: { db?: Db; calls: number } = { calls: 0 };
vi.mock("@/db/client", () => ({
  getDb: () => {
    as.calls++;
    if (!as.db) throw new Error("no database in this test");
    return as.db;
  },
}));

const route = await import("./route");
const okRequest = () => new Request("http://localhost:3000/api/auth/ok");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/auth/*", () => {
  it("answers 404 and builds nothing while Google sign-in is off", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    for (const handler of [route.GET, route.POST]) expect((await handler(okRequest())).status).toBe(404);
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-of-at-least-32-characters!");
    expect((await route.GET(okRequest())).status).toBe(404); // one of the two is still not enough
    expect(as.calls).toBe(0);
  });

  it("is Better Auth's handler once both secrets are set", async () => {
    as.db = await testDb();
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-of-at-least-32-characters!");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    const res = await route.GET(okRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
