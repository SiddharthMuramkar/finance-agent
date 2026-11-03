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

  it("answers 401 on API routes", async () => {
    expect((await proxy(request("/api/turn", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/api/turn"))).status).toBe(401);
    // The Learner Profile API is behind the passcode too.
    expect((await proxy(request("/api/profile"))).status).toBe(401);
    expect((await proxy(request("/api/profile", { method: "PUT" }))).status).toBe(401);
    expect((await proxy(request("/api/profile/dismiss", { method: "POST" }))).status).toBe(401);
  });

  it("lets a signed-in request through", async () => {
    const cookie = `${ACCESS_COOKIE}=${await accessToken(SECRET)}`;
    expect(allowed(await proxy(request("/course", { headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/api/turn", { method: "POST", headers: { cookie } })))).toBe(true);
  });
});
