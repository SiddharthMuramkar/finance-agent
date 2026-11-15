import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { isDenied, peopleWithAccess, waitingRequests } from "@/auth/access";
import { inviteFor } from "@/auth/invites";
import { learnerToken } from "@/auth/passcode";
import { accessDenials, invites, learners, session, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { readSettings } from "@/tutor/session-log";

/**
 * The owner's changes on /admin (ADR 0014): two form-post routes behind one guard (owner-post.ts). Same site first
 * (403), then the owner's own Better Auth session (anyone else gets 404, as for an address that isn't there), and a 303
 * back to /admin?done=<code>#<section>. Better Auth is mocked at its seam, as in src/auth/owner.test.ts; the database,
 * the owner check and the access rules are real.
 */
const jar = vi.hoisted(() => ({ db: undefined as unknown as Db, cookie: undefined as string | undefined, account: null as null | { id: string; email: string; name: string } }));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && jar.cookie !== undefined ? { name, value: jar.cookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/auth/better-auth", () => {
  const on = (env: Record<string, string | undefined> = process.env) => Boolean(env.BETTER_AUTH_SECRET?.trim() && env.GOOGLE_CLIENT_ID?.trim());
  return {
    googleSignInOn: on,
    betterAuthOn: on,
    getAuth: (env: Record<string, string | undefined> = process.env) =>
      on(env) ? { api: { getSession: async () => (jar.account ? { session: { id: "s1" }, user: jar.account } : null) } } : null,
  };
});

const accessRoute = await import("./access/route");
const invitesRoute = await import("./invites/route");
const capsRoute = await import("./caps/route");

const SITE = "https://www.value-it.xyz";
const SECRET = "test-secret";
const SAME_SITE = { "sec-fetch-site": "same-origin" };
const owner = { id: "u-owner", email: "owner@x.com", name: "Siddharth" };
const noor = { id: "u-noor", email: "noor@icloud.com", name: "Noor" };
const asha = { id: "u-asha", email: "asha@gmail.com", name: "Asha" };

const request = (path: string, fields: Record<string, string>, headers: Record<string, string> = SAME_SITE) =>
  new Request(`${SITE}/api/admin/${path}`, { method: "POST", headers, body: new URLSearchParams(fields) });

