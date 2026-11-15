import { eq, sql } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Owner } from "@/auth/owner";
import { accessDenials, account, invites, learners, replyChecks, sessions, settings, turns, tutorIncidents, usageRows, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb, testDbThrough } from "@/test/pglite";
import { readSettings } from "@/tutor/session-log";

/**
 * /admin (ADR 0014): the owner's page for who may come in. Anyone else gets the not-found page, decided by
 * signedInOwner (tested in src/auth/owner.test.ts, mocked here). The lists are read from a real database.
 */
const jar = vi.hoisted(() => ({ db: undefined as unknown as Db, owner: null as null | Owner }));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/auth/owner", () => ({ signedInOwner: async () => jar.owner }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: AdminPage, dynamic } = await import("./page");

const open = (query: Record<string, string> = {}) => AdminPage({ searchParams: Promise.resolve(query) });
const render = async (query: Record<string, string> = {}) => renderToStaticMarkup(await open(query));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The HTML of one section, by its id. */
const section = (html: string, id: string) => {
  const start = html.indexOf(`id="${id}"`);
  expect(start, `section #${id}`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
};

const OWNER = { id: "u-owner", email: "owner@x.com", name: "Siddharth" };

/** The owner linked to Learner 1; Noor (email link) and Ravi (Google) wait; Asha has access; Spam is denied; Mia is invited. */
async function seed(db: Db) {
  await db.insert(user).values([
    { ...OWNER, emailVerified: true, createdAt: new Date("2026-11-01T06:00:00Z") },
    { id: "u-noor", email: "noor@icloud.com", name: "Noor", emailVerified: true, createdAt: new Date("2026-11-03T06:00:00Z") },
    { id: "u-ravi", email: "ravi@gmail.com", name: "Ravi K", emailVerified: true, createdAt: new Date("2026-11-04T06:00:00Z") },
    { id: "u-asha", email: "asha@gmail.com", name: "Asha", emailVerified: true, createdAt: new Date("2026-11-02T06:00:00Z") },
    { id: "u-spam", email: "spam@x.com", name: "Spam", emailVerified: true, createdAt: new Date("2026-11-05T06:00:00Z") },
  ]);
  const now = new Date();
  await db.insert(account).values({ id: "a-ravi", accountId: "g-ravi", providerId: "google", userId: "u-ravi", createdAt: now, updatedAt: now });
  const [owner] = await db.update(learners).set({ authUserId: OWNER.id }).where(eq(learners.name, "owner")).returning();
  await db.insert(learners).values({ name: "Asha", authUserId: "u-asha" });
  await db.insert(accessDenials).values({ userId: "u-spam" });
  await db.insert(invites).values([
    { email: OWNER.email, learnerName: "owner" },
    { email: "mia@example.com", note: "from the meetup" },
  ]);
  return owner;
}

describe("/admin", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    const learner = await seed(jar.db);
    jar.owner = { learner, user: OWNER };
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is drawn on every request and is not found for anyone but the owner", async () => {
    expect(dynamic).toBe("force-dynamic");
    jar.owner = null;
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("has the sections in order: Waiting, People with access, Spend, Tutor speed, Denied, Invite an email, Spend caps, Sign-up", async () => {
    const html = await render();
    expect(html).toMatch(/<h1 class="type-h1">Admin<\/h1>/);
    const ids = [...html.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["waiting", "people", "spend", "speed", "denied", "invite", "caps", "sign-up"]);
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => text(m[1]).trim());
    expect(headings).toEqual(["Waiting 2", "People with access", "Spend", "Tutor speed", "Denied", "Invite an email", "Spend caps", "Sign-up"]);
    // ADR 0013: each section is a hairline rule with no box.
    for (const [, cls] of html.matchAll(/<section class="([^"]*)" id="/g)) expect(cls).toMatch(/^border-t border-\[var\(--line\)\]/);
    // The header's account menu is the owner's (accountFor), and no page link is marked current.
    expect(html).not.toContain('aria-current="page"');
  });

  it("lists who waits, oldest first, by email, with how they signed in and when", async () => {
    const waiting = section(await render(), "waiting");
    const t = text(waiting);
    expect(t.indexOf("noor@icloud.com")).toBeLessThan(t.indexOf("ravi@gmail.com"));
    expect(t).toMatch(/noor@icloud\.com Noor Email link Asked 3 Nov 2026/);
    expect(t).toMatch(/ravi@gmail\.com Ravi K Google Asked 4 Nov 2026/);
    // The count beside the heading is a warning Tag.
    expect(waiting).toMatch(/<span data-affordance="tag" data-tone="warning" class="tag">2<\/span>/);
    // Approve is a plain form post; Deny opens a confirm first, so no deny is posted from the row itself.
    expect(waiting.match(/<form[^>]* action="\/api\/admin\/access" method="post"/g)).toHaveLength(2);
    expect(waiting).toContain('<input type="hidden" name="action" value="approve"/>');
    expect(waiting).not.toContain('name="confirm"');
    expect(waiting.match(/>Deny<\/button>/g)).toHaveLength(2);
    expect(t).not.toContain("spam@x.com");
  });

  it("lists the people with access, the owner first as You with no button, and the invites nobody has used", async () => {
    const people = section(await render(), "people");
    const t = text(people);
    expect(t.indexOf("owner@x.com")).toBeLessThan(t.indexOf("asha@gmail.com"));
    expect(people).toMatch(/<span data-affordance="tag" data-tone="brand" class="tag">You<\/span>/);
    expect(people.match(/>Remove access<\/button>/g)).toHaveLength(1);
    expect(t).toContain("Invited, not signed in yet");
    expect(t).toMatch(/mia@example\.com from the meetup Invited/);
    // The owner's own invite is used, so it is not listed as waiting to be used.
    expect(t.match(/owner@x\.com/g)).toHaveLength(1);
  });

  it("shows each person's estimated spend, most this month first, with the total and what is left out", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
    try {
      const db = jar.db;
      const session = async (learnerId: number) =>
        (await db.insert(sessions).values({ learnerId, instructions: "i", tools: [], model: "claude-opus-5-5", effort: "medium", fingerprint: "f" }).returning())[0].id;
      let seq = 0;
      const step = async (sessionId: number, costUsd: number | null, at: string) =>
        db.insert(usageRows).values({
          sessionId,
          turnSeq: ++seq,
          kind: "step",
          step: 1,
          model: costUsd === null ? "claude-unknown-9" : "claude-opus-5-5",
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          tools: [],
          durationMs: 1,
          costUsd,
          createdAt: new Date(at),
        });
      const [asha] = await db.select().from(learners).where(eq(learners.name, "Asha"));
      const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
      await step(await session(asha.id), 1.234, "2026-11-10T10:00:00Z");
      await step(await session(1), 7.5, "2026-10-20T10:00:00Z"); // the owner, last month
      await step(await session(1), 0.002, "2026-11-11T10:00:00Z");
      await step(await session(tools.id), null, "2026-11-11T11:00:00Z");
      await db.insert(turns).values({ learnerId: asha.id, status: "finished", startedAt: new Date("2026-11-10T10:00:00Z") });

      const spend = section(await render(), "spend");
      const t = text(spend);
      expect(t).toContain("estimated at list prices");
      expect(t).toContain("Tutor model calls only");
      expect(t).toContain("India time");
      expect(t).toMatch(/\$1\.24 this month \$8\.74 all time 1 turn /);
      expect(t).toContain("1 step used a model with no price in the table");
      // Asha spent more this month than the owner, so she comes first.
      expect(t.indexOf("asha@gmail.com")).toBeLessThan(t.indexOf("owner@x.com"));
      expect(t).toMatch(/asha@gmail\.com Asha Last active 10 Nov 2026 1 \$1\.23 \$1\.23/);
      // A part of a cent shows as under a cent, never $0.00.
      expect(t).toMatch(/owner@x\.com owner You No turns yet 0 &lt;\$0\.01 \$7\.50/);
      expect(t).toMatch(/Not linked to a sign-in The test tools and passcodes 1 step unpriced 0 \$0\.00 \$0\.00/);
      expect(spend).toMatch(/<th scope="col"[^>]*>This month<\/th>/);
      // View only: nothing to press.
      expect(spend).not.toMatch(/<form|<button/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists a removed person's past spend, marked", async () => {
    const [spam] = await jar.db.insert(learners).values({ name: "Spam", authUserId: "u-spam" }).returning();
    const [s] = await jar.db.insert(sessions).values({ learnerId: spam.id, instructions: "i", tools: [], model: "claude-opus-5-5", effort: "medium", fingerprint: "f" }).returning();
    await jar.db.insert(usageRows).values({ sessionId: s.id, turnSeq: 1, kind: "step", step: 1, model: "claude-opus-5-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, tools: [], durationMs: 1, costUsd: 0.4 });
    const spend = section(await render(), "spend");
    expect(text(spend)).toMatch(/spam@x\.com Spam Access removed/);
    expect(spend).toMatch(/<span data-affordance="tag" data-tone="danger" class="tag">Access removed<\/span>/);
  });

  it("shows Tutor speed by Reply kind over the last 30 days, in seconds with one decimal, with the budgets and what went wrong", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
    try {
      const db = jar.db;
      const [s] = await db.insert(sessions).values({ learnerId: 1, instructions: "i", tools: [], model: "gpt-6.1-sol", effort: "medium", fingerprint: "f" }).returning();
      const turn = (replyKind: string | null, firstWordMs: number | null, totalMs: number | null, at: string, firstEventMs: number | null = null) =>
        db.insert(turns).values({ learnerId: 1, sessionId: s.id, status: "finished", replyKind, firstEventMs, firstWordMs, totalMs, startedAt: new Date(at) });
      // Own questions: first words 1.2, 2.45 and 6.0 s; median the 2nd (2.45 s, shown 2.5 s), 95th the 3rd (ceil(2.85) = 3).
      // First events 0.4, 0.9 and 1.6 s: median 0.9 s, 95th 1.6 s.
      await turn("answer_question", 1200, 4000, "2026-11-11T10:00:00Z", 400);
      await turn("answer_question", 2450, 5000, "2026-11-10T10:00:00Z", 900);
      await turn("answer_question", 6000, 13049, "2026-10-14T10:00:00Z", 1600);
      await turn("answer_question", 90000, 90000, "2026-10-01T10:00:00Z"); // over 30 days ago
      await turn(null, null, 3000, "2026-11-11T11:00:00Z"); // a Next with no kind chosen, which showed no words
      await db.insert(tutorIncidents).values([
        { learnerId: 1, sessionId: s.id, kind: "replay_stripped", createdAt: new Date("2026-11-11T10:00:00Z") },
        // A9: Widget state saves over budget, the 10.9 s one of 11 November among them; counted apart from repairs.
        { learnerId: 1, sessionId: s.id, kind: "widget_save_slow", detail: { ms: 10900, over: "p95" }, createdAt: new Date("2026-11-11T10:00:00Z") },
        { learnerId: 1, sessionId: s.id, kind: "widget_save_slow", detail: { ms: 700, over: "median" }, createdAt: new Date("2026-11-11T10:00:00Z") },
      ]);
      await db.insert(replyChecks).values([
        { sessionId: s.id, turnSeq: 1, words: 90, cap: 120, shownText: "x", draftProblems: [{ rule: "V1", message: "long" }], createdAt: new Date("2026-11-11T10:00:00Z") },
        { sessionId: s.id, turnSeq: 2, words: 40, cap: 120, shownText: "x", draftProblems: [{ rule: "guard", message: "stopped" }], fallback: true, createdAt: new Date("2026-11-11T10:00:00Z") },
      ]);

      const speed = section(await render(), "speed");
      const t = text(speed);
      expect(t).toContain("last 30 days");
      expect(speed).toMatch(/<th scope="col"[^>]*>First word, median<\/th>/);
      // Complete: 4.0, 5.0 and 13.049 s; median 5.0 s, 95th 13.0 s.
      expect(speed).toMatch(/<th scope="col"[^>]*>First event, median<\/th>/);
      expect(t).toMatch(/Answer to a question 3 0\.9 s 1\.6 s 2\.5 s 6\.0 s 5\.0 s 13\.0 s /);
      expect(t).not.toContain("90.0 s");
      // No first word: a dash, never 0.0 s.
      expect(t).toMatch(/No kind chosen 1 – – – – 3\.0 s 3\.0 s /);
      expect(t).toMatch(/first word within 2\.5 s at the median and 5\.0 s at the 95th percentile; a step-led reply \(every other kind\) is complete within 6\.0 s and 12\.0 s/);
      expect(t).toMatch(/Sessions repaired instead of failing the turn 1 \(replay stripped: 1 time\)/);
      expect(t).toMatch(/Streamed replies that slipped a check \(shown as they were\) 1 /);
      expect(t).toMatch(/Streamed replies the guard stopped mid-reply 1 /);
      expect(t).toMatch(/Widget saves over 0\.5 s \(the median budget\), and over 1\.0 s \(the 95th percentile budget\) 2 \/ 1/);
      // View only: nothing to press.
      expect(speed).not.toMatch(/<form|<button/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says Tutor speed has no turns to show on a quiet month", async () => {
    const t = text(section(await render(), "speed"));
    expect(t).toContain("No timed turns in the last 30 days.");
    expect(t).toMatch(/Sessions repaired instead of failing the turn 0 /);
  });

  it("still draws the page before migration 0037, saying the speed numbers are not available yet", async () => {
    jar.db = await testDbThrough("0036_session_items_turn");
    // Only 0037's speed numbers are missing here: migration 0039's Learner column (issue #33), which Drizzle names in
    // every Learner it writes or reads back, is put in by hand.
    await jar.db.execute(sql`alter table learners add column clerk_user_id text`);
    const learner = await seed(jar.db);
    jar.owner = { learner, user: OWNER };
    const html = await render();
    const speed = section(html, "speed");
    expect(text(speed)).toContain("Not available yet");
    expect(speed).not.toContain("<table");
    // The rest of the page is there as usual.
    expect(text(section(html, "spend"))).toContain("this month");
  });

  it("lists the denied, who can be approved again", async () => {
    const denied = section(await render(), "denied");
    expect(text(denied)).toContain("spam@x.com");
    expect(denied).toContain('<input type="hidden" name="userId" value="u-spam"/>');
    expect(denied).toMatch(/>Approve<\/button>/);
  });

  it("has one primary button, Invite, on a form that takes an email and a note", async () => {
    const html = await render();
    expect(html.match(/class="btn btn-primary[^"]*"/g)).toHaveLength(1);
    const invite = section(html, "invite");
    expect(invite).toMatch(/<form[^>]* action="\/api\/admin\/invites" method="post"/);
    const email = invite.match(/<input[^>]*name="email"[^>]*>/)?.[0];
    expect(email).toContain('type="email"');
    expect(email).toContain("required");
    expect(invite).toMatch(/<input[^>]*name="note"/);
    expect(invite).not.toMatch(/name="learner/);
    expect(invite).toMatch(/<button type="submit"[^>]*class="btn btn-primary[^"]*"[^>]*>Invite<\/button>/);
  });

  it("shows the Spend caps as stored, on one form, with a secondary Save button and the result of a save", async () => {
    await readSettings(jar.db);
    await jar.db.update(settings).set({ value: "2.5" }).where(eq(settings.key, "usd_per_learner_day"));
    const caps = section(await render({ done: "caps_saved" }), "caps");
    expect(caps).toMatch(/<form[^>]* action="\/api\/admin\/caps" method="post"/);
    const input = (name: string) => caps.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
    const value = (name: string) => input(name).match(/value="([^"]*)"/)?.[1];
    expect(["turns_per_learner_day", "usd_per_learner_day", "usd_global_day", "steps_per_turn", "resumes_per_turn"].map(value)).toEqual(["120", "2.5", "30", "10", "2"]);
    expect(input("steps_per_turn")).toContain('min="1"');
    expect(input("turns_per_learner_day")).toContain('step="1"');
    expect(input("usd_global_day")).toContain('step="0.01"');
    expect(caps).toMatch(/<button type="submit"[^>]*class="btn btn-secondary[^"]*"[^>]*>Save caps<\/button>/);
    expect(caps).toMatch(/<p role="status"[^>]*>Saved\. The next turn uses the new caps\.<\/p>/);
    expect(section(await render({ done: "bad_caps" }), "caps")).toMatch(/<p role="alert"[^>]*>Each cap must be a number/);
  });

  it("shows the Sign-up switch read-only, with the command that turns it", async () => {
    const closed = text(section(await render(), "sign-up"));
    expect(closed).toContain("Closed");
    expect(closed).toContain("npm run invites -- open");
    expect(section(await render(), "sign-up")).not.toMatch(/<form|<button/);
  });

  it("shows a change's result in the section it belongs to, and ignores an unknown code", async () => {
    const approved = await render({ done: "approved" });
    expect(section(approved, "people")).toMatch(/<p role="status"[^>]*>Approved\. They can come in now\.<\/p>/);
    expect(section(approved, "waiting")).not.toContain('role="status"');
    const bad = await render({ done: "bad_email" });
    expect(section(bad, "invite")).toMatch(/<p role="alert"[^>]*>That isn&#x27;t an email address/);
    const unknown = await render({ done: "<script>" });
    expect(unknown).not.toMatch(/role="(status|alert)"/);
  });

  it("says when nobody waits, and has no Denied section when nobody is denied", async () => {
    for (const id of ["u-spam", "u-noor", "u-ravi"]) await jar.db.delete(user).where(eq(user.id, id));
    const html = await render();
    expect(text(section(html, "waiting"))).toContain("Nobody is waiting.");
    expect(section(html, "waiting")).not.toContain('data-tone="warning"');
    expect(html).not.toContain('id="denied"');
  });
});
