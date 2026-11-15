import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// scripts/setup-sign-in.sh walks the owner through turning both ways in on in production (#6). Its real steps talk to
// Google, Resend and Vercel, so only the steps that call nothing run here; the rest is pinned by its text.

const SCRIPT = "scripts/setup-sign-in.sh";
const text = readFileSync(SCRIPT, "utf8");
const run = (args: string[], input = "") => spawnSync("bash", [SCRIPT, ...args], { cwd: process.cwd(), encoding: "utf8", input });

/** The body of one step function. */
function step(n: number): string {
  const start = text.indexOf(`step_${n}() {`);
  return text.slice(start, text.indexOf("\n}\n", start));
}

describe("scripts/setup-sign-in.sh", () => {
  it("parses, and every repo file it names exists", () => {
    expect(spawnSync("bash", ["-n", SCRIPT]).status).toBe(0);
    for (const path of text.match(/(?:docs|scripts)\/[\w./-]+\.(?:md|mjs|sh)/g) ?? []) expect(existsSync(path), path).toBe(true);
  });

  it("walks 8 steps; skipping the ones that call out, the rest run no migration by hand and leave passcodes alone", () => {
    // Steps 1–4, 6 and 8 skipped; 5 (local .env) and 7 (redeploy) run, each ending on one Enter.
    const answers = ["y", "y", "y", "y", "n", "", "y", "n", "", "y"].join("\n") + "\n";
    const out = run([], answers);
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toContain("Step 8 of 8: Check both ways in and /admin");
    expect(out.stdout).toContain("second Google client");
    expect(out.stdout).toContain("scripts/migrate-on-build.mjs");
    expect(out.stdout).toContain("Passcodes are unchanged");
    expect(text).not.toMatch(/db:migrate|PASSCODE|gh issue close/);
  });

  it("refuses a step number past the last one", () => {
    const out = run(["--from", "9"]);
    expect(out.status).toBe(2);
    expect(out.stderr).toContain("from 1 to 8");
  });

  it("keeps localhost out of the production Google client, which lists exactly the production redirect URI", () => {
    expect(step(1)).not.toMatch(/localhost:\d/);
    expect(text).toContain("PROD_URL=https://www.value-it.xyz\n");
    expect(step(1)).toContain("$PROD_URL/api/auth/callback/google");
  });

  it("opens addresses with macOS's open as well as xdg-open", () => {
    expect(text).toContain('open "$1"');
    expect(text).toContain('xdg-open "$1"');
  });
});
