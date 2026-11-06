// usage: node gen-persona-input.mjs <worktree> <ID> <ref> <out>
// Persona input for a content batch, read straight from a git ref: per changed Topic, every rewritten
// question first (filler up to 5), then changed Checks (conversation prompts) and changed Cases.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
const [wt, id, ref, out] = process.argv.slice(2);
const YAML = createRequire(wt + "/package.json")("yaml");
const git = (...a) => execFileSync("git", ["-C", wt, ...a], { encoding: "utf8", maxBuffer: 1 << 26 });
const sha = git("rev-parse", "--short", ref).trim();
const files = git("diff", "--name-only", `origin/main...${ref}`, "--", "course/topics").trim().split("\n").filter(Boolean).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (xs) => new Map((xs ?? []).map((x) => [x.id, x]));
let md = `# ${id} persona input, from ${ref} (commit ${sha})\n\nUp to 5 questions per Topic, all rewritten ones first. REWRITTEN = changed in this PR (vs origin/main); UNCHANGED = filler. Changed Checks and Cases follow each Topic's questions. Quiz items from the Question Bank (bank:eab:*) live in the database and are not shown. "<- RIGHT" marks the answer; the app shuffles choice order per Learner.\n`;
let nq = 0;
for (const f of files) {
  const cur = YAML.parse(git("show", `${ref}:${f}`));
  let base = {};
  try { base = YAML.parse(git("show", `origin/main:${f}`)); } catch {}
  const bq = byId(base.questions), qs = cur.questions ?? [];
  const rw = qs.filter((q) => !same(bq.get(q.id), q)), un = qs.filter((q) => same(bq.get(q.id), q));
  const pick = [...rw.map((q) => [q, true]), ...un.map((q) => [q, false])].slice(0, Math.max(5, rw.length));
  nq += rw.length;
  md += `\n## ${cur.id ?? f} (${rw.length} rewritten questions)\n`;
  for (const [q, isRw] of pick) {
    md += `\n### ${q.id} [${isRw ? "REWRITTEN" : "UNCHANGED"}]\n${String(q.prompt ?? "").trim()}\n`;
    for (const c of q.choices ?? []) md += `- ${c.id}) ${c.text}${c.id === q.answer ? "  <- RIGHT" : ""}${c.mistake?.fix ? `   [fix: ${c.mistake.fix}]` : ""}\n`;
    md += `Explanation: ${String(q.explanation ?? "").trim()}\n`;
  }
  const bc = byId(base.checks);
  for (const c of (cur.checks ?? []).filter((c) => c.kind !== "quiz" && !same(bc.get(c.id), c))) {
    md += `\n### Check ${c.id} (${c.kind}) [REWRITTEN]\n${String(c.prompt ?? "").trim()}\n`;
    if (c.passCriteria) md += `Pass criteria: ${typeof c.passCriteria === "string" ? c.passCriteria.trim() : JSON.stringify(c.passCriteria)}\n`;
  }
  const bk = byId(base.cases);
  for (const c of (cur.cases ?? []).filter((c) => !same(bk.get(c.id), c))) {
    md += `\n### Case ${c.id} [REWRITTEN]\nStory: ${String(c.story ?? "").trim()}\n`;
    if (c.reveal) md += `Reveal: ${String(c.reveal).trim()}\n`;
  }
}
fs.writeFileSync(out, md);
console.log(`${id} ${sha}: ${files.length} topics, ${nq} rewritten questions -> ${out}`);
