// Laptop backfill for the spreadsheets behind Damodaran's blog posts. Run:
//   npm run library:sheets -- <scratch dir> --dry-run [N]    reads N files (default 30), writes nothing to a database
//   npm run library:sheets -- <scratch dir> [--no-load]      reads every linked file, writes the documents file, then loads it
// It needs the blog's feed cache in <scratch> (run `npm run library:blog -- <scratch> --no-load` first).
// Downloaded files are cached in <scratch>/sheets; the scratch folder stays OUTSIDE the repo.
// The dry run spreads its picks across the years, always includes the oldest .xls, and prints one
// line per file (sheets read, hidden sheets skipped, passages) and a report file.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bloggerFeed } from "../src/library/blog.ts";
import { prepareDocuments } from "../src/library/prepare.ts";
import { fetchSpreadsheet, readWorkbook, spreadsheetLinks, workbookDocument } from "../src/library/spreadsheets.ts";

const args = process.argv.slice(2);
const dry = args.indexOf("--dry-run");
const dryCount = dry >= 0 ? Number(args[dry + 1]) || 30 : 0;
const noLoad = args.includes("--no-load");
const [scratchArg] = args.filter((a, i) => !a.startsWith("--") && !(dry >= 0 && i === dry + 1));
if (!scratchArg) {
  console.error("Usage: npm run library:sheets -- <scratch dir> [--dry-run [N]] [--no-load]");
  process.exit(1);
}
const scratch = resolve(scratchArg);
const cache = join(scratch, "sheets");
mkdirSync(cache, { recursive: true });

// Every (post, file) pair, oldest post first.
const pairs = [];
for (const f of readdirSync(scratch).filter((n) => /^blog-\d+\.json$/.test(n))) {
  for (const e of bloggerFeed.parse(JSON.parse(readFileSync(join(scratch, f), "utf8"))).feed.entry) {
    const post = { ref: `post-${e.id.$t.split("post-").pop()}`, title: e.title.$t || "Untitled post", publishedOn: e.published.$t.slice(0, 10) };
    for (const url of spreadsheetLinks(e.content?.$t ?? "")) {
      pairs.push({ post, url });
    }
  }
}
pairs.sort((a, b) => a.post.publishedOn.localeCompare(b.post.publishedOn));
// A file linked from several posts belongs to the oldest of them.
const first = new Set();
for (let i = 0; i < pairs.length; i++) {
  if (first.has(pairs[i].url)) pairs.splice(i--, 1);
  else first.add(pairs[i].url);
}
console.log(`${pairs.length} spreadsheets linked from ${new Set(pairs.map((p) => p.post.ref)).size} posts (datasets and implied-premium files left out).`);

let chosen = pairs;
if (dryCount) {
  const oldestXls = pairs.find((p) => /\.xls$/i.test(p.url));
  const step = pairs.length / dryCount;
  chosen = [...new Set([oldestXls, ...Array.from({ length: dryCount }, (_, i) => pairs[Math.floor(i * step)])])].slice(0, dryCount);
}

const key = (url) => url.replace(/[^a-z0-9.]+/gi, "_").slice(-150);
const documents = [];
const report = [];
let failed = 0;
for (const { post, url } of chosen) {
  const file = join(cache, key(url));
  const meta = `${file}.json`;
  let got;
  if (existsSync(file) && existsSync(meta)) {
    got = { bytes: new Uint8Array(readFileSync(file)), lastModified: JSON.parse(readFileSync(meta, "utf8")).lastModified };
  } else {
    try {
      got = await fetchSpreadsheet(url);
    } catch (error) {
      got = null;
    }
    if (got) {
      writeFileSync(file, got.bytes);
      writeFileSync(meta, JSON.stringify({ lastModified: got.lastModified }));
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  if (!got) {
    failed++;
    report.push(`MISSING  ${post.publishedOn}  ${url}`);
    continue;
  }
  try {
    const { sheets, hiddenSkipped } = readWorkbook(got.bytes);
    const doc = workbookDocument({ post, url, lastModified: got.lastModified, sheets });
    if (!doc) {
      report.push(`EMPTY    ${post.publishedOn}  ${url}  (${hiddenSkipped} hidden sheets skipped, no readable rows)`);
      continue;
    }
    const prepared = prepareDocuments([doc]);
    documents.push(doc);
    report.push(
      `OK       ${post.publishedOn} -> dated ${doc.publishedOn}  ${url.split("/").pop()}  sheets read ${sheets.length} (${sheets.map((s) => s.name).slice(0, 4).join(", ")}), hidden skipped ${hiddenSkipped}, passages ${prepared.passages.length}, left out ${prepared.rejected.length + prepared.frontMatter.length}`,
    );
  } catch (error) {
    failed++;
    report.push(`UNREADABLE ${post.publishedOn}  ${url}  ${error instanceof Error ? error.message : error}`);
  }
}
console.log(report.join("\n"));
const passages = prepareDocuments(documents).passages;
console.log(`${documents.length} workbooks read, ${failed} missing or unreadable, ${passages.length} passages, ${passages.reduce((n, p) => n + p.text.split(/\s+/).length, 0)} words.`);
writeFileSync(join(scratch, dryCount ? "sheets-dry-run-report.txt" : "sheets-report.txt"), report.join("\n"));

if (!dryCount) {
  const out = join(scratch, "damodaran-spreadsheets.documents.json");
  writeFileSync(out, JSON.stringify(documents));
  console.log(`-> ${out}`);
  if (!noLoad) execFileSync(process.execPath, ["scripts/library-load.mjs", "damodaran-spreadsheets", out], { stdio: "inherit" });
}
