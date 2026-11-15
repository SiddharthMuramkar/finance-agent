import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/check-adr-cites.mjs");
const made: string[] = [];

// Built, not written out: this file is tracked, and the check reads it too, so a literal sample cite of a
// missing record here would fail the check on this repo.
const cite = (n: string) => `ADR ${n}`;
const record = (name: string) => `docs/adr/${name}`;

/** A fake repo with records 0001 and 0002 (indexed in its README), plus these files, all tracked by git. */
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fa-adr-cites-"));
  made.push(dir);
  const all: Record<string, string> = {
    [record("0001-one.md")]: "# One\n",
    [record("0002-two.md")]: "# Two\n",
    [record("README.md")]: "- [0001](0001-one.md): One\n- [0002](0002-two.md): Two\n",
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

const run = (dir?: string) => spawnSync(process.execPath, dir ? [SCRIPT, dir] : [SCRIPT], { encoding: "utf8" });

describe("scripts/check-adr-cites.mjs", () => {
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("fails on a cite of an ADR number that has no record, and names the line", () => {
    const bad = run(repo({ "src/a.ts": `// fine (${cite("0001")})\n// the flat rule (${cite("0019")})\n` }));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("src/a.ts:2");
    expect(bad.stderr).toContain(cite("0019"));
    expect(bad.stderr).not.toContain("src/a.ts:1");

    expect(run(repo({ "src/a.ts": `// fine (${cite("0001")}), and ADRs 0001 and 0002\n` })).status).toBe(0);
  });

  it("checks every number in a list of cites", () => {
    const bad = run(repo({ "src/a.ts": `// ${cite("0001")}/0021 and ${cite("0002")}\n` }));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain(cite("0021"));
  });

  it("skips a number after 'archived' or 'old': it means the earlier ADR set, which is not in the repo", () => {
    const ok = run(repo({ [record("0002-two.md")]: `# Two\n\nWritten new from the archived ${cite("0019")}. Old ${cite("0020")} said so.\n` }));
    expect(ok.stderr).toBe("");
    expect(ok.status).toBe(0);
  });

  it("fails on a path to a record file that does not exist, such as an archived file name", () => {
    const bad = run(repo({ "e2e/a.spec.ts": `// see ${record("0001-one.md")}\n// see ${record("0001-flat-controls-two-modes.md")}\n` }));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("e2e/a.spec.ts:2");
    expect(bad.stderr).toContain(record("0001-flat-controls-two-modes.md"));
    expect(bad.stderr).not.toContain("e2e/a.spec.ts:1");
  });

  it("fails when the index in docs/adr/README.md has no line for a record", () => {
    const bad = run(repo({ [record("0003-three.md")]: "# Three\n" }));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("docs/adr/README.md");
    expect(bad.stderr).toContain("0003-three.md");
  });

  it("passes on this repo", () => {
    const here = run();
    expect(here.stderr).toBe("");
    expect(here.status).toBe(0);
  });
});
