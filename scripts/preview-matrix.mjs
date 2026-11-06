#!/usr/bin/env node
// F1's preview matrix (spec 2026-11-05, ticket F1). Runs e2e/matrix.spec.ts in the browser test bed (UI_MATRIX=1) and
// prints one line per cell plus every failing number. Screenshots land in evidence/preview-matrix/<project>/<page>.png
// and the numbers in evidence/preview-matrix/<project>/cells.json (both git-ignored).
//   node scripts/preview-matrix.mjs [--project mbp14[,mbp14-dark,...]] [--port 3100]
// Default: all 8 projects. Never point it at production: it starts its own dev server on an in-memory PGlite.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const projects = (flag("project", "mbp14,mbp14-dark,w1280,w1280-dark,w1920,w1920-dark,w1024,w1024-dark")).split(",");
const port = flag("port", process.env.E2E_PORT ?? "3100");
const root = process.cwd();

// The spec empties each project folder before it shoots, and anything older than this run is reported, never counted.
const started = Date.now() - 1000;
const run = spawnSync("npx", ["playwright", "test", "e2e/matrix.spec.ts", ...projects.flatMap((p) => ["--project", p])], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, UI_MATRIX: "1", E2E_PORT: String(port) },
});

let cells = 0, shots = 0;
const problems = [];
for (const project of projects) {
  const file = join(root, "evidence/preview-matrix", project, "cells.json");
  if (!existsSync(file)) { problems.push(`${project}: no cells.json (this run did not finish its cells)`); continue; }
  if (statSync(file).mtimeMs < started) { problems.push(`${project}: cells.json is from an earlier run, not counted`); continue; }
  for (const r of JSON.parse(readFileSync(file, "utf8")).cells) {
    cells++;
    const shot = join(root, r.file);
    if (existsSync(shot) && statSync(shot).mtimeMs >= started) shots++;
    const l = r.layout;
    console.log(`${r.cell.padEnd(34)} gutters ${l?.gutterLeft}/${l?.gutterRight} header ${l?.headerHeight} panel% ${l?.panelWidthPct} chars/line ${l?.charsPerLine} scroll ${l?.horizontalScroll} tab ${r.focus?.stops ?? "-"} stops, ${r.focus?.withoutRing.length ?? "-"} without ring${r.accents ? ` accents ${r.accents.length} [${r.accents.join(",")}]` : ""}${r.error ? ` ERROR ${r.error}` : ""}`);
  }
}
console.log(`\n${cells} cells measured, ${shots} screenshots, ${projects.length} projects.`);
for (const p of problems) console.log(p);
process.exit(problems.length ? 1 : (run.status ?? 1));
