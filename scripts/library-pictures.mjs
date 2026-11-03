// Reads the pictures in Damodaran's blog posts into text, from the laptop. Run:
//   npm run library:pictures -- <scratch dir> <step> [options]
// The scratch folder (OUTSIDE the repo) must already hold the feed pages that `library:blog` cached
// (blog-<start>.json). Steps, in the order to use them:
//   plan                 count the pictures and print the cost estimate. No network, no cost.
//   dry-run [--count 5]  read the first N unread pictures one at a time (a few cents) and print them.
//   submit [--limit N]   send every unread picture as one Message Batch; saves the batch id.
//   collect              pick the batch up (run it again until it says done); caches each reading.
//   verify               the stronger model (Opus) re-reads 40 sampled pictures, then prints the accuracy report.
//   report               print the accuracy report again. No network, no cost.
//   impact               list stored Citations whose blog passages the reload will change (reads the database only).
// Readings are cached in <scratch>/pictures.json by original-size picture address, so nothing is paid
// for twice; `library:blog` places them in the posts the next time it runs. Steps that call the API
// need ANTHROPIC_API_KEY in .env (npm passes --env-file=.env).
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { blogPictures } from "../src/library/blog.ts";
import { accuracyReport, estimateCheckCost, estimateReadCost, SAMPLE_SIZE, unreadPictures } from "../src/library/pictures.ts";
import { collectBatch, dryRun, recheck, submitBatch } from "../src/library/pictures-run.ts";

const args = process.argv.slice(2);
const [scratchArg, step] = args;
if (!scratchArg || !step) {
  console.error("Usage: npm run library:pictures -- <scratch dir> plan|dry-run|submit|collect|verify|report|impact [--count N] [--limit N]");
  process.exit(1);
}
const scratch = resolve(scratchArg);
const flag = (name) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : undefined);
const load = (name, fallback) => (existsSync(join(scratch, name)) ? JSON.parse(readFileSync(join(scratch, name), "utf8")) : fallback);
const save = (name, value) => writeFileSync(join(scratch, name), JSON.stringify(value, null, 1));
const dollars = (n) => `$${n.toFixed(2)}`;

const feedFiles = readdirSync(scratch).filter((f) => /^blog-\d+\.json$/.test(f));
if (!feedFiles.length) throw new Error(`No cached blog-<start>.json feed pages in ${scratch}: run library:blog first.`);
const found = feedFiles.flatMap((f) => blogPictures(JSON.parse(readFileSync(join(scratch, f), "utf8"))));
const urls = [...new Set(found.map((p) => p.url))];
const readings = load("pictures.json", {});
const rereads = load("pictures.rereads.json", {});

const client = async () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (npm run passes --env-file=.env).");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic();
};

function printReport() {
  const r = accuracyReport(readings, rereads);
  console.log(`${r.readings} pictures read; ${r.flagged.length} flagged by the code checks.`);
  for (const f of r.flagged.slice(0, 50)) console.log(`  flagged ${f.url}\n    ${f.problems.join("; ")}`);
  if (r.sampled) console.log(`Stronger model re-read ${r.sampled}: numbers agree on ${r.sampled - r.disagreements.length} (${Math.round((r.agreement ?? 0) * 100)}%).`);
  for (const d of r.disagreements) console.log(`  disagree ${d.url}\n    Haiku only: ${d.haikuOnly.join(", ") || "-"}; stronger only: ${d.strongerOnly.join(", ") || "-"}`);
  if (!r.sampled) console.log("No re-read yet: run the verify step.");
}

if (step === "plan") {
  const todo = unreadPictures(urls, readings).length;
  const batch = estimateReadCost(todo);
  const check = estimateCheckCost(SAMPLE_SIZE);
  const cutOff = urls.filter((u) => readings[u]?.stopReason === "max_tokens").length;
  console.log(`${found.length} pictures in ${new Set(found.map((p) => p.ref)).size} posts, ${urls.length} different; ${urls.length - todo} already read, ${todo} to read (${cutOff} of them cut off by the length limit earlier).`);
  console.log(`Reading ${todo} through the Batches API: about ${dollars(batch.expected)}, worst case ${dollars(batch.worst)}.`);
  console.log(`Stronger-model re-read of ${SAMPLE_SIZE}: about ${dollars(check.expected)}, worst case ${dollars(check.worst)}.`);
} else if (step === "dry-run") {
  const { read, cost } = await dryRun(await client(), urls, readings, flag("--count") ?? 5);
  save("pictures.json", readings);
  for (const url of read) console.log(`\n${url}\n${readings[url].text ?? "(nothing of substance)"}${readings[url].problems.length ? `\n  PROBLEMS: ${readings[url].problems.join("; ")}` : ""}`);
  console.log(`\n${read.length} read one at a time, about ${dollars(cost)} (${dollars(cost / 2)} through the Batches API).`);
} else if (step === "submit") {
  if (existsSync(join(scratch, "pictures.batch.json"))) throw new Error("A batch is already saved (pictures.batch.json): run collect first.");
  const batch = await submitBatch(await client(), urls, readings, { limit: flag("--limit") });
  if (!batch) console.log("Nothing to read: every picture is already cached.");
  else {
    save("pictures.batch.json", batch);
    console.log(`Submitted batch ${batch.id} (${Object.keys(batch.pictures).length} pictures). Run the collect step later; batches finish within 24 hours.`);
  }
} else if (step === "collect") {
  const batch = load("pictures.batch.json", null);
  if (!batch) throw new Error("No saved batch (pictures.batch.json): run submit first.");
  const result = await collectBatch(await client(), batch, readings);
  if (!result.done) console.log(`Batch ${batch.id} is still processing: ${JSON.stringify(result.counts)}`);
  else {
    save("pictures.json", readings);
    console.log(`Batch ${batch.id} done: ${result.added} readings cached, ${result.failed} failed (they stay unread; submit again for them), about ${dollars(result.cost)}.`);
    rmSync(join(scratch, "pictures.batch.json")); // the readings are cached; any that failed are simply unread and go in the next batch
    printReport();
  }
} else if (step === "verify") {
  const { cost } = await recheck(await client(), readings, rereads);
  save("pictures.rereads.json", rereads);
  console.log(`Re-read done, about ${dollars(cost)}.`);
  printReport();
} else if (step === "report") {
  printReport();
} else if (step === "impact") {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { prepareDocuments } = await import("../src/library/prepare.ts");
  const { citationsAtRisk } = await import("../src/library/citation-impact.ts");
  const documents = load("damodaran-blog.documents.json", null);
  if (!documents) throw new Error("No damodaran-blog.documents.json: run `library:blog -- <scratch> --no-load` first (it places the cached readings in the posts).");
  const { passages } = prepareDocuments(documents.map((d) => ({ ...d, publishedOn: d.publishedOn ?? null })));
  const db = drizzle({ client: neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL) });
  const risk = await citationsAtRisk(db, "damodaran-blog", passages);
  console.log(risk.length ? `${risk.length} cited blog passages will change:` : "No stored Citation points at a blog passage that will change.");
  for (const r of risk) console.log(`  passage ${r.passageId} (${r.ref}, ${r.change}) "${r.heading}" cited in ${r.citedBy.map((c) => `session ${c.sessionId} message ${c.seq}`).join(", ")}`);
} else {
  console.error(`Unknown step "${step}".`);
  process.exit(1);
}