/** Posts as whoever `jar` says is signed in; a 303 must go to /admin with a code and a section, and nothing else. */
async function send(path: "access" | "invites" | "caps", fields: Record<string, string>, headers?: Record<string, string>) {
  const route = { access: accessRoute, invites: invitesRoute, caps: capsRoute }[path];
  const response = await route.POST(request(path, fields, headers));
  const location = response.headers.get("location");
  if (response.status === 303) {
    const url = new URL(location!);
    expect(url.origin).toBe(SITE);
    // Codes only: an email (or any person's detail) never goes in an address, where logs and history keep it.
    expect(url.pathname + url.search + url.hash).toMatch(/^\/admin\?done=[a-z_]+#[a-z-]+$/);
  }
  return { status: response.status, location: location ? new URL(location).pathname + new URL(location).search + new URL(location).hash : null };
}

/** The owner's account linked to Learner 1, as setup step 5 does; Noor signed in and waits; Asha has access. */
async function seed() {
  await jar.db.insert(user).values([
    { ...owner, emailVerified: true },
    { ...noor, emailVerified: true },
    { ...asha, emailVerified: true },
  ]);
  await jar.db.update(learners).set({ authUserId: owner.id }).where(eq(learners.name, "owner"));
  await jar.db.insert(invites).values({ email: owner.email, learnerName: "owner" });
  await jar.db.insert(learners).values({ name: "Asha", authUserId: asha.id });
  const now = new Date();
  await jar.db.insert(session).values([
    { id: "s-noor", token: "t-noor", userId: noor.id, expiresAt: new Date(now.getTime() + 86_400_000), updatedAt: now },
    { id: "s-asha", token: "t-asha", userId: asha.id, expiresAt: new Date(now.getTime() + 86_400_000), updatedAt: now },
  ]);
}

const sessionsOf = async (userId: string) => (await jar.db.select().from(session).where(eq(session.userId, userId))).length;

describe("the /admin routes", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.cookie = undefined;
    jar.account = owner;
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PASSCODES", "owner:owner-pass, tools:tools-pass");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-of-at-least-32-characters!");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    await seed();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuse another site (403), anyone but the owner (404, the owner's passcode too) and a GET (405), writing nothing", async () => {
    const approve = { userId: noor.id, action: "approve" };
    const deny = { userId: asha.id, action: "deny", confirm: "deny" };
    const invite = { email: "mia@x.com" };
    const caps = { turns_per_learner_day: "1", usd_per_learner_day: "1", usd_global_day: "1" };
    const crossSite: Record<string, string>[] = [{ "sec-fetch-site": "cross-site", origin: "https://evil.example" }, { origin: "https://evil.example" }, {}];
    for (const headers of crossSite) {
      expect((await send("access", approve, headers)).status, JSON.stringify(headers)).toBe(403);
      expect((await send("access", deny, headers)).status, JSON.stringify(headers)).toBe(403);
      expect((await send("invites", invite, headers)).status, JSON.stringify(headers)).toBe(403);
      expect((await send("caps", caps, headers)).status, JSON.stringify(headers)).toBe(403);
    }

    const notOwner: [string, () => Promise<void>][] = [
      ["a Learner with access", async () => void (jar.account = asha)],
      ["a waiting person", async () => void (jar.account = noor)],
      ["the owner's passcode, with no session", async () => {
        jar.account = null;
        jar.cookie = await learnerToken(1, SECRET);
      }],
      ["nobody", async () => {
        jar.account = null;
        jar.cookie = undefined;
      }],
    ];
    for (const [who, signIn] of notOwner) {
      await signIn();
      expect((await send("access", approve)).status, who).toBe(404);
      expect((await send("access", deny)).status, who).toBe(404);
      expect((await send("invites", invite)).status, who).toBe(404);
      expect((await send("caps", caps)).status, who).toBe(404);
    }

    for (const route of [accessRoute, invitesRoute, capsRoute]) {
      const get = await route.GET();
      expect(get.status).toBe(405);
      expect(get.headers.get("allow")).toBe("POST");
    }

    expect((await waitingRequests(jar.db)).map((w) => w.userId)).toEqual([noor.id]);
    expect(await jar.db.select().from(accessDenials)).toEqual([]);
    expect(await inviteFor(jar.db, "mia@x.com")).toBeNull();
    expect(await sessionsOf(asha.id)).toBe(1);
    expect((await readSettings(jar.db)).caps).toEqual({ learnerTurnsPerDay: 120, learnerUsdPerDay: 5, globalUsdPerDay: 30, stepsPerTurn: 10, resumesPerTurn: 2 });
  });

  it("caps saves every Spend cap at once, and a missing or bad value saves none of them", async () => {
    const fields = { turns_per_learner_day: " 90 ", usd_per_learner_day: "2.5", usd_global_day: "0", steps_per_turn: "12", resumes_per_turn: "0" };
    expect(await send("caps", fields)).toEqual({ status: 303, location: "/admin?done=caps_saved#caps" });
    expect((await readSettings(jar.db)).caps).toEqual({ learnerTurnsPerDay: 90, learnerUsdPerDay: 2.5, globalUsdPerDay: 0, stepsPerTurn: 12, resumesPerTurn: 0 });

    const bad = [{ usd_global_day: "" }, { turns_per_learner_day: "1.5" }, { usd_per_learner_day: "-1" }, { usd_per_learner_day: "0.001" }, { usd_global_day: "1e3" }, { turns_per_learner_day: "10001" }, { steps_per_turn: "0" }, { resumes_per_turn: "21" }];
    for (const change of bad) {
      expect(await send("caps", { ...fields, turns_per_learner_day: "7", ...change }), JSON.stringify(change)).toEqual({ status: 303, location: "/admin?done=bad_caps#caps" });
    }
    expect(await send("caps", { turns_per_learner_day: "7", usd_per_learner_day: "2.5", usd_global_day: "1", steps_per_turn: "10" })).toEqual({ status: 303, location: "/admin?done=bad_caps#caps" });
    expect((await readSettings(jar.db)).caps).toEqual({ learnerTurnsPerDay: 90, learnerUsdPerDay: 2.5, globalUsdPerDay: 0, stepsPerTurn: 12, resumesPerTurn: 0 });
  });

  it("approve lets a waiting person in at once; approving again changes nothing", async () => {
    expect(await send("access", { userId: noor.id, action: "approve" })).toEqual({ status: 303, location: "/admin?done=approved#people" });
    const people = await peopleWithAccess(jar.db);
    const noorsLearner = people.find((p) => p.userId === noor.id);
    expect(noorsLearner).toMatchObject({ email: noor.email, name: "Noor" });
    expect(await waitingRequests(jar.db)).toEqual([]);

    expect(await send("access", { userId: noor.id, action: "approve" })).toEqual({ status: 303, location: "/admin?done=approved#people" });
    expect((await peopleWithAccess(jar.db)).filter((p) => p.userId === noor.id)).toEqual([noorsLearner]);
  });

  it("deny needs its confirm field; then it signs the person out and keeps them out, and repeating it changes nothing", async () => {
    expect((await send("access", { userId: asha.id, action: "deny" })).status).toBe(400);
    expect((await send("access", { userId: asha.id, action: "deny", confirm: "yes" })).status).toBe(400);
    expect(await isDenied(jar.db, asha.id)).toBe(false);
    expect(await sessionsOf(asha.id)).toBe(1);

    // Remove access (Asha has access) and Deny (Noor waits) are the same action.
    expect(await send("access", { userId: asha.id, action: "deny", confirm: "deny" })).toEqual({ status: 303, location: "/admin?done=denied#denied" });
    expect(await send("access", { userId: noor.id, action: "deny", confirm: "deny" })).toEqual({ status: 303, location: "/admin?done=denied#denied" });
    expect(await isDenied(jar.db, asha.id)).toBe(true);
    expect(await isDenied(jar.db, noor.id)).toBe(true);
    expect(await sessionsOf(asha.id)).toBe(0);
    expect(await sessionsOf(noor.id)).toBe(0);
    expect(await send("access", { userId: asha.id, action: "deny", confirm: "deny" })).toEqual({ status: 303, location: "/admin?done=denied#denied" });

    // Approving again brings Asha back as the Learner she had.
    const [before] = await jar.db.select().from(learners).where(eq(learners.authUserId, asha.id));
    expect(await send("access", { userId: asha.id, action: "approve" })).toEqual({ status: 303, location: "/admin?done=approved#people" });
    expect((await peopleWithAccess(jar.db)).find((p) => p.userId === asha.id)?.learnerId).toBe(before.id);
  });

  it("the owner can't deny themselves, an unknown person changes nothing, and a bad request is a 400", async () => {
    expect(await send("access", { userId: owner.id, action: "deny", confirm: "deny" })).toEqual({ status: 303, location: "/admin?done=owner_stays#people" });
    expect(await isDenied(jar.db, owner.id)).toBe(false);
    expect(await send("access", { userId: "nobody", action: "approve" })).toEqual({ status: 303, location: "/admin?done=gone#waiting" });
    expect(await send("access", { userId: "nobody", action: "deny", confirm: "deny" })).toEqual({ status: 303, location: "/admin?done=gone#waiting" });
    expect((await send("access", { userId: noor.id, action: "open" })).status).toBe(400);
    expect((await send("access", { action: "approve" })).status).toBe(400);
    expect(await waitingRequests(jar.db)).toHaveLength(1);
  });

  it("invite adds the email, trimmed and lowercase, with its note, and never takes a Learner name; again changes nothing", async () => {
    const fields = { email: "  Mia.Shah@Example.com ", note: " from the meetup ", learnerName: "owner", learner: "owner" };
    expect(await send("invites", fields)).toEqual({ status: 303, location: "/admin?done=invited#invite" });
    expect(await inviteFor(jar.db, "mia.shah@example.com")).toMatchObject({ email: "mia.shah@example.com", note: "from the meetup", learnerName: null });
    expect(await send("invites", { email: "mia.shah@example.com" })).toEqual({ status: 303, location: "/admin?done=already#invite" });
    expect(await inviteFor(jar.db, "mia.shah@example.com")).toMatchObject({ note: "from the meetup" });
  });

  it("invite refuses what isn't an email, writing nothing", async () => {
    for (const email of ["", "mia", "mia@", "@x.com", "mia @x.com", `${"m".repeat(250)}@x.com`]) {
      expect(await send("invites", { email }), email).toEqual({ status: 303, location: "/admin?done=bad_email#invite" });
    }
    expect((await jar.db.select().from(invites)).map((i) => i.email)).toEqual([owner.email]);
  });

  it("inviting a waiting person's email lets them in at once; a denied person's stays denied", async () => {
    expect(await send("invites", { email: "NOOR@icloud.com" })).toEqual({ status: 303, location: "/admin?done=approved#people" });
    expect((await peopleWithAccess(jar.db)).map((p) => p.userId)).toContain(noor.id);

    await send("access", { userId: asha.id, action: "deny", confirm: "deny" });
    expect(await send("invites", { email: asha.email })).toEqual({ status: 303, location: "/admin?done=invited_denied#denied" });
    expect(await isDenied(jar.db, asha.id)).toBe(true);
  });
});
