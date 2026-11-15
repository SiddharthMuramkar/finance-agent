import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The CI workflow's contract (docs/ci.md): the ruleset on main and Vercel's Deployment Checks wait for checks named
 * exactly `check`, `build` and `ui`, and each must stand for every real job before it.
 */
type Step = { run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { name?: string; needs?: string | string[]; if?: string; strategy?: { matrix?: { shard?: number[] } }; env?: Record<string, string>; steps?: Step[] };
type Workflow = { jobs: Record<string, Job> };

const WORKFLOWS = join(process.cwd(), ".github", "workflows");
const read = (file: string): Workflow => parse(readFileSync(join(WORKFLOWS, file), "utf8"));
const ci = read("ci.yml");
const needs = (job: Job) => (Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : []);
const runs = (job: Job) => (job.steps ?? []).map((step) => step.run ?? "").join("\n");

const REQUIRED = { check: ["static", "vitest"], build: ["next-build"], ui: ["ui-shard"] } as const;

describe("the required checks check, build and ui", () => {
  it("each runs after the real jobs it stands for, even when one failed (if: always())", () => {
    for (const [check, jobs] of Object.entries(REQUIRED)) {
      expect(ci.jobs[check], check).toBeDefined();
      expect(ci.jobs[check].name ?? check).toBe(check);
      expect(ci.jobs[check].if).toBe("always()");
      expect(needs(ci.jobs[check]).sort()).toEqual(["changes", ...jobs].sort());
    }
  });

  it("together stand for every other job, so no job can fail without turning a required check red", () => {
    const covered = new Set(Object.values(REQUIRED).flat());
    const others = Object.keys(ci.jobs).filter((id) => !(id in REQUIRED) && id !== "changes");
    expect(others.filter((id) => !covered.has(id as never))).toEqual([]);
  });

  it("are not also job names in another workflow, where a same-named check could stand in for them", () => {
    for (const file of readdirSync(WORKFLOWS).filter((f) => f !== "ci.yml")) {
      for (const [id, job] of Object.entries(read(file).jobs)) {
        expect(Object.keys(REQUIRED), `${file}: ${id}`).not.toContain(job.name ?? id);
      }
    }
  });

  it("every real job runs only when the PR changes code, and so needs `changes`", () => {
    for (const id of Object.values(REQUIRED).flat()) {
      expect(needs(ci.jobs[id]), id).toContain("changes");
      expect(ci.jobs[id].if, id).toBe("needs.changes.outputs.code == 'true'");
    }
  });
});

describe("the gate script the three checks share", () => {
  const gate = ci.jobs.check.steps?.[0].run ?? "";
  const exitCode = (CODE: string, RESULTS: string) => spawnSync("bash", ["-e", "-c", gate], { env: { ...process.env, CODE, RESULTS } }).status;

  it("is the same script in check, build and ui", () => {
    expect(gate).toContain("for pair in $RESULTS");
    expect(ci.jobs.build.steps?.[0].run).toBe(gate);
    expect(ci.jobs.ui.steps?.[0].run).toBe(gate);
  });

  it("passes when every job passed", () => {
    expect(exitCode("true", "changes=success static=success vitest=success")).toBe(0);
  });

  it("passes when the jobs were skipped on a docs-only PR", () => {
    expect(exitCode("false", "changes=success static=skipped vitest=skipped")).toBe(0);
  });

  it("fails when a job was skipped although the PR changes code", () => {
    expect(exitCode("true", "changes=success static=skipped vitest=success")).toBe(1);
  });

  it("fails when a job failed or was cancelled", () => {
    expect(exitCode("true", "changes=success static=success vitest=failure")).toBe(1);
    expect(exitCode("true", "changes=success ui-shard=cancelled")).toBe(1);
  });

  it("fails when `changes` itself failed, though everything after it was skipped", () => {
    expect(exitCode("", "changes=failure static=skipped vitest=skipped")).toBe(1);
  });
});

describe("the jobs run all of `npm run check`", () => {
  it("runs each part of the script: the tests in the vitest shards, the rest in static", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const parts: string[] = pkg.scripts.check.split("&&").map((part: string) => part.trim());
    expect(parts).toContain("npm run test");
    for (const part of parts) {
      if (part === "npm run test") expect(runs(ci.jobs.vitest)).toMatch(/npm test -- --shard=\$\{\{ matrix\.shard \}\}\/\d+/);
      else expect(runs(ci.jobs.static).split("\n"), part).toContain(part);
    }
  });
});

describe("shard counts agree", () => {
  it("vitest: --shard=i/N with N the number of matrix shards", () => {
    const shards = ci.jobs.vitest.strategy?.matrix?.shard ?? [];
    expect(runs(ci.jobs.vitest)).toContain(`--shard=\${{ matrix.shard }}/${shards.length}`);
    expect(ci.jobs.vitest.name).toBe(`vitest \${{ matrix.shard }}/${shards.length}`);
  });

  it("ui: --shard=i/N and one PWTEST_SHARD_WEIGHTS weight per shard", () => {
    const job = ci.jobs["ui-shard"];
    const shards = job.strategy?.matrix?.shard ?? [];
    expect(runs(job)).toContain(`--shard=\${{ matrix.shard }}/${shards.length}`);
    expect(job.name).toBe(`ui shard \${{ matrix.shard }}/${shards.length}`);
    expect(job.env?.PWTEST_SHARD_WEIGHTS.split(":").map(Number).filter((w) => w > 0)).toHaveLength(shards.length);
  });
});

describe("one Node version everywhere", () => {
  it("every setup-node reads .nvmrc, and .nvmrc names the major version package.json's engines allows", () => {
    const nvmrc = readFileSync(join(process.cwd(), ".nvmrc"), "utf8").trim();
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.engines.node).toBe(`${nvmrc}.x`);
    for (const file of readdirSync(WORKFLOWS)) {
      for (const [id, job] of Object.entries(read(file).jobs)) {
        for (const step of job.steps ?? []) {
          if (step.uses?.startsWith("actions/setup-node@")) expect(step.with, `${file}: ${id}`).toMatchObject({ "node-version-file": ".nvmrc" });
        }
      }
    }
  });
});
