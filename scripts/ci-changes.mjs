// scripts/ci-changes.mjs
// Decides whether a pull request changes code or only docs, so CI (.github/workflows/ci.yml, job `changes`) can skip
// the heavy jobs on a docs-only PR. The required checks `check`, `build` and `ui` still report, green, either way.
//   git diff --name-only --no-renames <base> <head> | node scripts/ci-changes.mjs
// prints `code=true` or `code=false` (the format of $GITHUB_OUTPUT) and says why on stderr.
//
// Docs-only means every changed file is documentation that no check, test or build reads. Anything else is code, and
// so is an empty list: when in doubt, run everything. A wrong "docs-only" merges a change no test has seen, so the
// patterns are narrow on purpose; src/dev/ci-changes.test.ts fails when code starts to read a docs file not listed below.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Docs that a check or a test reads, so a change to them is a code change. */
export const DOCS_READ_BY_CODE = [
  // npm run course:check keeps it equal to course/outline.yaml (scripts/check-course.mjs, satyam-links-sources.test.ts).
  "docs/course-map.md",
  // The critics' briefs and the Spine log (src/dev/critics.test.ts, src/course/critics-log.ts).
  "docs/critics/",
];

const DOCS = [
  /^[^/]+\.md$/, // top-level notes: README.md, CLAUDE.md, GLOSSARY.md, AGENTS.md
  // ADRs, specs, guides and their pictures. Not any file under docs/: tsconfig includes **/*.ts wherever it is, so a
  // .ts there is type-checked and built.
  /^docs\/.+\.(md|png|jpe?g|gif|svg|webp)$/i,
  /^LICEN[CS]E(\.[a-z]+)?$/i,
  /^\.github\/(ISSUE_TEMPLATE\/|PULL_REQUEST_TEMPLATE\/|pull_request_template\.md$)/i,
];

/** True when this one path is documentation that nothing in CI reads. */
export function isDocsPath(path) {
  if (DOCS_READ_BY_CODE.some((read) => (read.endsWith("/") ? path.startsWith(read) : path === read))) return false;
  return DOCS.some((pattern) => pattern.test(path));
}

/** True when the PR changes only docs, so nothing it touches can fail a check, a test or the build. */
export function isDocsOnly(paths) {
  const changed = paths.map((path) => path.trim()).filter(Boolean);
  return changed.length > 0 && changed.every(isDocsPath);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const changed = readFileSync(0, "utf8").split("\n").map((path) => path.trim()).filter(Boolean);
  const docsOnly = isDocsOnly(changed);
  const code = changed.filter((path) => !isDocsPath(path));
  console.error(
    docsOnly
      ? `ci-changes: docs-only (${changed.length} files), so the heavy jobs are skipped.`
      : changed.length
        ? `ci-changes: code changed (${code.length} of ${changed.length} files, first: ${code[0]}), so every job runs.`
        : "ci-changes: no changed files listed, so every job runs.",
  );
  console.log(`code=${!docsOnly}`);
}
