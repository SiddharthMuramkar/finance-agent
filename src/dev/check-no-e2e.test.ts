import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/check-no-e2e-in-build.mjs");
const made: string[] = [];

/** A fake build folder with these files under `server/`. */
function build(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fa-e2e-leak-"));
  made.push(dir);
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, "server", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return dir;
}

const run = (dir: string) => spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });

describe("scripts/check-no-e2e-in-build.mjs", () => {
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("the build check catches a leak", () => {
    const leak = build({
      "app/study/page.js.nft.json": JSON.stringify({ version: 1, files: ["../../../node_modules/@electric-sql/pglite/x.js"] }),
      "app/study/page.js": "export {}",
    });
    const bad = run(leak);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("app/study/page.js.nft.json");

    const clean = build({
      "app/study/page.js.nft.json": JSON.stringify({ version: 1, files: ["../../../node_modules/@neondatabase/serverless/index.js"] }),
      "app/study/page.js": "const db = globalThis.__faE2eDb;",
    });
    expect(run(clean).status).toBe(0);
  });

  it("catches the test database being built into a server file", () => {
    const leak = build({ "chunks/abc.js": "globalThis.__faE2eDb = db;" });
    const bad = run(leak);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("chunks/abc.js");
  });
});
