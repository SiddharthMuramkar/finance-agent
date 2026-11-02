import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "@/test/pglite";
import type { Db } from "@/db/types";

let db: Db;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const { POST } = await import("@/app/api/login/route");

const PASSCODE = "correct horse battery";

function login(passcode: string, ip = "203.0.113.7") {
  const form = new FormData();
  form.set("passcode", passcode);
  return POST(new Request("https://app.example/api/login", { method: "POST", body: form, headers: { "x-forwarded-for": ip } }));
}

const where = (response: Response) => new URL(response.headers.get("location")!).search;
const signedIn = (response: Response) => (response.headers.get("set-cookie") ?? "").includes("fa_access=");

describe("Passcode login attempts", () => {
  beforeEach(async () => {
    db = await testDb();
    vi.stubEnv("PASSCODE", PASSCODE);
    vi.stubEnv("SESSION_SECRET", "test-secret");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("the right passcode signs in", async () => {
    const response = await login(PASSCODE);
    expect(signedIn(response)).toBe(true);
  });

  it("after five wrong guesses from one address, even the right passcode is refused there for 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect(where(await login(`guess ${i}`))).toBe("?wrong=1");

    const locked = await login(PASSCODE);
    expect(where(locked)).toBe("?locked=1");
    expect(signedIn(locked)).toBe(false);

    // Another address is not locked out by these guesses.
    expect(signedIn(await login(PASSCODE, "198.51.100.2"))).toBe(true);

    vi.setSystemTime(new Date("2026-11-02T09:16:00Z"));
    expect(signedIn(await login(PASSCODE))).toBe(true);
  });

  it("guesses spread over many addresses are capped too", async () => {
    for (let i = 0; i < 50; i++) await login(`guess ${i}`, `192.0.2.${i}`);
    const locked = await login(PASSCODE, "198.51.100.9");
    expect(where(locked)).toBe("?locked=1");
    expect(signedIn(locked)).toBe(false);
  });
});
