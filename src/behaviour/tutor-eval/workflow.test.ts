import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The CI job's promises, read from its file: when it runs, that it never blocks or cancels, and where the key comes from. */
const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "tutor-eval.yml"), "utf8");
/** The workflow without its comments, which name the triggers it must never use. */
const code = workflow.replace(/^\s*#.*$/gm, "");
const ci = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

describe("the tutor-eval CI job", () => {
  it("runs on pull requests only, never on pull_request_target or workflow_run, and only for the listed paths", () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {4}paths:/m);
    expect(code).not.toMatch(/pull_request_target|workflow_run/);
    for (const path of ["src/tutor/instructions.ts", "src/tutor/context.ts", "src/tutor/check-results.ts", "src/tutor/chips.ts", "course/topics/**", "src/behaviour/tutor-eval/**"])
      expect(workflow).toContain(`- ${path}`);
  });

  it("has its own concurrency group that never cancels a paid run", () => {
    expect(workflow).toMatch(/group: tutor-eval-\$\{\{ github\.event\.pull_request\.number \}\}\n {2}cancel-in-progress: false/);
  });

  it("reads the key from the repository secret, skips and says so without it, and posts its summary", () => {
    expect(workflow).toContain("ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}");
    expect(workflow).toMatch(/if: env\.ANTHROPIC_API_KEY == ''\n\s+run: \|\n\s+echo "No ANTHROPIC_API_KEY secret/);
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("gh pr comment");
    expect(workflow).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });

  it("is not one of the required jobs, which stay check and build in ci.yml", () => {
    expect(workflow).toMatch(/^jobs:\n {2}tutor-eval:/m);
    expect(ci).toMatch(/"check" and "build", are the required status checks/);
  });
});
