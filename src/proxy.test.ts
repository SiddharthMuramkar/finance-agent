import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_COOKIE, accessToken } from "@/auth/passcode";
import { proxy } from "./proxy";

const SECRET = "test-secret";

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://app.example"), init);
}

const allowed = (r: Response) => r.headers.get("x-middleware-next") === "1";
const redirectedToLogin = (r: Response) =>
  r.status >= 300 && r.status < 400 && new URL(r.headers.get("location")!).pathname === "/login";

describe("The signed-out gate", () => {
  beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("lets a signed-out visitor read the landing page", async () => {
    expect(allowed(await proxy(request("/")))).toBe(true);
    expect(allowed(await proxy(request("/", { method: "HEAD" })))).toBe(true);
  });

  it("refuses a write to / and any Server Action call", async () => {
    expect((await proxy(request("/", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/", { headers: { "Next-Action": "abc" } }))).status).toBe(401);
    expect((await proxy(request("/course", { headers: { "Next-Action": "abc" } }))).status).toBe(401);
  });

  it("serves the landing screenshots", async () => {
    expect(allowed(await proxy(request("/landing-assets/workspace-light.png")))).toBe(true);
    expect(allowed(await proxy(request("/landing-assets/workspace-dark.webp")))).toBe(true);
  });

  it("sends every other page to the login", async () => {
    for (const path of ["/course", "/sessions/1", "/landing-assets/x.txt", "/landing-assets/a/b.png"]) {
      expect(redirectedToLogin(await proxy(request(path))), path).toBe(true);
    }
  });

  it("sends a signed-out visitor from the Study Workspace to the login, and lets a signed-in one in", async () => {
    expect(redirectedToLogin(await proxy(request("/study")))).toBe(true);
    expect(redirectedToLogin(await proxy(request("/study?demo=1")))).toBe(true);
    const cookie = `${ACCESS_COOKIE}=${await accessToken(SECRET)}`;
    expect(allowed(await proxy(request("/study", { headers: { cookie } })))).toBe(true);
  });

  it("lets a signed-out POST reach exactly the sign-out route", async () => {
    expect(allowed(await proxy(request("/api/logout", { method: "POST" })))).toBe(true);
    expect((await proxy(request("/api/logout"))).status).toBe(401);
    expect((await proxy(request("/api/logout", { method: "HEAD" }))).status).toBe(401);
    for (const path of ["/api/logout/x", "/api/logoutx", "/api/logout/"]) {
      expect((await proxy(request(path, { method: "POST" }))).status, path).toBe(401);
    }
    expect((await proxy(request("/api/logout", { method: "POST", headers: { "Next-Action": "abc" } }))).status).toBe(401);
  });

  it("answers 401 on API routes", async () => {
    expect((await proxy(request("/api/turn", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/api/turn"))).status).toBe(401);
  });

  it("lets a signed-in request through", async () => {
    const cookie = `${ACCESS_COOKIE}=${await accessToken(SECRET)}`;
    expect(allowed(await proxy(request("/course", { headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/api/turn", { method: "POST", headers: { cookie } })))).toBe(true);
  });
});
