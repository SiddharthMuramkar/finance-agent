import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithFreshSession } from "./fresh-session-fetch";

// A Clerk session token lives 60 s and the browser SDK renews it on a timer, which a background tab may skip, so a
// POST from a tab left idle can reach the proxy with an expired token and get 401 (issue #33). The fetch asks Clerk
// for a fresh token (which renews the cookie) and tries once more.

const ok = () => new Response("ok", { status: 200 });
const signedOut = () => new Response("{}", { status: 401 });

function stubFetch(...answers: (() => Response)[]) {
  const fetch = vi.fn(async () => (answers.shift() ?? ok)());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function stubClerk(token: string | null | Error) {
  const getToken = vi.fn(async () => {
    if (token instanceof Error) throw token;
    return token;
  });
  vi.stubGlobal("Clerk", { session: { getToken } });
  return getToken;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchWithFreshSession", () => {
  it("after a 401, gets a fresh Clerk token and sends the same request once more", async () => {
    const fetch = stubFetch(signedOut, ok);
    const getToken = stubClerk("token");
    const res = await fetchWithFreshSession("/api/turn", { method: "POST", body: "{\"text\":\"hi\"}" });
    expect(res.status).toBe(200);
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(fetch.mock.calls).toEqual([
      ["/api/turn", { method: "POST", body: "{\"text\":\"hi\"}" }],
      ["/api/turn", { method: "POST", body: "{\"text\":\"hi\"}" }],
    ]);
  });

  it("tries again only once: a second 401 is the answer", async () => {
    const fetch = stubFetch(signedOut, signedOut, ok);
    stubClerk("token");
    expect((await fetchWithFreshSession("/api/turn")).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns the 401 as it is without Clerk (the passcode door), with no session, or when no token comes", async () => {
    for (const setup of [() => {}, () => vi.stubGlobal("Clerk", { session: null }), () => stubClerk(null), () => stubClerk(new Error("offline"))]) {
      vi.unstubAllGlobals();
      const fetch = stubFetch(signedOut, ok);
      setup();
      expect((await fetchWithFreshSession("/api/turn")).status).toBe(401);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("asks Clerk nothing when the first answer is not a 401", async () => {
    stubFetch(() => new Response("busy", { status: 409 }));
    const getToken = stubClerk("token");
    expect((await fetchWithFreshSession("/api/turn")).status).toBe(409);
    expect(getToken).not.toHaveBeenCalled();
  });
});
