import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** The CI job's promises, read from its file: when it runs, that it never blocks or cancels, and where the key comes from. */
const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "tutor-eval.yml"), "utf8");
/** The workflow without its comments, which name the triggers it must never use. */
const code = workflow.replace(/^\s*#.*$/gm, "");
const ci = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
type Job = { name?: string; if?: string; env?: Record<string, string>; permissions?: Record<string, string>; steps?: { run?: string; env?: Record<string, string> }[] };
const jobs: Record<string, Job> = parse(workflow).jobs;

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

  it("reads the key from the repository secret and gives it only to the step that runs the tests", () => {
    const evalJob = jobs["tutor-eval"];
    expect(evalJob.env?.OPENAI_API_KEY).toBeUndefined();
    const withKey = (evalJob.steps ?? []).filter((step) => step.env?.OPENAI_API_KEY);
    expect(withKey.map((step) => step.env?.OPENAI_API_KEY)).toEqual(["${{ secrets.OPENAI_API_KEY }}"]);
    expect(withKey[0].run).toContain("npm run tutor:eval");
  });

  it("without the key, skips the eval job (skipped, not passed) and says so in a notice and the run's summary", () => {
    expect(jobs["tutor-eval"].if).toBe("needs.key.outputs.present == 'true'");
    const check = jobs.key.steps?.[0].run ?? "";
    expect(jobs.key.steps?.[0].env?.OPENAI_API_KEY).toBe("${{ secrets.OPENAI_API_KEY }}");
    expect(check).toMatch(/::notice title=Tutor eval skipped::skipped: no OPENAI_API_KEY/);
    expect(check).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });

  it("posts its summary as a PR comment, with write access to PRs in that job only", () => {
    expect(jobs["tutor-eval"].permissions?.["pull-requests"]).toBe("write");
    expect(parse(workflow).permissions).toEqual({ contents: "read" });
    expect(code).toContain("gh pr comment");
  });

  it("is not one of the required jobs, which stay check, build and ui in ci.yml", () => {
    for (const [id, job] of Object.entries(jobs)) expect(["check", "build", "ui"]).not.toContain(job.name ?? id);
    expect(Object.keys(parse(ci).jobs)).toEqual(expect.arrayContaining(["check", "build", "ui"]));
    expect(ci).not.toMatch(/tutor-eval/);
  });
});
