import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chromeExecutable } from "./e2e-browser";

const CHROME = "/usr/bin/google-chrome";
const BUNDLED = "/opt/pw-browsers/chromium-1248/chrome-linux64/chrome";

/** A fake file system: only the paths named here exist. */
const installed = (...paths: string[]) => {
  const there = new Set(paths);
  return (path: string) => there.has(path);
};

describe("chromeExecutable [S3]", () => {
  it("the test bed uses Playwright's Chromium unless only CHROME_PATH's browser is there", () => {
    expect(chromeExecutable({}, BUNDLED, installed())).toBeUndefined();
    expect(chromeExecutable({ CHROME_PATH: "" }, BUNDLED, installed())).toBeUndefined();
    expect(chromeExecutable({ CHROME_PATH: CHROME }, BUNDLED, installed(BUNDLED, CHROME))).toBeUndefined();
    expect(chromeExecutable({ CHROME_PATH: CHROME }, BUNDLED, installed(CHROME))).toBe(CHROME);
    expect(chromeExecutable({ CHROME_PATH: CHROME }, undefined, installed(CHROME))).toBe(CHROME);
    const neither = () => chromeExecutable({ CHROME_PATH: CHROME }, BUNDLED, installed());
    expect(neither).toThrow("CHROME_PATH");
    expect(neither).toThrow("npx playwright install chromium");
  });
});

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("the test bed's launch [S7]", () => {
  it("the config and the global setup launch the same browser", () => {
    const config = read("playwright.config.ts");
    expect(config).toContain("chromeExecutable(process.env, chromium.executablePath(), existsSync)");
    expect(config).toContain("launchOptions: { executablePath }");
    const setup = read("e2e/support/global-setup.ts");
    expect(setup).toMatch(/chromium\.launch\(\s*launchOptions\s*\)/);
    expect(setup).not.toMatch(/chromium\.launch\(\s*\)/);
  });
});
