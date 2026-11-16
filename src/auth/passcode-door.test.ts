import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { learners } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { passcodeDoorOpen } from "./gates";
import { learnerFromCookie } from "./learners";
import { learnerToken, passcodeList } from "./passcode";

/**
 * The passcode door (issue #33) is for the test bed and the test tools only: open on a developer's machine, shut in
 * production and on Vercel. Each of its four ways in asks `passcodeDoorOpen` itself, so no single one can be left open.
 */
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("the shut door read the database");
  },
}));

const { POST: login } = await import("@/app/api/login/route");

const SECRET = "test-secret";

describe("passcodeDoorOpen", () => {
  it("is open outside production and off Vercel only", () => {
    expect(passcodeDoorOpen({ NODE_ENV: "development" })).toBe(true);
    expect(passcodeDoorOpen({ NODE_ENV: "test" })).toBe(true);
    expect(passcodeDoorOpen({ NODE_ENV: "production" })).toBe(false);
    expect(passcodeDoorOpen({ NODE_ENV: "development", VERCEL: "1" })).toBe(false);
    expect(passcodeDoorOpen({ NODE_ENV: "production", VERCEL: "1", E2E: "1" })).toBe(false);
  });
});

describe("the shut door", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("POST /api/login answers 404 in production and on Vercel, before it reads anything", async () => {
    for (const env of [{ NODE_ENV: "production" }, { VERCEL: "1" }]) {
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
      vi.stubEnv("PASSCODES", "tools:tools-pass");
      const form = new FormData();
      form.set("passcode", "tools-pass");
      const response = await login(new Request("https://app.example/api/login", { method: "POST", body: form }));
      expect(response.status, JSON.stringify(env)).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
      vi.unstubAllEnvs();
    }
  });

  it("learnerFromCookie refuses a correctly signed cookie for a listed Learner", async () => {
    const db = await testDb();
    const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
    const cookie = await learnerToken(tools.id, SECRET);
    const list = passcodeList({ PASSCODES: "tools:tools-pass" });
    expect((await learnerFromCookie(db, cookie, SECRET, list, { NODE_ENV: "development" }))?.id).toBe(tools.id);
    expect(await learnerFromCookie(db, cookie, SECRET, list, { NODE_ENV: "production" })).toBeNull();
    expect(await learnerFromCookie(db, cookie, SECRET, list, { NODE_ENV: "development", VERCEL: "1" })).toBeNull();
  });

  it("each way in asks the door itself: /api/login, the proxy's gate, the session and learnerFromCookie", () => {
    for (const file of ["../app/api/login/route.ts", "../proxy.ts", "./session.ts", "./learners.ts"]) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(text, file).toMatch(/\bpasscodeDoorOpen\((process\.)?env\)/);
    }
  });
});
