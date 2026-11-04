import { execFile } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Case T8: the course check passes on the repo, and fails on the fixture whose Check tests a Skill no card teaches.
const check = (cwd: string) =>
  new Promise<{ passed: boolean; output: string }>((resolve) => {
    execFile(process.execPath, [join(process.cwd(), "scripts", "check-course.mjs")], { cwd }, (err, stdout, stderr) => resolve({ passed: !err, output: `${stdout}${stderr}` }));
  });

describe("the untaught-skill fixture", () => {
  it("fails the course check and names L1", async () => {
    const result = await check(join(process.cwd(), "src", "behaviour", "tutor-eval", "fixtures", "untaught-skill"));
    expect(result.passed).toBe(false);
    expect(result.output).toMatch(/\bL1\b/);
  }, 30_000);
});
