import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDocsOnly, isDocsPath } from "../../scripts/ci-changes.mjs";

describe("isDocsOnly: may CI skip the heavy jobs for this PR?", () => {
  it("is true when the PR changes only docs: ADRs, specs and top-level notes", () => {
    expect(isDocsOnly(["docs/adr/0017-clerk-replaces-better-auth.md", "docs/specs/value-it-signal-spec.md", "GLOSSARY.md", "CLAUDE.md"])).toBe(true);
  });

  it("is false as soon as one changed file is code", () => {
    expect(isDocsOnly(["docs/adr/0017-clerk-replaces-better-auth.md", "src/proxy.ts"])).toBe(false);
  });

  it("is false for docs a check or a test reads: the Course Map doc and the critics' briefs and Spine log", () => {
    expect(isDocsOnly(["docs/course-map.md"])).toBe(false);
    expect(isDocsOnly(["docs/critics/math-police.md"])).toBe(false);
    expect(isDocsOnly(["docs/critics/spine-log.yaml"])).toBe(false);
  });

  it("is false for Markdown inside code folders, such as a test fixture or a Topic", () => {
    expect(isDocsOnly(["src/behaviour/tutor-eval/fixtures/untaught-skill/docs/skill.md"])).toBe(false);
    expect(isDocsOnly(["course/topics/notes.md"])).toBe(false);
  });

  it("is false for anything under .github/workflows, but true for issue and PR templates", () => {
    expect(isDocsOnly([".github/workflows/ci.yml"])).toBe(false);
    expect(isDocsOnly([".github/workflows/README.md"])).toBe(false);
    expect(isDocsOnly([".github/dependabot.yml"])).toBe(false);
    expect(isDocsOnly([".github/ISSUE_TEMPLATE/bug.yml", ".github/pull_request_template.md", "LICENSE"])).toBe(true);
  });

  it("is false for an empty list: when in doubt, run everything", () => {
    expect(isDocsOnly([])).toBe(false);
    expect(isDocsOnly([""])).toBe(false);
  });
});

describe("node scripts/ci-changes.mjs: what CI's `changes` job writes to $GITHUB_OUTPUT", () => {
  // The workflow runs the script exactly like this: the changed paths on stdin, one per line.
  const classify = (changed: string) => {
    const run = spawnSync(process.execPath, ["scripts/ci-changes.mjs"], { input: changed, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    return run.stdout;
  };

  it("prints code=false when the PR changes only docs", () => {
    expect(classify("docs/adr/0017-clerk-replaces-better-auth.md\nGLOSSARY.md\n")).toBe("code=false\n");
  });

  it("prints code=true when one changed file is code", () => {
    expect(classify("docs/ci.md\nsrc/proxy.ts\n")).toBe("code=true\n");
  });

  it("prints code=true when no changed files are listed", () => {
    expect(classify("")).toBe("code=true\n");
  });
});

/**
 * Paths under docs/ that code names but CI never reads, so a docs-only PR may change them. Each needs a reason.
 */
const NAMED_BUT_NOT_READ_IN_CI: Record<string, string> = {
  "docs/specs/img/": "e2e specs write evidence screenshots there; nothing compares them",
  "docs/research": "only scripts/dev-verify-to-blocks.mjs reads it, a dev tool CI never runs",
};

/** Every docs/ path named in a string in src/, scripts/ or e2e/: "docs/a/b" or join(..., "docs", "a", "b"). */
function docsPathsNamedInCode(): { file: string; path: string }[] {
  const found: { file: string; path: string }[] = [];
  // These name made-up docs paths as test data: the classifier itself, its tests, and the classify step's scratch repo.
  const skip = new Set(["src/dev/ci-changes.test.ts", "scripts/ci-changes.mjs", "src/dev/ci-workflow.test.ts"]);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : /\.(ts|tsx|mjs|cjs|js)$/.test(entry.name) ? [path] : [];
    });
  for (const file of ["src", "scripts", "e2e"].flatMap(walk)) {
    if (skip.has(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/["'`](docs\/[^"'`\s$]*)/g)) found.push({ file, path: m[1] });
    for (const m of text.matchAll(/["'`]docs["'`]((?:\s*,\s*["'`][^"'`]+["'`])+)/g)) {
      const parts = [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((part) => part[1]);
      found.push({ file, path: ["docs", ...parts].join("/") });
    }
  }
  return found;
}

describe("the docs-only list keeps up with the code", () => {
  it("finds the docs paths the code names (the scan works)", () => {
    const paths = docsPathsNamedInCode().map((ref) => ref.path);
    expect(paths).toContain("docs/course-map.md");
    expect(paths).toContain("docs/critics");
  });

  it("counts every docs file or folder that code reads as code, unless it is listed as not read in CI", () => {
    const missed = docsPathsNamedInCode().filter(({ path }) => {
      if (Object.keys(NAMED_BUT_NOT_READ_IN_CI).some((named) => path.startsWith(named))) return false;
      // A file must count as code itself; a folder must make every file in it count as code.
      return /\.[a-z]+$/i.test(path) ? isDocsPath(path) : isDocsPath(`${path}/any.md`);
    });
    expect(missed, "add these to DOCS_READ_BY_CODE in scripts/ci-changes.mjs, or to NAMED_BUT_NOT_READ_IN_CI with a reason").toEqual([]);
  });
});
