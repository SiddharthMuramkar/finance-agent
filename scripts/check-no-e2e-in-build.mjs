// scripts/check-no-e2e-in-build.mjs
// The browser test bed (spec 2026-11-05, T-00) must never reach a production build. Run after `next build`:
//   node scripts/check-no-e2e-in-build.mjs [buildDir=.next]
// Fails (exit 1, naming each file) when
//   - any server trace file (server/**/*.nft.json) lists @electric-sql (PGlite would ship), or
//   - any server file builds the test database: assigns globalThis.__faE2eDb. Only src/dev/e2e-db.ts does that, and
//     src/instrumentation.ts loads it behind a NODE_ENV test the build removes. getDb() (src/db/client.ts) only reads
//     the name, so a read is allowed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? '.next';
const server = join(root, 'server');

function* files(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const SETS_TEST_DB = /__faE2eDb\s*=(?!=)/;
const leaks = [];
let seen = 0;
for (const path of files(server)) {
  seen++;
  const rel = relative(server, path);
  if (path.endsWith('.nft.json')) {
    if (readFileSync(path, 'utf8').includes('@electric-sql')) leaks.push(`${rel}: traces @electric-sql (PGlite) into the build`);
  } else if (/\.(c|m)?js$/.test(path)) {
    if (SETS_TEST_DB.test(readFileSync(path, 'utf8'))) leaks.push(`${rel}: builds the test database (assigns __faE2eDb)`);
  }
}

if (!seen) {
  console.error(`check-no-e2e-in-build: no files under ${server}. Run it after next build.`);
  process.exit(1);
}
if (leaks.length) {
  console.error(`check-no-e2e-in-build: the browser test bed leaked into the production build:\n${leaks.map((l) => `  - ${l}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-no-e2e-in-build: ${seen} server files, no test bed in the build.`);
