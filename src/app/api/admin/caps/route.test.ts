import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "@/auth/identity";
import { learnerToken } from "@/auth/passcode";
import { learners } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { readSettings } from "@/tutor/session-log";

/**
 * /api/admin/caps (decision #13, issue #33): the one change made on /admin. Same site first (403), then the admin only
 * (signedInAdmin: a Clerk session whose token says admin; anyone else gets 404, as for an address that isn't there),
 * and a 303 back to /admin?done=<code>#caps. The account is mocked at its seam (`currentIdentity`), as in
 * src/auth/owner.test.ts; the database, the admin check and the caps rules are real.
 */
const jar = vi.hoisted(() => ({ db: undefined as unknown as Db, cookie: undefined as string | undefined, identity: null as Identity | null }));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && jar.cookie !== undefined ? { name, value: jar.cookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/auth/identity", () => ({ currentIdentity: async () => jar.identity }));

const capsRoute = await import("./route");

const SITE = "https://www.value-it.xyz";
const SECRET = "test-secret";
const SAME_SITE = { "sec-fetch-site": "same-origin" };
const ADMIN: Identity = { userId: "user_owner", email: "owner@x.com", firstName: "Siddharth", admin: true };
const ASHA: Identity = { userId: "user_asha", email: "asha@gmail.com", firstName: "Asha", admin: false };
const DEFAULT_CAPS = { learnerTurnsPerDay: 120, learnerUsdPerDay: 5, globalUsdPerDay: 30, stepsPerTurn: 10, resumesPerTurn: 2 };

/** Posts as whoever `jar` says is signed in; a 303 must go to /admin with a code and a section, and nothing else. */
async function send(fields: Record<string, string>, headers: Record<string, string> = SAME_SITE) {
  const response = await capsRoute.POST(new Request(`${SITE}/api/admin/caps`, { method: "POST", headers, body: new URLSearchParams(fields) }));
  const location = response.headers.get("location");
  if (response.status === 303) {
    const url = new URL(location!);
    expect(url.origin).toBe(SITE);
    expect(url.pathname + url.search + url.hash).toMatch(/^\/admin\?done=[a-z_]+#[a-z-]+$/);
  }
  return { status: response.status, location: location ? new URL(location).pathname + new URL(location).search + new URL(location).hash : null };
}

describe("/api/admin/caps", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.cookie = undefined;
    jar.identity = ADMIN;
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "owner:owner-pass, tools:tools-pass");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses another site's post (403) and anyone but the admin (404), and changes nothing; a GET is 405", async () => {
    const caps = { turns_per_learner_day: "1", usd_per_learner_day: "1", usd_global_day: "1", steps_per_turn: "1", resumes_per_turn: "1" };
    const crossSite: Record<string, string>[] = [{ "sec-fetch-site": "cross-site", origin: "https://evil.example" }, { origin: "https://evil.example" }, {}];
    for (const headers of crossSite) expect((await send(caps, headers)).status, JSON.stringify(headers)).toBe(403);

    const [tools] = await jar.db.insert(learners).values({ name: "tools" }).returning();
    const notAdmin: [string, () => Promise<void>][] = [
      ["a Learner's account", async () => void (jar.identity = ASHA)],
      ["a passcode, with no account", async () => {
        jar.identity = null;
        jar.cookie = await learnerToken(tools.id, SECRET);
      }],
      ["nobody", async () => {
        jar.identity = null;
        jar.cookie = undefined;
      }],
    ];
    for (const [who, signIn] of notAdmin) {
      await signIn();
      expect((await send(caps)).status, who).toBe(404);
    }

    const get = capsRoute.GET();
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect((await readSettings(jar.db)).caps).toEqual(DEFAULT_CAPS);
  });

  it("saves every Spend cap at once, and a missing or bad value saves none of them", async () => {
    const fields = { turns_per_learner_day: " 90 ", usd_per_learner_day: "2.5", usd_global_day: "0", steps_per_turn: "12", resumes_per_turn: "0" };
    expect(await send(fields)).toEqual({ status: 303, location: "/admin?done=caps_saved#caps" });
    expect((await readSettings(jar.db)).caps).toEqual({ learnerTurnsPerDay: 90, learnerUsdPerDay: 2.5, globalUsdPerDay: 0, stepsPerTurn: 12, resumesPerTurn: 0 });

    const bad = [{ usd_global_day: "" }, { turns_per_learner_day: "1.5" }, { usd_per_learner_day: "-1" }, { usd_per_learner_day: "0.001" }, { usd_global_day: "1e3" }, { turns_per_learner_day: "10001" }, { steps_per_turn: "0" }, { resumes_per_turn: "21" }];
    for (const change of bad) {
      expect(await send({ ...fields, turns_per_learner_day: "7", ...change }), JSON.stringify(change)).toEqual({ status: 303, location: "/admin?done=bad_caps#caps" });
    }
    expect(await send({ turns_per_learner_day: "7", usd_per_learner_day: "2.5", usd_global_day: "1", steps_per_turn: "10" })).toEqual({ status: 303, location: "/admin?done=bad_caps#caps" });
    expect((await readSettings(jar.db)).caps).toEqual({ learnerTurnsPerDay: 90, learnerUsdPerDay: 2.5, globalUsdPerDay: 0, stepsPerTurn: 12, resumesPerTurn: 0 });
  });

  it("answers a body that is not a form with a 400, saving nothing", async () => {
    const response = await capsRoute.POST(new Request(`${SITE}/api/admin/caps`, { method: "POST", headers: { ...SAME_SITE, "content-type": "multipart/form-data; boundary=x" }, body: "not a form" }));
    expect(response.status).toBe(400);
    expect((await readSettings(jar.db)).caps).toEqual(DEFAULT_CAPS);
  });
});
