// Laptop backfill for Damodaran's blog (Musings on Markets). Run:
//   npm run library:blog -- <scratch dir> [--no-load]
// Fetches Blogger's JSON feed (100 posts a call, cached in the scratch folder, which stays OUTSIDE the
// repo), reads the posts with the TypeScript reader in src/library/blog.ts, writes
// <scratch>/damodaran-blog.documents.json, then loads it with `library:load` (cleaning, cutting,
// replacing the source's passages, refreshing the BM25 statistics). --no-load stops after the file.
// The weekly refresh (a later ticket) uses the same reader.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { blogDocuments, feedCount, feedTotal } from "../src/library/blog.ts";

const args = process.argv.slice(2);
const noLoad = args.includes("--no-load");
const [scratchArg] = args.filter((a) => !a.startsWith("--"));
if (!scratchArg) {
  console.error("Usage: npm run library:blog -- <scratch dir> [--no-load]");
  process.exit(1);
}
const scratch = resolve(scratchArg);
mkdirSync(scratch, { recursive: true });

const UA = "finance-agent-library/1.0 (siddharth.muramkar@icloud.com; private study use)";
const PAUSE_MS = 600;

/** One feed page, from the scratch cache when it is there, otherwise fetched politely (declared User-Agent, a pause after each call). */
async function feedPage(start) {
  const cache = join(scratch, `blog-${start}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const url = `https://aswathdamodaran.blogspot.com/feeds/posts/default?max-results=100&start-index=${start}&alt=json`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      writeFileSync(cache, text);
      await new Promise((r) => setTimeout(r, PAUSE_MS));
      return JSON.parse(text);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// Picture text read by `library:pictures` (cached by picture address) is placed in the posts where the pictures are.
const readingsFile = join(scratch, "pictures.json");
const readings = existsSync(readingsFile) ? JSON.parse(readFileSync(readingsFile, "utf8")) : {};
console.log(`${Object.values(readings).filter((r) => r.text).length} picture readings found to place in the posts.`);

const docs = [];
for (let start = 1; ; ) {
  const page = await feedPage(start);
  const count = feedCount(page);
  if (!count) break;
  docs.push(...blogDocuments(page, { readings }));
  start += count;
  if (start > feedTotal(page)) break;
}

const out = join(scratch, "damodaran-blog.documents.json");
writeFileSync(out, JSON.stringify(docs));
const words = docs.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.paragraphs.reduce((k, p) => k + p.split(/\s+/).filter(Boolean).length, 0), 0), 0);
console.log(`${docs.length} blog posts, ${words} words -> ${out}`);

if (!noLoad) {
  execFileSync(process.execPath, ["scripts/library-load.mjs", "damodaran-blog", out], { stdio: "inherit" });
}
