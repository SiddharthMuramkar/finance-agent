import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/library-refresh/route";
import { config as proxyConfig } from "@/proxy";
import { testDb } from "@/test/pglite";
import type { Db } from "@/db/types";
import { sql } from "drizzle-orm";
import { BLOG_SOURCE, SHEETS_SOURCE, isCronRequest, refreshLibrary, startRun, STALE_AFTER_MS, type RefreshDeps } from "./refresh";
import { searchPassages } from "./search";
import type { PictureClient } from "./pictures-run";

const SOURCES: RefreshDeps["sources"] = {
  blog: {
    id: BLOG_SOURCE,
    title: "Musings on Markets",
    kind: "dated",
    licence: "All rights reserved; short quotes with credit",
    licenceUrl: "https://example.org/terms",
    credit: "A. Damodaran, Musings on Markets",
    url: "https://aswathdamodaran.blogspot.com/",
    fetchedOn: "2026-11-03",
    quoteWords: 60,
  },
  sheets: {
    id: SHEETS_SOURCE,
    title: "Spreadsheets",
    kind: "dated",
    licence: "Open site",
    licenceUrl: "https://example.org/terms",
    credit: "A. Damodaran, NYU Stern",
    url: "https://pages.stern.nyu.edu/~adamodar/",
    fetchedOn: "2026-11-03",
  },
};

const PROSE = "Valuing a lottery means discounting each of the thirty graduated instalments back to today at a rate that reflects the risk of the payer, so the headline jackpot is far larger than its value.";
const MORE = "A later edit adds that the winner who took the cash option received about sixty percent of the advertised jackpot, which is the price of getting money early.";

/** One Blogger feed entry. */
function entry(n: number, o: { published?: string; updated?: string; html?: string; title?: string } = {}) {
  return {
    id: { $t: `tag:blogger.com,1999:blog-1.post-${n}` },
    title: { $t: o.title ?? `Post ${n}` },
    published: { $t: o.published ?? "2019-01-10T09:00:00.000-08:00" },
    updated: { $t: o.updated ?? o.published ?? "2019-01-10T09:00:00.000-08:00" },
    content: { $t: o.html ?? `<p>${PROSE} (post ${n})</p>` },
    link: [{ rel: "alternate", href: `https://aswathdamodaran.blogspot.com/2019/01/post-${n}.html` }],
  };
}

const feedOf = (entries: object[]) => ({ feed: { entry: entries, openSearch$totalResults: { $t: String(entries.length) } } });

/** A scripted network: the feed, spreadsheet files, and a record of what was asked for. */
function network(entries: object[], files: Record<string, { bytes: Uint8Array; lastModified?: string }> = {}) {
  const asked: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url.startsWith("https://aswathdamodaran.blogspot.com/feeds/")) return new Response(JSON.stringify(feedOf(entries)));
    const file = files[url];
    if (!file) return new Response("gone", { status: 404 });
    return new Response(file.bytes as BodyInit, { headers: file.lastModified ? { "last-modified": file.lastModified } : {} });
  }) as typeof fetch;
  return { fetchFn, asked };
}

const FIXED = new Date("2026-11-09T21:30:00.000Z");
const stored = async (db: Db) => ((await db.execute(sql`select source_id, ref, published_on::text as published_on, text, embedding is not null as embedded from library_passages order by id`)) as unknown as { rows: unknown[] }).rows as { source_id: string; ref: string; published_on: string; text: string; embedded: boolean }[];
const runs = async (db: Db) => ((await db.execute(sql`select id, status, watermark, added, failed, note from library_refresh_runs order by id`)) as unknown as { rows: unknown[] }).rows as { id: number; status: string; watermark: string | null; added: { ref: string; edited: boolean }[]; failed: { step: string; message: string }[]; note: string | null }[];

