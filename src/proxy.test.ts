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

  it("answers 401 on API routes", async () => {
    expect((await proxy(request("/api/turn", { method: "POST" }))).status).toBe(401);
    expect((await proxy(request("/api/turn"))).status).toBe(401);
  });

  it("sends /study to the login, remembering it", async () => {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(request("/study", { method }));
      expect(redirectedToLogin(response), method).toBe(true);
      expect(new URL(response.headers.get("location")!).search).toBe("?next=%2Fstudy");
    }
  });

  it("remembers any other page with its query, minus Next.js's internal parameters", async () => {
    const response = await proxy(request("/passages/12?from=map&_rsc=abc123"));
    expect(redirectedToLogin(response)).toBe(true);
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/passages/12?from=map");
  });

  it("remembers nothing for a non-GET page request or an API route", async () => {
    const post = await proxy(request("/course", { method: "POST" }));
    expect(redirectedToLogin(post)).toBe(true);
    expect(new URL(post.headers.get("location")!).search).toBe("");
    const api = await proxy(request("/api/turn"));
    expect(api.status).toBe(401);
    expect(api.headers.get("location")).toBeNull();
  });

  it("lets a signed-out visitor read exactly the login page, so there is no loop", async () => {
    expect(allowed(await proxy(request("/login")))).toBe(true);
    expect(allowed(await proxy(request("/login?next=%2Fcourse&wrong=1")))).toBe(true);
    expect(redirectedToLogin(await proxy(request("/login-anything")))).toBe(true);
  });

  it("skips the login form when signed in, with a temporary redirect to a safe next or /study", async () => {
    const cookie = `${ACCESS_COOKIE}=${await accessToken(SECRET)}`;
    const where = async (path: string) => {
      const response = await proxy(request(path, { headers: { cookie } }));
      expect([302, 303, 307]).toContain(response.status);
      const url = new URL(response.headers.get("location")!);
      return url.pathname + url.search;
    };
    expect(await where("/login")).toBe("/study");
    expect(await where("/login?next=%2Fcourse%3Ftopic%3D3")).toBe("/course?topic=3");
    expect(await where("/login?next=https%3A%2F%2Fevil.example")).toBe("/study");
    expect(await where("/login?next=%2Fapi%2Fturn")).toBe("/study");
  });

  it("lets a signed-in request through", async () => {
    const cookie = `${ACCESS_COOKIE}=${await accessToken(SECRET)}`;
    expect(allowed(await proxy(request("/course", { headers: { cookie } })))).toBe(true);
    expect(allowed(await proxy(request("/api/turn", { method: "POST", headers: { cookie } })))).toBe(true);
  });
});
