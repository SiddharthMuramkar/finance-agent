// Reads the pages that hold a chart or a scanned slide and hardly any text, with the model's vision, so
// their content becomes findable. Run from the laptop after sources.py has written its candidates:
//   node --env-file=.env scripts/library/vision.mjs <scratch>/<source>.vision-candidates.json [--max 30]
// For each candidate page it renders the page to an image (pdftoppm), asks gpt-6.1-sol to transcribe only
// what is visible (title, axes, series, readable values, notes), and writes <source>.vision.json
// ({ref: {page: description}}), which sources.py merges into the document on its next run.
// Live API spend is small (a few cents per ten pages) and printed at the end.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";

const [file, ...rest] = process.argv.slice(2);
if (!file) throw new Error("Usage: node --env-file=.env scripts/library/vision.mjs <candidates.json> [--max N]");
const max = rest.includes("--max") ? Number(rest[rest.indexOf("--max") + 1]) : 30;
const MODEL = "gpt-6.1-sol"; // the app's one model (TUTOR_MODEL in src/tutor/model.ts)
const PRICE = { input: 2 / 1e6, output: 10 / 1e6 }; // dollars per token, for the printed estimate only
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (run with node --env-file=.env).");
const client = new OpenAI();
const candidates = JSON.parse(readFileSync(file, "utf8"));
const out = file.replace(/\.vision-candidates\.json$/, ".vision.json");
const result = (() => {
  try {
    return JSON.parse(readFileSync(out, "utf8"));
  } catch {
    return {};
  }
})();

const prompt =
  "This is one page of a finance document. If it holds a chart, graph, diagram or table-as-picture, transcribe it for a search index: " +
  "its title, the axes and units, each series, and every value you can read clearly, then one sentence on what it shows. " +
  "Describe only what is visible; do not add outside knowledge or guess unreadable values. " +
  "If the page has nothing of substance (a logo, a blank page, a decorative picture), reply exactly NONE.";

let done = 0;
let spend = 0;
for (const [ref, { pdf, pages }] of Object.entries(candidates)) {
  for (const page of pages) {
    if (done >= max) break;
    if (result[ref]?.[page]) continue;
    const dir = mkdtempSync(join(tmpdir(), "vision-"));
    execFileSync("pdftoppm", ["-r", "90", "-f", String(page), "-l", String(page), "-png", pdf, join(dir, "p")]);
    const image = readFileSync(join(dir, readdirSync(dir)[0])).toString("base64");
    const reply = await client.responses.create({
      model: MODEL,
      max_output_tokens: 4000, // reasoning tokens count against this too
      reasoning: { effort: "medium" },
      store: false,
      input: [{ role: "user", content: [{ type: "input_image", image_url: `data:image/png;base64,${image}` }, { type: "input_text", text: prompt }] }],
    });
    spend += reply.usage.input_tokens * PRICE.input + reply.usage.output_tokens * PRICE.output;
    if (reply.status === "incomplete") {
      // Cut off at the length limit or by the content filter: not the page's whole text, so it is not saved.
      console.log(`${ref} page ${page}: cut off (${reply.incomplete_details?.reason ?? "incomplete"}), not saved`);
      done++;
      continue;
    }
    const text = reply.output_text.trim();
    const nothing = !text || /^\W*none\W*$/i.test(text);
    if (!nothing) (result[ref] ??= {})[page] = text;
    console.log(`${ref} page ${page}: ${nothing ? "nothing of substance" : `${text.split(/\s+/).length} words`}`);
    done++;
  }
}
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`${done} pages read, about $${spend.toFixed(3)} (${MODEL}); wrote ${out}`);
