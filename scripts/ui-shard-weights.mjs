// scripts/ui-shard-weights.mjs
// Suggests PWTEST_SHARD_WEIGHTS for the ui shards in .github/workflows/ci.yml, from real test times.
//   node scripts/ui-shard-weights.mjs [--shards 6] <run-id> [<run-id> ...]
// Needs `gh`, logged in. A run id is the number in a CI run's URL (.../actions/runs/<run-id>); give 2 to 4 recent runs.
//
// Playwright (1.64) splits the tests by count, not time: in config order (project, then file), each shard takes the share
// of the tests its weight gives it, and a file goes whole to the shard where it starts. A test's time depends a lot on
// its project (the Study Workspace tests run at full length at mbp14 and skip at once at most other widths), so equal
// counts make unequal shards. This script reads each test's time from the shard logs of the runs given, lists today's
// tests (`playwright test --list`), and prints the weights that make the slowest shard as short as it can be.
// Tests it has no time for (new ones) count at their project's average.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const TEST_LINE = /(✓|✘|-)\s+\d+\s+\[([^\]]+)\]\s+›\s+(\S+?):(\d+):\d+\s+›.*?(?:\((\d+(?:\.\d+)?)(ms|s|m)\))?\s*$/;
const UNIT = { ms: 0.001, s: 1, m: 60 };

/** Each test result line of a ui shard's log (the list reporter): project, file, line and seconds (0 when skipped). */
export function parseShardLog(text) {
  const results = [];
  for (const raw of text.split("\n")) {
    const m = raw.replace(/\x1b\[[0-9;]*m/g, "").match(TEST_LINE);
    if (!m) continue;
    const [, , project, file, line, value, unit] = m;
    results.push({ project, file, line: Number(line), seconds: value ? Number(value) * UNIT[unit] : 0 });
  }
  return results;
}

/**
 * The seconds each shard gets, split exactly as Playwright's filterForShard does: `groups` are the test files per project
 * in run order, each with `count` (its tests that are not skipped up front) and `seconds`.
 */
export function shardTimes(groups, weights) {
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const sizes = weights.map((w) => Math.floor((w * total) / totalWeight));
  const remainder = total - sizes.reduce((sum, s) => sum + s, 0);
  for (let i = 0; i < remainder; i++) sizes[i % sizes.length]++;
  const times = weights.map(() => 0);
  let position = 0;
  for (const group of groups) {
    const start = group.count ? position : Math.max(position - 1, 0);
    let from = 0;
    for (let shard = 0; shard < sizes.length; shard++) {
      if (start >= from && start < from + sizes[shard]) times[shard] += group.seconds;
      from += sizes[shard];
    }
    position += group.count;
  }
  return times;
}

/** Weights (test counts per shard) that make the slowest of `shards` shards as short as a split at file starts allows. */
export function bestWeights(groups, shards) {
  const cut = (limit) => {
    const counts = [0];
    let time = 0;
    for (const group of groups) {
      if (time + group.seconds > limit && counts[counts.length - 1] > 0) {
        counts.push(0);
        time = 0;
      }
      counts[counts.length - 1] += group.count;
      time += group.seconds;
    }
    return counts;
  };
  let low = Math.max(0, ...groups.map((g) => g.seconds));
  let high = groups.reduce((sum, g) => sum + g.seconds, 0);
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (cut(mid).length <= shards) high = mid;
    else low = mid;
  }
  const counts = cut(high);
  while (counts.length < shards) counts.push(0);
  return counts;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, CI: "1" } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}

/** Today's tests, as Playwright groups them for sharding: one group per project and file, in run order. */
function listGroups() {
  const report = JSON.parse(run("npx", ["playwright", "test", "--list", "--reporter=json"]));
  const byProject = new Map(report.config.projects.map((p) => [p.name, new Map()]));
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const files = byProject.get(test.projectName);
        const file = `e2e/${spec.file}`;
        if (!files.has(file)) files.set(file, []);
        files.get(file).push({ line: spec.line, skipped: test.expectedStatus === "skipped" });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites) walk(suite);
  return [...byProject].flatMap(([project, files]) =>
    [...files.keys()].sort((a, b) => a.localeCompare(b)).map((file) => ({ project, file, tests: files.get(file) })),
  );
}

function main(argv) {
  const at = argv.indexOf("--shards");
  const shards = at >= 0 ? Number(argv[at + 1]) : 6;
  const runs = argv.filter((arg, i) => /^\d+$/.test(arg) && !(at >= 0 && i === at + 1));
  if (!runs.length) throw new Error("Give at least one CI run id: node scripts/ui-shard-weights.mjs <run-id> ...");

  const seconds = new Map();
  for (const id of runs) {
    const jobs = JSON.parse(run("gh", ["run", "view", id, "--json", "jobs"])).jobs.filter((job) => job.name.startsWith("ui shard"));
    for (const job of jobs) {
      for (const r of parseShardLog(run("gh", ["run", "view", "--job", String(job.databaseId), "--log"]))) {
        const key = `${r.project}|${r.file}|${r.line}`;
        seconds.set(key, [...(seconds.get(key) ?? []), r.seconds]);
      }
    }
  }
  const average = (list) => list.reduce((sum, s) => sum + s, 0) / list.length;
  const known = new Map([...seconds].map(([key, list]) => [key, average(list)]));
  const projectAverage = new Map();
  for (const [key, s] of known) {
    const project = key.split("|")[0];
    projectAverage.set(project, [...(projectAverage.get(project) ?? []), s]);
  }

  let guessed = 0;
  const groups = listGroups().map(({ project, file, tests }) => ({
    count: tests.filter((t) => !t.skipped).length,
    seconds: tests.reduce((sum, t) => {
      const s = known.get(`${project}|${file}|${t.line}`);
      if (s !== undefined) return sum + s;
      guessed++;
      return sum + (projectAverage.has(project) ? average(projectAverage.get(project)) : 0);
    }, 0),
  }));

  const total = groups.reduce((sum, g) => sum + g.seconds, 0);
  const weights = bestWeights(groups, shards);
  const show = (times) => times.map((t) => `${Math.round(t)}s`).join(" ");
  console.log(`${groups.length} files x projects, ${known.size} test times from ${runs.length} run(s), ${guessed} tests guessed.`);
  console.log(`Test time in all: ${Math.round(total)}s, so ${Math.round(total / shards)}s a shard at best (plus ~1 min of setup each).`);
  const current = process.env.PWTEST_SHARD_WEIGHTS;
  if (current) console.log(`Now   PWTEST_SHARD_WEIGHTS="${current}": ${show(shardTimes(groups, current.split(":").map(Number)))}`);
  console.log(`Suggest PWTEST_SHARD_WEIGHTS="${weights.join(":")}": ${show(shardTimes(groups, weights))}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
