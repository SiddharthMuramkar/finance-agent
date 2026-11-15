import { eq, sql } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClerkDirectory } from "@/auth/clerk-directory";
import type { Admin } from "@/auth/owner";
import { learners, replyChecks, sessions, turns, tutorIncidents, usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb, testDbThrough } from "@/test/pglite";

/**
 * /admin (issue #33): the admin's page for what the Tutor costs and how fast it answers; who may come in is Clerk's,
 * so the page links there. Anyone else gets the not-found page, decided by signedInAdmin (tested in
 * src/auth/owner.test.ts, mocked here). The figures are read from a real database; each person's email from Clerk
 * (src/auth/clerk-directory.ts, mocked here).
 */
const jar = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  admin: null as null | Admin,
  directory: { people: new Map(), answered: true } as ClerkDirectory,
  asked: [] as string[][],
}));

vi.mock("@/db/client", () => ({ getDb: () => jar.db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/auth/owner", () => ({ signedInAdmin: async () => jar.admin }));
vi.mock("@/auth/clerk-directory", () => ({
  clerkDirectory: async (ids: readonly string[]) => {
    jar.asked.push([...ids]);
    return jar.directory;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: AdminPage, dynamic } = await import("./page");

const open = () => AdminPage();
const render = async () => renderToStaticMarkup(await open());
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The HTML of one section, by its id. */
const section = (html: string, id: string) => {
  const start = html.indexOf(`id="${id}"`);
  expect(start, `section #${id}`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
};

/** The admin, as their Clerk session says. */
const OWNER = { userId: "user_owner", email: "owner@x.com", firstName: "Siddharth", admin: true };

/** The owner's Clerk user is linked to Learner 1 ("owner"); Asha has a Learner of her own. */
async function seed(db: Db) {
  const [owner] = await db.update(learners).set({ clerkUserId: OWNER.userId }).where(eq(learners.name, "owner")).returning();
  await db.insert(learners).values({ name: "Asha", clerkUserId: "user_asha" });
  return owner;
}

const answered = (people: Record<string, { email: string | null; banned?: boolean }>): ClerkDirectory => ({
  people: new Map(Object.entries(people).map(([id, p]) => [id, { email: p.email, banned: p.banned ?? false }])),
  answered: true,
});

describe("/admin", () => {
  beforeEach(async () => {
    jar.db = await testDb();
    jar.admin = { learner: await seed(jar.db), identity: OWNER };
    jar.directory = answered({ user_owner: { email: OWNER.email }, user_asha: { email: "asha@gmail.com" } });
    jar.asked = [];
  });

  it("is drawn on every request and is not found for anyone but the admin, before Clerk is asked about anyone", async () => {
    expect(dynamic).toBe("force-dynamic");
    jar.admin = null;
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(jar.asked).toEqual([]);
  });

  it("has the sections in order: Spend, Tutor speed, Who may come in", async () => {
    const html = await render();
    expect(html).toMatch(/<h1 class="type-h1">Admin<\/h1>/);
    const ids = [...html.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["spend", "speed", "people"]);
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => text(m[1]).trim());
    expect(headings).toEqual(["Spend", "Tutor speed", "Who may come in"]);
    // ADR 0013: each section is a hairline rule with no box.
    for (const [, cls] of html.matchAll(/<section class="([^"]*)" id="/g)) expect(cls).toMatch(/^border-t border-\[var\(--line\)\]/);
    // The header's account menu is the admin's (accountFor), and no page link is marked current.
    expect(html).not.toContain('aria-current="page"');
    // Who may come in has nothing to press: it is changed in Clerk. (Spend may hold its own forms, such as #36's caps.)
    expect(section(html, "people")).not.toMatch(/<form|<button|btn-primary/);
  });

  it("sends the admin to Clerk for who may come in: the Waitlist to let people in, Users to take access away", async () => {
    const people = section(await render(), "people");
    const t = text(people);
    expect(t).toContain("Clerk");
    expect(t).toContain("/join");
    expect(t).toMatch(/ban/i);
    const links = [...people.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)];
    expect(links.map((m) => m[1])).toEqual(["https://dashboard.clerk.com/~/users/waitlist", "https://dashboard.clerk.com/~/users"]);
    for (const [a] of links) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noreferrer"');
    }
  });

  it("shows each person's estimated spend by their email in Clerk, most this month first, with the total and what is left out", async () => {
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
      // The admin is You, by their Clerk user id. A part of a cent shows as under a cent, never $0.00.
      expect(t).toMatch(/owner@x\.com owner You No turns yet 0 &lt;\$0\.01 \$7\.50/);
      expect(spend.match(/data-tone="brand"[^>]*>You</g)).toHaveLength(1);
      expect(t).toMatch(/Not linked to a Clerk account From before Clerk, the test tools and passcodes 1 step unpriced 0 \$0\.00 \$0\.00/);
      expect(spend).toMatch(/<th scope="col"[^>]*>This month<\/th>/);
      // Clerk is asked once, for the people on the page, in the page's order.
      expect(jar.asked).toEqual([["user_asha", "user_owner"]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a person Clerk has banned or no longer has as Access removed, keeping their past spend", async () => {
    await jar.db.insert(learners).values([
      { name: "Spam", clerkUserId: "user_spam" },
      { name: "Gone", clerkUserId: "user_gone" },
    ]);
    jar.directory = answered({ user_owner: { email: OWNER.email }, user_asha: { email: "asha@gmail.com" }, user_spam: { email: "spam@x.com", banned: true } });
    const spend = section(await render(), "spend");
    const t = text(spend);
    expect(t).toMatch(/spam@x\.com Spam Access removed/);
    // With no email to show, the row names the Clerk user id.
    expect(t).toMatch(/user_gone Gone Access removed/);
    expect(t).not.toMatch(/asha@gmail\.com Asha Access removed/);
    expect(spend.match(/<span data-affordance="tag" data-tone="danger" class="tag">Access removed<\/span>/g)).toHaveLength(2);
  });

  it("names people by their Clerk user id, and says why, when Clerk did not answer; nobody is marked removed", async () => {
    jar.directory = { people: new Map(), answered: false };
    const spend = section(await render(), "spend");
    const t = text(spend);
    expect(t).toMatch(/user_owner owner You/);
    expect(t).toMatch(/user_asha Asha/);
    expect(spend).toMatch(/<p role="status"[^>]*>[^<]*Clerk did not answer/);
    expect(t).not.toContain("Access removed");
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
    // Only 0037's speed numbers are missing here: migration 0038's Learner column (issue #33), which Drizzle names in
    // every Learner it writes or reads back, is put in by hand.
    await jar.db.execute(sql`alter table learners add column clerk_user_id text`);
    jar.admin = { learner: await seed(jar.db), identity: OWNER };
    const html = await render();
    const speed = section(html, "speed");
    expect(text(speed)).toContain("Not available yet");
    expect(speed).not.toContain("<table");
    // The rest of the page is there as usual.
    expect(text(section(html, "spend"))).toContain("this month");
  });
});
