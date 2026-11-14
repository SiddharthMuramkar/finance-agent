// Records every blog post the backfill loaded in library_documents, so the weekly refresh sees only
// posts that are genuinely new or edited since. Run once after the backfill; safe to run again:
//   npm run library:seed-documents -- <scratch dir>
// Reads the feed pages that `library:blog` cached in <scratch> (blog-<start>.json); `library:blog`
// also runs this itself after it loads. A post is recorded under the same updated time the refresh
// would compare (the feed's updated time, else its published time).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { blogDocuments } from "../src/library/blog.ts";
import { recordDocument } from "../src/library/picture-cache.ts";

const [scratchArg] = process.argv.slice(2);
if (!scratchArg) {
  console.error("Usage: npm run library:seed-documents -- <scratch dir>");
  process.exit(1);
}
const scratch = resolve(scratchArg);
const feedFiles = existsSync(scratch) ? readdirSync(scratch).filter((f) => /^blog-\d+\.json$/.test(f)) : [];
if (!feedFiles.length) {
  console.error(`No cached blog-<start>.json feed pages in ${scratch}: run library:blog first.`);
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
const db = drizzle({ client: neon(url) });
let n = 0;
for (const file of feedFiles) {
  for (const doc of blogDocuments(JSON.parse(readFileSync(join(scratch, file), "utf8")))) {
    await recordDocument(db, "damodaran-blog", doc.ref, doc.publishedAt, doc.updatedAt ?? doc.publishedAt);
    n++;
  }
}
console.log(`${n} blog posts recorded in library_documents.`);