describe("the cron route's access", () => {
  const call = (headers: Record<string, string> = {}) => GET(new NextRequest("https://app.example/api/cron/library-refresh", { headers }));

  it("answers 401 without the secret, with a wrong one, and always when CRON_SECRET is not set", async () => {
    process.env.CRON_SECRET = "right-secret";
    try {
      expect((await call()).status).toBe(401);
      expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
      expect((await call({ authorization: "right-secret" })).status).toBe(401);
      delete process.env.CRON_SECRET;
      expect((await call({ authorization: "Bearer " })).status).toBe(401);
      expect((await call({ authorization: "Bearer undefined" })).status).toBe(401);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it("accepts exactly the bearer secret", () => {
    expect(isCronRequest("Bearer s3", "s3")).toBe(true);
    expect(isCronRequest("Bearer s3 ", "s3")).toBe(false);
    expect(isCronRequest(null, "s3")).toBe(false);
    expect(isCronRequest("Bearer s3", undefined)).toBe(false);
  });

  it("is the only route the passcode gate skips beyond the login", () => {
    const gate = new RegExp(`^${proxyConfig.matcher[0]}$`);
    expect(gate.test("/api/cron/library-refresh")).toBe(false);
    for (const path of ["/api/cron/library-refresh/x", "/api/cron/library-refresh2", "/api/cron/other", "/api/cron", "/api/turn", "/api/review", "/course", "/"]) {
      expect(gate.test(path), path).toBe(true);
    }
    expect(gate.test("/api/login")).toBe(false);
  });
});

describe("the lock and the run log", () => {
  it("lets one run in at a time", async () => {
    const db = await testDb();
    const first = await startRun(db, FIXED);
    expect(first).not.toBeNull();
    expect(await startRun(db, new Date(FIXED.getTime() + 60_000))).toBeNull();
  });

  it("marks a run stuck for over 10 minutes as failed and starts a new one", async () => {
    const db = await testDb();
    const stuck = (await startRun(db, FIXED))!;
    expect(await startRun(db, new Date(FIXED.getTime() + STALE_AFTER_MS - 1000))).toBeNull();
    const next = await startRun(db, new Date(FIXED.getTime() + STALE_AFTER_MS + 1000));
    expect(next).not.toBeNull();
    const log = await runs(db);
    expect(log.find((r) => r.id === stuck.id)).toMatchObject({ status: "failed" });
    expect(log.find((r) => r.id === stuck.id)!.note).toMatch(/10 minutes/);
    expect(log.find((r) => r.id === next!.id)!.status).toBe("running");
  });

  it("tells the caller a refresh is locked, and leaves the database alone", async () => {
    const db = await testDb();
    await startRun(db, FIXED);
    const { fetchFn, asked } = network([entry(1)]);
    expect(await refreshLibrary({ db, sources: SOURCES, fetch: fetchFn, now: () => new Date(FIXED.getTime() + 5000) })).toEqual({ status: "locked" });
    expect(asked).toEqual([]);
    expect(await stored(db)).toEqual([]);
  });
});

describe("a weekly refresh", () => {
  it("adds a new post dated by its publication, with pictures read, the run logged and the new passages embedded", async () => {
    const db = await testDb();
    const html = `<p>${PROSE}</p><img src="https://blogger.googleusercontent.com/img/a/AVvX/s320/chart.png" width="600" height="400">`;
    const asked: string[] = [];
    const pictures = {
      messages: {
        create: async (params: { messages: { content: { source?: { url: string } }[] }[] }) => {
          asked.push(params.messages[0].content[0].source!.url);
          return { content: [{ type: "text", text: "Cash option\nShare of jackpot | 60%" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } };
        },
      },
    } as unknown as PictureClient;
    const embedded: string[] = [];
    const { fetchFn } = network([entry(5, { html })]);
    const result = await refreshLibrary({
      db,
      sources: SOURCES,
      fetch: fetchFn,
      now: () => FIXED,
      pictures,
      embed: async (texts) => {
        embedded.push(...texts);
        return texts.map(() => Array.from({ length: 1024 }, () => 0.01));
      },
    });
    expect(result).toMatchObject({ status: "done", moreToDo: false });
    expect(asked).toEqual(["https://blogger.googleusercontent.com/img/a/AVvX/s0/chart.png"]);
    const passages = await stored(db);
    expect(passages.every((p) => p.source_id === BLOG_SOURCE && p.published_on === "2019-01-10" && p.embedded)).toBe(true);
    expect(passages.map((p) => p.text).join("\n")).toContain("[picture] ");
    expect(passages.map((p) => p.text).join("\n")).toContain("Share of jackpot | 60%");
    expect(embedded.length).toBe(passages.length);
    const [log] = await runs(db);
    expect(log).toMatchObject({ status: "done", watermark: FIXED.toISOString() });
    expect(log.added).toEqual([{ ref: "post-5", title: "Post 5", edited: false, passages: passages.length, spreadsheets: 0 }]);
    expect(log.failed).toEqual([]);
  });

  it("asks only for posts changed since the last run, and starts the first run a week back", async () => {
    const db = await testDb();
    const one = network([]);
    await refreshLibrary({ db, sources: SOURCES, fetch: one.fetchFn, now: () => FIXED });
    expect(decodeURIComponent(one.asked[0])).toContain("updated-min=2026-11-01T21:30:00.000Z");
    const two = network([]);
    await refreshLibrary({ db, sources: SOURCES, fetch: two.fetchFn, now: () => new Date(FIXED.getTime() + 7 * 86_400_000) });
    expect(decodeURIComponent(two.asked[0])).toContain(`updated-min=${FIXED.toISOString()}`);
  });

  it("does a few posts a run, oldest first, and carries on from where it stopped next week", async () => {
    const db = await testDb();
    const entries = [3, 1, 2].map((n) => entry(n, { published: `2019-01-0${n}T09:00:00.000Z`, html: `<p>${PROSE} (post ${n})</p>` }));
    const net = network(entries);
    const first = await refreshLibrary({ db, sources: SOURCES, fetch: net.fetchFn, now: () => FIXED, maxPosts: 2 });
    expect(first).toMatchObject({ status: "done", moreToDo: true });
    expect((await runs(db))[0].added.map((a) => a.ref)).toEqual(["post-1", "post-2"]);
    expect((await runs(db))[0].watermark).toBe("2019-01-02T09:00:00.001Z");
    const later = new Date(FIXED.getTime() + 7 * 86_400_000);
    await refreshLibrary({ db, sources: SOURCES, fetch: network(entries.slice(0, 1)).fetchFn, now: () => later, maxPosts: 2 });
    expect((await runs(db))[1].added.map((a) => a.ref)).toEqual(["post-3"]);
    expect((await runs(db))[1].watermark).toBe(later.toISOString());
  });

  it("stops starting work near the budget and leaves the rest for the next run", async () => {
    const db = await testDb();
    let t = FIXED.getTime();
    const net = network([1, 2, 3].map((n) => entry(n, { published: `2019-01-0${n}T09:00:00.000Z` })));
    // Every look at the clock costs 70 s: the first post starts (0 s), the second finds only 160 s of 200 s - 40 s reserve gone.
    const result = await refreshLibrary({ db, sources: SOURCES, fetch: net.fetchFn, now: () => new Date((t += 70_000)), budgetMs: 200_000 });
    expect(result).toMatchObject({ status: "done", moreToDo: true });
    expect((result as { added: unknown[] }).added.length).toBeLessThan(3);
  });

  it("logs a failed spreadsheet and a missing key, and keeps going", async () => {
    const db = await testDb();
    const html = `<p>${PROSE}</p><a href="https://pages.stern.nyu.edu/~adamodar/pc/blog/gone.xlsx">model</a><img src="https://blogger.googleusercontent.com/img/a/AVvX/s320/chart.png">`;
    const result = await refreshLibrary({ db, sources: SOURCES, fetch: network([entry(5, { html })]).fetchFn, now: () => FIXED });
    expect(result).toMatchObject({ status: "done" });
    const [log] = await runs(db);
    expect(log.failed.map((f) => f.step).sort()).toEqual(["embedding", "post-5 pictures", "post-5 spreadsheet"]);
    expect((await stored(db)).length).toBeGreaterThan(0);
  });

  it("adds a post's spreadsheet as its own document, and a failing post stops the watermark", async () => {
    const db = await testDb();
    const url = "https://pages.stern.nyu.edu/~adamodar/pc/blog/lottery.xlsx";
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/sample.xlsx", import.meta.url)));
    const html = `<p>${PROSE}</p><a href="${url}">model</a>`;
    const net = network([entry(5, { html, published: "2019-01-10T09:00:00.000Z" })], { [url]: { bytes, lastModified: "Tue, 15 Jan 2019 10:00:00 GMT" } });
    const result = await refreshLibrary({ db, sources: SOURCES, fetch: net.fetchFn, now: () => FIXED });
    expect((result as { added: { spreadsheets: number }[] }).added[0].spreadsheets).toBe(1);
    const sheets = (await stored(db)).filter((p) => p.source_id === SHEETS_SOURCE);
    expect(sheets.length).toBeGreaterThan(0);
    expect(sheets.every((p) => p.published_on === "2019-01-15" && p.ref.startsWith("post-5-lottery#"))).toBe(true);

    // A broken entry (no id) fails the whole feed read: the run is logged failed and the lock is released.
    const broken = network([{ title: "no id" }]);
    const failed = await refreshLibrary({ db, sources: SOURCES, fetch: broken.fetchFn, now: () => new Date(FIXED.getTime() + 86_400_000) });
    expect(failed).toMatchObject({ status: "failed" });
    expect((await runs(db)).at(-1)).toMatchObject({ status: "failed" });
    expect(await startRun(db, new Date(FIXED.getTime() + 2 * 86_400_000))).not.toBeNull();
  });

  it("answers failed when Blogger's feed does", async () => {
    const db = await testDb();
    const down = (async () => new Response("no", { status: 503 })) as typeof fetch;
    expect(await refreshLibrary({ db, sources: SOURCES, fetch: down, now: () => FIXED })).toMatchObject({ status: "failed", note: expect.stringContaining("503") });
  });
});

describe("an edited post", () => {
  it("keeps the old text on its old date and dates the added text by the edit, so a Case between them cannot see it", async () => {
    const db = await testDb();
    const published = "2019-01-10T09:00:00.000Z";
    const v1 = entry(9, { published, html: `<p>${PROSE}</p>` });
    await refreshLibrary({ db, sources: SOURCES, fetch: network([v1]).fetchFn, now: () => FIXED });

    const edited = entry(9, { published, updated: "2019-06-01T12:00:00.000Z", html: `<p>${PROSE}</p><p>${MORE}</p>` });
    const weekLater = new Date(FIXED.getTime() + 7 * 86_400_000);
    const result = await refreshLibrary({ db, sources: SOURCES, fetch: network([edited]).fetchFn, now: () => weekLater });
    expect((result as { added: { edited: boolean }[] }).added[0].edited).toBe(true);

    const all = await stored(db);
    const withOld = all.filter((p) => p.text.includes("thirty graduated instalments"));
    const withNew = all.filter((p) => p.text.includes("sixty percent"));
    expect(withNew.length).toBeGreaterThan(0);
    expect(withNew.every((p) => p.published_on === "2019-06-01")).toBe(true);
    // The old paragraph shares a passage with the new one (they pack together), so that passage is new text: dated by the edit.
    // The point of the rule is what a Case dated between the post and the edit can find.
    const between = await searchPassages(db, { query: "cash option jackpot instalments", asOf: "2019-03-01", ranking: "full-text", limit: 10 });
    expect(between.some((r) => r.text.includes("sixty percent"))).toBe(false);
    const after = await searchPassages(db, { query: "cash option jackpot instalments", asOf: "2019-07-01", ranking: "full-text", limit: 10 });
    expect(after.some((r) => r.text.includes("sixty percent"))).toBe(true);
    expect(withOld.length).toBeGreaterThan(0);
  });

  it("reads a picture once: an edited post with an unchanged picture makes no model call and keeps the picture's date", async () => {
    const db = await testDb();
    const published = "2019-01-10T09:00:00.000Z";
    const img = `<img src="https://blogger.googleusercontent.com/img/a/AVvX/s320/chart.png" width="600" height="400">`;
    let calls = 0;
    const pictures = {
      messages: {
        create: async () => {
          calls++;
          return { content: [{ type: "text", text: `Cash option\nShare of jackpot | ${calls}0%` }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } };
        },
      },
    } as unknown as PictureClient;
    await refreshLibrary({ db, sources: SOURCES, pictures, fetch: network([entry(9, { published, html: `<p>${PROSE}</p>${img}` })]).fetchFn, now: () => FIXED });
    expect(calls).toBe(1);
    const before = (await stored(db)).find((p) => p.text.includes("Share of jackpot"));
    expect(before?.published_on).toBe("2019-01-10");

    const edited = entry(9, { published, updated: "2019-06-01T12:00:00.000Z", html: `<p>${PROSE}</p>${img}` });
    const weekLater = new Date(FIXED.getTime() + 7 * 86_400_000);
    await refreshLibrary({ db, sources: SOURCES, pictures, fetch: network([edited]).fetchFn, now: () => weekLater });
    expect(calls).toBe(1);
    const after = (await stored(db)).find((p) => p.text.includes("Share of jackpot"));
    expect(after?.text).toContain("Share of jackpot | 10%");
    expect(after?.published_on).toBe("2019-01-10");
    const docs = (await db.execute(sql`select ref, updated_at from library_documents`)) as unknown as { rows: { ref: string }[] };
    expect(docs.rows.map((d) => d.ref)).toEqual(["post-9"]);
  });

  it("keeps an unchanged passage's date and embedding when only a later passage is added", async () => {
    const db = await testDb();
    const published = "2019-01-10T09:00:00.000Z";
    const long = Array.from({ length: 3 }, (_, i) => `<h2>Part ${i}</h2><p>${PROSE} Section ${i} has its own distinct sentences about discounting and risk.</p>`).join("");
    await refreshLibrary({ db, sources: SOURCES, fetch: network([entry(9, { published, html: long })]).fetchFn, now: () => FIXED, embed: async (t) => t.map(() => Array.from({ length: 1024 }, () => 0.02)) });
    const before = await stored(db);
    const edited = entry(9, { published, updated: "2019-06-01T12:00:00.000Z", html: `${long}<h2>Part 3</h2><p>${MORE}</p>` });
    await refreshLibrary({ db, sources: SOURCES, fetch: network([edited]).fetchFn, now: () => new Date(FIXED.getTime() + 7 * 86_400_000) });
    const after = await stored(db);
    expect(after.length).toBe(before.length + 1);
    for (const old of before) expect(after.find((p) => p.text === old.text)).toMatchObject({ published_on: "2019-01-10", embedded: true });
    expect(after.find((p) => p.text.includes("sixty percent"))).toMatchObject({ published_on: "2019-06-01", embedded: false });
  });
});

describe("a failing reindex after the posts are in", () => {
  it("still finishes done with its watermark and says what failed", async () => {
    const real = await testDb();
    // A plain index under the BM25 index's name makes the refresh take its reindex path (PGlite has no BM25).
    await real.execute(sql`create index library_passages_bm25 on library_passages (text)`);
    const db = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "execute") {
          return (q: unknown) => {
            if (JSON.stringify(q).includes("reindex index")) throw new Error("cannot rebuild the index here");
            return (target as unknown as { execute: (q: unknown) => unknown }).execute(q);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const { fetchFn } = network([entry(5, { html: `<p>${PROSE}</p>` })]);
    const result = await refreshLibrary({ db, sources: SOURCES, fetch: fetchFn, now: () => FIXED });
    expect(result).toMatchObject({ status: "done" });
    const [log] = await runs(real);
    expect(log.status).toBe("done");
    expect(log.watermark).toBe(FIXED.toISOString());
    expect(log.failed.some((f) => f.step === "statistics")).toBe(true);
  });
});
