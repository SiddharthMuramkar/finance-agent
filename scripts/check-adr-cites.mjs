// scripts/check-adr-cites.mjs
// Every ADR cite in the repo points at a record that exists (issue #31). Run: node scripts/check-adr-cites.mjs [repoDir=.]
// Reads every file git tracks and fails (exit 1, naming each file and line) when
//   - a cite ("ADR NNNN", "ADRs NNNN and NNNN", "ADR NNNN/NNNN") names a number with no docs/adr/NNNN-*.md,
//   - a path docs/adr/NNNN-name.md names a record file that does not exist (an archived file name, say), or
//   - docs/adr/README.md, the index, has no line for a record.
// A number after "archived" or "old" means the earlier ADR set, which is not in the repo, so it is skipped.
// This checks numbers only. A cite whose number exists but whose record does not state the rule passes: read the
// record. A branch cut before #34 may still use an archived number that now names a different record.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const adrDir = join(repo, 'docs/adr');
const records = readdirSync(adrDir).filter((f) => /^\d{4}-.*\.md$/.test(f));
const numbers = new Set(records.map((f) => f.slice(0, 4)));
const sorted = [...numbers].sort();

const SKIP = /package-lock\.json$|\.(png|jpe?g|webp|ico|gif|woff2?|xlsx|pdf|zip|gz)$/;
const tracked = execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter((f) => f && !SKIP.test(f));

// "ADR NNNN", "ADR-NNNN", "ADRs NNNN, NNNN and NNNN", "ADR NNNN/NNNN", "ADR NNNN's".
const CITE = /\bADRs?\b[ -]*((?:\d{4}(?:'s)?(?:[ ,]*(?:and|or|&|,|\/|–|-)?[ ]*)?)+)/g;
const ARCHIVED = /(archived|old)\s*$/i;

const problems = [];
let cites = 0;
for (const file of tracked) {
  let text;
  try { text = readFileSync(join(repo, file), 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(CITE)) {
      if (ARCHIVED.test(line.slice(Math.max(0, m.index - 12), m.index))) continue;
      for (const n of m[1].match(/\d{4}/g) ?? []) {
        cites++;
        if (!numbers.has(n)) problems.push(`${file}:${i + 1}: cites ADR ${n}, which has no record in docs/adr/`);
      }
    }
    for (const m of line.matchAll(/docs\/adr\/(\d{4}-[\w.-]*?\.md)/g)) {
      cites++;
      if (!records.includes(m[1])) problems.push(`${file}:${i + 1}: links ${m[0]}, which does not exist`);
    }
  });
}

const index = readFileSync(join(adrDir, 'README.md'), 'utf8');
for (const record of records) if (!index.includes(`(${record})`)) problems.push(`docs/adr/README.md: no line for ${record}`);

if (problems.length) {
  console.error(`check-adr-cites: ${problems.length} problem(s). The ADRs are ${sorted.join(', ')}.\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`check-adr-cites: ${cites} cites in ${tracked.length} tracked files, all point at ADRs ${sorted.at(0)}-${sorted.at(-1)}.`);
